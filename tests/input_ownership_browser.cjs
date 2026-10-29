const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'test-artifacts', 'input-ownership');
const failures = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, contents) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    if (file.endsWith('index.html')) {
      const source = contents.toString();
      const instrumented = source.replace(
        'function trick(t){',
        'function trick(t){window.__SOL_TEST_TRICKS.push(t);'
      );
      if (instrumented === source) {
        response.writeHead(500).end('Could not instrument trick dispatch for event-level regression checks');
        return;
      }
      contents = Buffer.from(instrumented);
    }
    const type = file.endsWith('.html') ? 'text/html' :
      file.endsWith('.css') ? 'text/css' :
      file.endsWith('.js') ? 'application/javascript' : 'text/plain';
    response.setHeader('Content-Type', type);
    response.end(contents);
  });
});

async function scenario(name, callback) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function openGame(browser, viewport, touch = false) {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
  await page.addInitScript(() => {
    window.__SOL_TEST_TRICKS = [];
    window.__SOL_TEST_CLICKS = [];
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('#buttons button');
      if (button) window.__SOL_TEST_CLICKS.push({ detail: event.detail, action: button.dataset.t });
    });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdn.babylonjs.com/babylon.js', route =>
    route.fulfill({ path: require.resolve('babylonjs'), contentType: 'application/javascript' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__?.inputReady === true, null, { timeout: 30000 });
  return { page, errors };
}

async function reset(page) {
  await page.evaluate(() => {
    document.querySelector('#restart').click();
    const state = window.__SOL_DIAGNOSTICS__.state;
    Object.assign(state, {
      x: 0, z: 0, y: 0, groundY: 0, dir: 0, speed: 0, vy: 0,
      grounded: true, grinding: false, grindCooldown: 0, grindAirborneUntil: 0,
      count: 0, flip: 0, spin: 0, name: '', grabHeld: false, padGrabHeld: false,
      touchGrabHeld: false, grabUntil: 0, pushBurstUntil: 0
    });
  });
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--no-sandbox']
  });

  try {
    const desktop = await openGame(browser, { width: 1280, height: 800 });
    const page = desktop.page;

    await scenario('long-held mouse action does not dispatch twice', async () => {
      await reset(page);
      await page.evaluate(() => {
        window.__SOL_TEST_TRICKS.length = 0;
        window.__SOL_TEST_CLICKS.length = 0;
      });
      const kick = page.locator('[data-t="kick"]');
      const box = await kick.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction(() => window.__SOL_TEST_TRICKS.length === 1, null, { timeout: 2000 });
      await page.waitForTimeout(700);
      await page.mouse.up();
      await page.waitForTimeout(100);
      const result = await page.evaluate(() => ({
        tricks: window.__SOL_TEST_TRICKS,
        clicks: window.__SOL_TEST_CLICKS
      }));
      assert.deepEqual(result.tricks, ['kick'], 'Pointer press and compatibility click must dispatch one trick total');
      assert.equal(result.clicks.length, 1, 'The browser must emit its compatibility click after pointer release');
      assert(result.clicks[0].detail > 0, 'Pointer-generated compatibility click must have nonzero detail');
    });

    await scenario('keyboard activation immediately after pointer remains active', async () => {
      await reset(page);
      await page.evaluate(() => {
        window.__SOL_TEST_TRICKS.length = 0;
        window.__SOL_TEST_CLICKS.length = 0;
      });
      const kick = page.locator('[data-t="kick"]');
      const box = await kick.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => window.__SOL_TEST_TRICKS.length === 1, null, { timeout: 2000 });
      await kick.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__SOL_TEST_TRICKS.length === 2, null, { timeout: 2000 });
      const result = await page.evaluate(() => ({
        tricks: window.__SOL_TEST_TRICKS,
        clicks: window.__SOL_TEST_CLICKS
      }));
      assert.deepEqual(result.tricks, ['kick', 'kick']);
      assert.deepEqual(result.clicks.map(click => click.detail), [1, 0],
        'Keyboard activation must remain distinct from the pointer compatibility click');
    });

    await scenario('Ctrl/Meta/Alt gameplay chords preserve browser shortcuts', async () => {
      const chordFailures = [];
      for (const modifier of ['Control', 'Alt', 'Meta']) {
        for (const key of ['w', 'a', 'd', 'g', 'r', 'Space']) {
          await reset(page);
          await page.evaluate(() => { window.__SOL_TEST_TRICKS.length = 0; });
          const result = await page.evaluate(({ modifier, key }) => {
            const event = new KeyboardEvent('keydown', {
              key: key === 'Space' ? ' ' : key,
              code: key === 'Space' ? 'Space' : `Key${key.toUpperCase()}`,
              bubbles: true,
              cancelable: true,
              ctrlKey: modifier === 'Control',
              altKey: modifier === 'Alt',
              metaKey: modifier === 'Meta'
            });
            window.dispatchEvent(event);
            return {
              defaultPrevented: event.defaultPrevented,
              trickCalls: window.__SOL_TEST_TRICKS.slice(),
              input: window.__SOL_DIAGNOSTICS__.input()
            };
          }, { modifier, key });
          try {
            assert.equal(result.defaultPrevented, false,
              `${modifier}+${key} must not suppress a browser shortcut`);
            assert.deepEqual(result.input.keyboard, { x: 0, y: 0 });
            assert.deepEqual(result.trickCalls, [], `${modifier}+${key} must not dispatch gameplay`);
          } catch (error) {
            chordFailures.push(`${modifier}+${key}: ${error.message}`);
          }
        }
        await page.evaluate(() => {
          window.__realChord = null;
          window.addEventListener('keydown', event => {
            if (event.code === 'KeyG') window.__realChord = event.defaultPrevented;
          });
        });
        await page.keyboard.down(modifier);
        await page.keyboard.press('g');
        await page.keyboard.up(modifier);
        try {
          assert.equal(await page.evaluate(() => window.__realChord), false,
            `Real ${modifier}+G must not suppress the browser shortcut`);
          assert.deepEqual(await page.evaluate(() => window.__SOL_TEST_TRICKS), [],
            `Real ${modifier}+G must not invoke a trick`);
        } catch (error) {
          chordFailures.push(`real ${modifier}+G: ${error.message}`);
        }
      }
      if (chordFailures.length) throw new Error(chordFailures.join('\n'));
    });

    await page.screenshot({ path: path.join(evidence, 'input-ownership-desktop.png') });
    await page.close();
    const mobile = await openGame(browser, { width: 390, height: 844 }, true);
    const mobilePage = mobile.page;
    const cdp = await mobilePage.context().newCDPSession(mobilePage);
    let activeTouches = [];

    async function touchStart(id, selector) {
      const box = await mobilePage.locator(selector).boundingBox();
      activeTouches.push({ id, x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: activeTouches,
        modifiers: 0
      });
    }

    async function touchEndOne(id) {
      const endingTouch = activeTouches.find(point => point.id === id);
      assert(endingTouch, `Touch ${id} must be active before it is released`);
      activeTouches = activeTouches.filter(point => point.id !== id);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [endingTouch],
        modifiers: 0
      });
    }

    async function touchEndAll() {
      const endingTouches = activeTouches;
      activeTouches = [];
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: endingTouches,
        modifiers: 0
      });
    }

    await scenario('two-finger Push tracks each pointer owner', async () => {
      await reset(mobilePage);
      await touchStart(101, '[data-t="push"]');
      await touchStart(102, '[data-t="push"]');
      assert.equal(await mobilePage.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), true);
      await touchEndOne(101);
      assert.equal(await mobilePage.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), true,
        'The remaining Push pointer must retain ownership');
      await touchEndAll();
      await mobilePage.waitForTimeout(50);
      assert.equal(await mobilePage.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), false);
    });

    await scenario('two-finger Grab preserves remaining touch and grab timer', async () => {
      await reset(mobilePage);
      await mobilePage.evaluate(() => {
        window.__SOL_DIAGNOSTICS__.engine.stopRenderLoop();
        const grab = document.querySelector('[data-t="grab"]');
        window.__grabPointerEvents = [];
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) {
          grab.addEventListener(type, event => {
            window.__grabPointerEvents.push({ type, pointerId: event.pointerId });
          }, true);
        }
      });
      await touchStart(201, '[data-t="grab"]');
      await touchStart(202, '[data-t="grab"]');
      const capturedPointers = await mobilePage.evaluate(() => {
        const grab = document.querySelector('[data-t="grab"]');
        const pointerIds = window.__grabPointerEvents
          .filter(event => event.type === 'pointerdown')
          .map(event => event.pointerId);
        return {
          pointerIds,
          hasCapture: pointerIds.map(pointerId => grab.hasPointerCapture(pointerId))
        };
      });
      assert.equal(capturedPointers.pointerIds.length, 2,
        `CDP multitouch must produce two pointerdown events: ${JSON.stringify(capturedPointers)}`);
      assert.notEqual(capturedPointers.pointerIds[0], capturedPointers.pointerIds[1]);
      assert(capturedPointers.hasCapture.every(Boolean),
        `Both pointers must be captured: ${JSON.stringify(capturedPointers)}`);
      const expectedGrabUntil = await mobilePage.evaluate(() => {
        const state = window.__SOL_DIAGNOSTICS__.state;
        state.grabUntil = Number.MAX_SAFE_INTEGER;
        state.touchGrabHeld = true;
        state.grabHeld = true;
        return state.grabUntil;
      });
      await touchEndOne(201);
      const afterOneRelease = await mobilePage.evaluate(() => {
        const state = window.__SOL_DIAGNOSTICS__.state;
        const grab = document.querySelector('[data-t="grab"]');
        const pointerIds = window.__grabPointerEvents
          .filter(event => event.type === 'pointerdown')
          .map(event => event.pointerId);
        return {
          touchGrabHeld: state.touchGrabHeld,
          grabHeld: state.grabHeld,
          grabUntil: state.grabUntil,
          grabUntilRemaining: state.grabUntil - performance.now(),
          events: window.__grabPointerEvents,
          releasedPointerIds: window.__grabPointerEvents
            .filter(event => event.type === 'pointerup')
            .map(event => event.pointerId),
          remainingPointerCaptured: grab.hasPointerCapture(pointerIds[1])
        };
      });
      assert.equal(afterOneRelease.touchGrabHeld, true);
      assert.equal(afterOneRelease.grabHeld, true);
      assert.equal(afterOneRelease.grabUntil, expectedGrabUntil,
        `Releasing one finger must preserve the existing deadline, got ${JSON.stringify(afterOneRelease)}`);
      assert.deepEqual(afterOneRelease.releasedPointerIds, [capturedPointers.pointerIds[0]],
        `CDP touchEnd must release only the first finger: ${JSON.stringify(afterOneRelease.events)}`);
      assert(afterOneRelease.remainingPointerCaptured,
        `The other captured pointer must remain captured: ${JSON.stringify(afterOneRelease.events)}`);
      await touchEndAll();
      await mobilePage.waitForTimeout(50);
      const afterAllRelease = await mobilePage.evaluate(() => {
        const state = window.__SOL_DIAGNOSTICS__.state;
        return { touchGrabHeld: state.touchGrabHeld, grabHeld: state.grabHeld, grabUntil: state.grabUntil };
      });
      assert.equal(afterAllRelease.touchGrabHeld, false);
      assert.equal(afterAllRelease.grabHeld, false);
      assert.equal(afterAllRelease.grabUntil, 0);
    });

    await scenario('help reset releases and clears pointer ownership', async () => {
      await reset(mobilePage);
      await touchStart(301, '[data-t="push"]');
      await mobilePage.locator('#controls-help-toggle').click();
      await mobilePage.waitForFunction(() => document.querySelector('#controls-help-dialog').open);
      assert.equal(await mobilePage.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), false);
      await mobilePage.locator('#controls-help-dialog [data-close]').last().click();
      await touchEndAll();
      await touchStart(302, '[data-t="push"]');
      assert.equal(await mobilePage.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), true);
      await mobilePage.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await mobilePage.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), false);
      await touchEndAll();
      await touchStart(303, '[data-t="push"]');
      await touchStart(304, '[data-t="grab"]');
      await mobilePage.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const afterHidden = await mobilePage.evaluate(() => {
        const state = window.__SOL_DIAGNOSTICS__.state;
        return {
          pushHeld: window.__SOL_DIAGNOSTICS__.input().pushHeld,
          touchGrabHeld: state.touchGrabHeld,
          grabHeld: state.grabHeld,
          grabUntil: state.grabUntil
        };
      });
      assert.equal(afterHidden.pushHeld, false);
      assert.equal(afterHidden.touchGrabHeld, false);
      assert.equal(afterHidden.grabHeld, false);
      assert.equal(afterHidden.grabUntil, 0);
      await touchEndAll();
      assert.deepEqual(mobile.errors, [], mobile.errors.join('; '));
    });

    await scenario('held Enter Controls behavior is observed independently', async () => {
      const toggle = mobilePage.locator('#controls-help-toggle');
      await toggle.click();
      const dialog = mobilePage.locator('#controls-help-dialog');
      await dialog.locator('[data-close]').first().focus();
      await mobilePage.evaluate(() => {
        const dialog = document.querySelector('#controls-help-dialog');
        window.__helpOpenTransitions = [];
        new MutationObserver(() => window.__helpOpenTransitions.push(dialog.open))
          .observe(dialog, { attributes: true, attributeFilter: ['open'] });
      });
      await mobilePage.keyboard.down('Enter');
      await mobilePage.waitForTimeout(900);
      await mobilePage.keyboard.up('Enter');
      await mobilePage.waitForTimeout(100);
      const result = await mobilePage.evaluate(() => ({
        open: document.querySelector('#controls-help-dialog').open,
        transitions: window.__helpOpenTransitions
      }));
      console.log('OBSERVED held-Enter Controls dialog transitions:', JSON.stringify(result));
      if (activeTouches.length) await touchEndAll();
    });

    assert.deepEqual(desktop.errors, [], desktop.errors.join('; '));
    assert.deepEqual(mobile.errors, [], mobile.errors.join('; '));
    await mobilePage.screenshot({ path: path.join(evidence, 'input-ownership-mobile.png') });
    await fs.promises.writeFile(path.join(evidence, 'reproduction-results.json'), JSON.stringify({ failures }, null, 2));
    if (failures.length) {
      throw new Error(`${failures.length} input ownership regression(s) reproduced:\n${failures.map(item => `${item.name}: ${item.message}`).join('\n')}`);
    }
    console.log('PASS all input ownership browser regressions');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
