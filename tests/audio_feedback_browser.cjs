const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'test-artifacts', 'audio-feedback');
const screenshots = path.join(root, 'qa', 'audio-feedback');
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
    const type = file.endsWith('.html') ? 'text/html' :
      file.endsWith('.css') ? 'text/css' :
      file.endsWith('.js') ? 'application/javascript' : 'text/plain';
    response.setHeader('Content-Type', type);
    response.end(contents);
  });
});

async function openGame(browser, name, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__audioContextCount = 0;
    const NativeAudioContext = window.AudioContext;
    if (!NativeAudioContext) return;
    window.AudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) {
        window.__audioContextCount++;
        return Reflect.construct(target, args);
      }
    });
  });
  await page.route('https://cdn.babylonjs.com/babylon.js', route =>
    route.fulfill({ path: require.resolve('babylonjs'), contentType: 'application/javascript' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForFunction(() => !!window.__SOL_DIAGNOSTICS__?.audio, null, { timeout: 30000 });
  await page.locator('#audio-feedback-toggle').waitFor();
  return { name, context, page, errors };
}

async function status(page) {
  return page.evaluate(() => window.__SOL_DIAGNOSTICS__.audio.status());
}

async function assertNoOverlap(page) {
  const overlaps = await page.evaluate(() => {
    const audio = document.querySelector('#audio-feedback-toggle').getBoundingClientRect();
    return [...document.querySelectorAll('#status, #restart, #halfpipe, #controls-help-toggle, #stick, #hud, #buttons button')]
      .filter(element => {
        const box = element.getBoundingClientRect();
        return audio.left < box.right && audio.right > box.left &&
          audio.top < box.bottom && audio.bottom > box.top;
      })
      .map(element => element.id || element.dataset.t || element.tagName);
  });
  assert.deepEqual(overlaps, [], `Audio toggle overlaps existing UI: ${overlaps.join(', ')}`);
}

async function testLayout(browser, name, viewport, touch) {
  const { context, page, errors } = await openGame(browser, name, viewport, touch);
  try {
    const toggle = page.locator('#audio-feedback-toggle');
    await assertNoOverlap(page);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await toggle.getAttribute('aria-label'), 'Mute audio feedback');

    const initial = await status(page);
    assert.equal(initial.contextState, 'uninitialized', 'Startup must not create or start audio');
    assert.equal(await page.evaluate(() => window.__audioContextCount), 0);

    await toggle.click();
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().muted);
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'suspended');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__audioContextCount), 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__SOL_DIAGNOSTICS__?.audio);
    assert.equal(await page.locator('#audio-feedback-toggle').getAttribute('aria-pressed'), 'true',
      'Mute preference must persist across reload');
    assert.equal((await status(page)).contextState, 'uninitialized',
      'A saved mute preference must not start audio on page load');
    assert.equal(await page.evaluate(() => window.__audioContextCount), 0);

    await toggle.focus();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'audio-feedback-toggle');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'running');
    assert.equal(await page.evaluate(() => window.__audioContextCount), 1,
      'Keyboard unmute should create one AudioContext from the native button activation');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.__SOL_DIAGNOSTICS__.state.grounded), true,
      'Activating the audio toggle must not forward Space to the gameplay handler');
    assert.equal((await status(page)).muted, false);

    if (touch) {
      await page.locator('[data-t="push"]').tap();
    } else {
      await page.keyboard.down('w');
      await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.state.speed > 1, null, { timeout: 5000 });
      await page.keyboard.up('w');
    }
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().events.wheel > 0, null,
      { timeout: 6000 });

    if (touch) await page.locator('[data-t="ollie"]').tap();
    else {
      await toggle.evaluate(element => element.blur());
      await page.keyboard.press('Space');
    }
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().events.ollie > 0, null,
      { timeout: 4000 });
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().events.landing > 0, null,
      { timeout: 8000 });

    await page.evaluate(() => {
      document.querySelector('#restart').click();
      Object.assign(window.__SOL_DIAGNOSTICS__.state, {
        x: 0, z: 19, y: 0, groundY: 0, dir: 0, speed: 5, vy: 0,
        grounded: true, grinding: false, grindCooldown: 0, grindAirborneUntil: 0
      });
    });
    if (touch) {
      const grind = await page.locator('[data-t="grind"]').boundingBox();
      await page.touchscreen.tap(grind.x + 4, grind.y + grind.height / 2);
    } else await page.keyboard.press('g');
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.state.grinding, null, { timeout: 8000 });
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().events.grind > 0, null,
      { timeout: 4000 });
    assert.equal(await page.evaluate(() => window.__audioContextCount), 1,
      'Gameplay feedback must reuse the unlocked AudioContext');

    const controls = page.locator('#controls-help-toggle');
    if (touch) await controls.tap();
    else await controls.click();
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'suspended');
    if (touch) await page.locator('#controls-help-dialog [data-close]').last().tap();
    else await page.locator('#controls-help-dialog [data-close]').last().click();
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'running');

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'suspended');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'running');

    await page.evaluate(() => {
      let hidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      window.__setHiddenForTest = value => {
        hidden = value;
        document.dispatchEvent(new Event('visibilitychange'));
      };
      window.__setHiddenForTest(true);
    });
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'suspended');
    await page.evaluate(() => window.__setHiddenForTest(false));
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'running');

    const finalStatus = await status(page);
    assert.deepEqual(Object.keys(finalStatus.events).sort(), ['grind', 'landing', 'ollie', 'wheel']);
    for (const [event, count] of Object.entries(finalStatus.events)) {
      assert(count > 0, `${event} feedback should be exercised: ${JSON.stringify(finalStatus.events)}`);
    }
    const contextCreations = await page.evaluate(() => window.__audioContextCount);
    assert.equal(contextCreations, 1, 'The page must reuse a single AudioContext');
    assert.deepEqual(errors, [], `Browser page errors: ${errors.join('; ')}`);

    await fs.promises.mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, `audio-${name}.png`) });

    await toggle.click();
    await page.waitForFunction(() => window.__SOL_DIAGNOSTICS__.audio.status().contextState === 'suspended');
    const mutedEvents = (await status(page)).events;
    await page.waitForTimeout(500);
    assert.deepEqual((await status(page)).events, mutedEvents, 'Muted gameplay must not schedule audio cues');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__SOL_DIAGNOSTICS__?.audio);
    assert.equal(await page.locator('#audio-feedback-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal((await status(page)).contextState, 'uninitialized');
    assert.equal(await page.evaluate(() => window.__audioContextCount), 0);

    return { layout: name, events: finalStatus.events, contextCreations };
  } finally {
    await context.close();
  }
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  try {
    const results = [];
    results.push(await testLayout(browser, 'desktop', { width: 1280, height: 800 }, false));
    results.push(await testLayout(browser, 'mobile', { width: 390, height: 844 }, true));
    results.push(await testLayout(browser, 'mobile-landscape', { width: 844, height: 390 }, true));
    const report = { result: 'PASS', results };
    await fs.promises.writeFile(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2));
    console.log('PASS desktop, mobile portrait and landscape: silent startup, persistent mute, one context, wheel/ollie/landing/grind feedback, help/blur/hidden suspension and resume');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
