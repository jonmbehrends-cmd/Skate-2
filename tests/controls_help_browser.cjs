const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'test-artifacts', 'controls-help');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, contents) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    const type = file.endsWith('.html') ? 'text/html' :
      file.endsWith('.css') ? 'text/css' :
      file.endsWith('.js') ? 'application/javascript' : 'text/plain';
    res.setHeader('Content-Type', type);
    res.end(contents);
  });
});

async function loadGame(browser, viewport, touch) {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const pad = {
      axes: [.6, -.5, 0, 0],
      buttons,
      connected: true,
      id: 'Xbox Wireless Controller',
      index: 0
    };
    window.__helpPad=pad;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad]
    });
  });
  await page.route('https://cdn.babylonjs.com/babylon.js',r=>r.fulfill({path:require.resolve('babylonjs'),contentType:'application/javascript'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?park=classic`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForFunction(() => !!window.__SOL_DIAGNOSTICS__, null, { timeout: 30000 });
  await page.locator('#controls-help-toggle').waitFor({state:'attached'});
  await page.evaluate(()=>{
    window.__helpSamples=[];
    window.__SOL_DIAGNOSTICS__.scene.onAfterRenderObservable.add(()=>{
      const s=window.__SOL_DIAGNOSTICS__.state;
      window.__helpSamples.push({name:s.name,grounded:s.grounded,vy:s.vy});
      if(window.__helpSamples.length>300)window.__helpSamples.shift();
    });
  });
  return page;
}

async function assertNoOverlap(page) {
  const result = await page.evaluate(() => {
    const rect = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, right: x + width, bottom: y + height };
    };
    const help = rect(document.querySelector(matchMedia('(pointer:coarse)').matches?'#solMenuToggle':'#controls-help-toggle'));
    return [...document.querySelectorAll('#status, #restart, #halfpipe, #stick, #hud, #buttons button')]
      .map(element => {
      const other = rect(element);
      return {
        selector: element.id || element.dataset.t || element.tagName,
        overlaps: help.x < other.right && help.right > other.x &&
          help.y < other.bottom && help.bottom > other.y
      };
    });
  });
  assert(result.every(item => !item.overlaps),
    `Controls toggle overlaps existing UI: ${JSON.stringify(result)}`);
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  try {
    fs.mkdirSync(evidence, { recursive: true });

    const desktop = await loadGame(browser, { width: 1280, height: 800 }, false);
    await assertNoOverlap(desktop);
    const toggle = desktop.locator('#controls-help-toggle');
    const dialog = desktop.locator('#controls-help-dialog');
    assert.equal(await dialog.evaluate(el => el.open), false, 'Help must start closed');
    await desktop.waitForFunction(() => window.__SOL_DIAGNOSTICS__.state.controlSteer > .2);
    await desktop.keyboard.down('w');
    await desktop.waitForFunction(() => window.__SOL_DIAGNOSTICS__.input().keyboard.y === -1);
    await toggle.click();
    await desktop.waitForFunction(() => document.querySelector('#controls-help-dialog').open);
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(18, 32, 46, 0.96)',
      'Controls dialog stylesheet must load');
    const helpText = await dialog.innerText();
    for (const mapping of ['W', 'A / D', 'Space', 'G', 'R', 'RT',
      'A / X / B / Y', 'RB / LB', 'R3', 'Right-stick flick', 'D-pad']) {
      assert(helpText.includes(mapping), `Help must explain the ${mapping} mapping`);
    }
    const desktopContent = await dialog.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));
    assert(desktopContent.scrollHeight <= desktopContent.clientHeight + 1,
      `Desktop help content must not be clipped: ${JSON.stringify(desktopContent)}`);
    assert.equal(await dialog.locator(':focus').getAttribute('aria-label'), 'Close controls help');
    const padding = await dialog.boundingBox();
    const paddingPoint = { x: padding.x + 8, y: padding.y + padding.height / 2 };
    assert.equal(await desktop.evaluate(p => document.elementFromPoint(p.x, p.y).id, paddingPoint),
      'controls-help-dialog', 'Padding test must hit the dialog itself');
    await desktop.mouse.click(paddingPoint.x, paddingPoint.y);
    assert.equal(await dialog.evaluate(el => el.open), true, 'Clicking dialog padding must keep help open');
    assert.match(await desktop.evaluate(() => SOLPad.poll(() => {}).status), /paused/);
    await desktop.mouse.click(padding.x - 8, padding.y + padding.height / 2);
    assert.equal(await dialog.evaluate(el => el.open), false, 'Real backdrop click must close help');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await desktop.evaluate(() => document.activeElement.id), 'controls-help-toggle');
    assert.doesNotMatch(await desktop.evaluate(() => SOLPad.poll(() => {}).status), /paused/);
    await toggle.click();
    const released = await desktop.evaluate(() => {
      const d = window.__SOL_DIAGNOSTICS__;
      return {
        keyboard: d.input().keyboard,
        steering: d.state.controlSteer,
        throttle: d.state.controlThrottle,
        pad: window.SOLPad.poll(() => { throw Error('Suspended pad triggered an action'); })
      };
    });
    assert.deepEqual(released.keyboard, { x: 0, y: 0 }, 'Opening help must release keyboard input');
    assert.equal(released.steering, 0, 'Opening help must release steering');
    assert.equal(released.throttle, 0, 'Opening help must release throttle');
    assert.equal(released.pad.x, 0, 'Controller stick must be neutral while help is open');
    assert.equal(released.pad.boost, false, 'Controller push must be released while help is open');

    await fs.promises.writeFile(
      path.join(evidence, 'controls-desktop.png'),
      await desktop.screenshot()
    );
    await desktop.keyboard.press('Shift+Tab');
    assert.equal(await dialog.locator(':focus').getAttribute('data-close'), '');
    await desktop.keyboard.press('Tab');
    assert.equal(await dialog.locator(':focus').getAttribute('aria-label'), 'Close controls help');
    // Gameplay hotkeys stay blocked, while native button activation works.
    await desktop.keyboard.press('g');
    assert.equal(await desktop.evaluate(()=>window.__SOL_DIAGNOSTICS__.state.grindRequestUntil),0);
    await desktop.keyboard.press('Enter');
    await desktop.waitForFunction(()=>!document.querySelector('#controls-help-dialog').open);
    await toggle.click();
    await desktop.keyboard.press('Space');
    await desktop.waitForFunction(()=>!document.querySelector('#controls-help-dialog').open);
    await toggle.click();
    await desktop.keyboard.press('Escape');
    await desktop.waitForFunction(()=>!document.querySelector('#controls-help-dialog').open);
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await desktop.evaluate(()=>document.activeElement.id),'controls-help-toggle');
    await desktop.keyboard.up('w');
    // The focused opener must not trigger an ollie while opening with Space.
    await desktop.locator('#restart').click();await toggle.focus();
    await desktop.keyboard.press('Space');
    await desktop.waitForFunction(()=>document.querySelector('#controls-help-dialog').open);
    assert(await desktop.evaluate(()=>window.__SOL_DIAGNOSTICS__.state.grounded));
    await desktop.keyboard.press('Escape');
    await desktop.locator('#render').click({position:{x:300,y:300}});
    await desktop.evaluate(()=>window.__helpSamples=[]);
    await desktop.keyboard.press('Space');
    await desktop.waitForFunction(()=>window.__helpSamples.some(s=>!s.grounded&&s.vy>0&&s.name==='OLLIE'));
    await desktop.close();

    const mobile = await loadGame(browser, { width: 390, height: 844 }, true);
    await assertNoOverlap(mobile);
    await mobile.locator('#solMenuToggle').tap();
    const mobileToggle = mobile.locator('#controls-help-toggle');
    const mobileDialog = mobile.locator('#controls-help-dialog');
    const toggleBounds = await mobileToggle.boundingBox();
    assert(toggleBounds, 'Mobile controls toggle must be visible');
    await mobileToggle.tap();
    await mobile.waitForFunction(() => document.querySelector('#controls-help-dialog').open);
    assert.equal(await mobileDialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(18, 32, 46, 0.96)',
      'Mobile controls dialog stylesheet must load');
    const mobileContent = await mobileDialog.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));
    assert(mobileContent.scrollHeight <= mobileContent.clientHeight + 1,
      `Mobile help content must not be clipped: ${JSON.stringify(mobileContent)}`);
    await fs.promises.writeFile(
      path.join(evidence, 'controls-mobile.png'),
      await mobile.screenshot()
    );
    let panelBounds = await mobileDialog.boundingBox();
    assert(panelBounds.x >= 0 && panelBounds.y >= 0 &&
      panelBounds.x + panelBounds.width <= 390 && panelBounds.y + panelBounds.height <= 844,
    `Mobile help panel must fit the viewport: ${JSON.stringify(panelBounds)}`);
    await mobileDialog.locator('button[data-close]').last().tap();
    await mobile.waitForFunction(() => !document.querySelector('#controls-help-dialog').open);
    assert.equal(await mobile.evaluate(() => document.activeElement.id), 'controls-help-toggle',
      'Touch close must return focus to the help toggle');

    // A connected Xbox deliberately hides the touch dock. Verify the new
    // behavior, then disconnect before exercising joystick/help input release.
    await mobile.waitForFunction(() => document.body.classList.contains('controller-active'));
    assert.equal(await mobile.locator('#stick').isVisible(),false,
      'Connected gamepad must hide the touch joystick');
    assert.equal(await mobile.locator('#buttons').isVisible(),false,
      'Connected gamepad must hide touch trick buttons');
    await mobile.evaluate(() => { window.__helpPad.connected=false; });
    await mobile.waitForFunction(() => !document.body.classList.contains('controller-active'));
    assert.equal(await mobile.locator('#stick').isVisible(),true,
      'Disconnect must restore the touch joystick');
    assert.equal(await mobile.locator('#buttons').isVisible(),true,
      'Disconnect must restore touch trick buttons');
    const stick = await mobile.locator('#stick').boundingBox();
    await mobile.mouse.move(stick.x + stick.width * .8, stick.y + stick.height * .5);
    await mobile.mouse.down();
    await mobile.waitForFunction(() => window.__SOL_DIAGNOSTICS__.input().joy.x > .2);
    if(await mobile.locator('#solMenuPanel').evaluate(el=>el.hidden))await mobile.locator('#solMenuToggle').tap();
    await mobileToggle.evaluate(el => el.click());
    await mobile.waitForFunction(() => document.querySelector('#controls-help-dialog').open);
    const mobileState = await mobile.evaluate(() => ({
      joy: window.__SOL_DIAGNOSTICS__.input().joy,
      pad: window.SOLPad.poll(() => { throw Error('Suspended pad triggered an action'); })
    }));
    assert.equal(mobileState.joy.x, 0, 'Opening help must release the touch stick');
    assert.equal(mobileState.joy.id, null, 'Opening help must release the captured touch pointer');
    assert.equal(mobileState.pad.x, 0, 'Controller input must remain neutral in mobile help');
    panelBounds = await mobileDialog.boundingBox();
    await mobile.mouse.up();
    await mobileDialog.locator('button[data-close]').last().tap();
    await mobile.waitForFunction(() => !document.querySelector('#controls-help-dialog').open);
    assert.equal(await mobile.evaluate(() => document.activeElement.id), 'controls-help-toggle',
      'Touch close must return focus to the help toggle');
    await mobile.locator('[data-t="push"]').dispatchEvent('pointerdown', { pointerId: 99 });
    await mobile.waitForFunction(() => window.__SOL_DIAGNOSTICS__.input().pushHeld);
    if(await mobile.locator('#solMenuPanel').evaluate(el=>el.hidden))await mobile.locator('#solMenuToggle').tap();
    await mobileToggle.evaluate(el => el.click());
    await mobile.waitForFunction(() => document.querySelector('#controls-help-dialog').open);
    assert.equal(await mobile.evaluate(() => window.__SOL_DIAGNOSTICS__.input().pushHeld), false,
      'Opening help must release the held touch push button');
    assert.equal(await mobile.evaluate(() => window.__SOL_DIAGNOSTICS__.state.pushBurstUntil), 0,
      'Opening help must cancel the touch push burst');
    await mobileDialog.locator('button[data-close]').last().tap();
    await mobile.waitForFunction(() => !document.querySelector('#controls-help-dialog').open);
    await mobile.locator('#restart').click();
    await mobile.locator('#render').tap({position:{x:180,y:350}});
    await mobile.locator('#render').tap({position:{x:180,y:350}});
    await mobile.evaluate(()=>window.__helpSamples=[]);
    await mobile.keyboard.press('Space');
    await mobile.waitForFunction(()=>window.__helpSamples.some(s=>!s.grounded&&s.vy>0&&s.name==='OLLIE'));
    await mobile.close();

    const landscape = await loadGame(browser, { width: 844, height: 390 }, true);
    await assertNoOverlap(landscape);
    await landscape.locator('#solMenuToggle').tap();
    const landscapeToggle = landscape.locator('#controls-help-toggle');
    await landscapeToggle.tap();
    await landscape.waitForFunction(() => document.querySelector('#controls-help-dialog').open);
    await fs.promises.writeFile(
      path.join(evidence, 'controls-mobile-landscape.png'),
      await landscape.screenshot()
    );
    const landscapeBounds = await landscape.locator('#controls-help-dialog').boundingBox();
    assert(landscapeBounds.y >= 0 && landscapeBounds.y + landscapeBounds.height <= 390,
      `Landscape help dialog must fit the screen: ${JSON.stringify(landscapeBounds)}`);
    const scroll=await landscape.locator('#controls-help-dialog').evaluate(el=>{
      const child=el.querySelector('dd');
      return {overflow:el.scrollHeight>el.clientHeight,childTouch:getComputedStyle(child).touchAction};
    });
    assert.equal(scroll.childTouch,'pan-y','Text must allow finger scrolling');
    assert(scroll.overflow, 'Landscape dialog must overflow to exercise native scrolling');
    if(scroll.overflow){
      for (const key of ['ArrowDown', 'PageDown']) {
        await landscape.locator('#controls-help-dialog').evaluate(el => {
          window.__helpScrollEnded = false;
          el.addEventListener('scrollend', () => { window.__helpScrollEnded = true; }, {once:true});
        });
        await landscape.keyboard.press(key);
        // Wait for the native animation to reach its destination before the next key.
        await landscape.waitForFunction(key => {
          const el = document.querySelector('#controls-help-dialog');
          return window.__helpScrollEnded && el.scrollTop >= Math.min(key === 'ArrowDown' ? 39 : el.scrollHeight - el.clientHeight - 1,
            el.scrollHeight - el.clientHeight - 1);
        }, key, { timeout: 10000 }).catch(async error => {
            const details = await landscape.locator('#controls-help-dialog').evaluate(el => ({
              top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight,focus:document.activeElement.outerHTML
            }));
            throw new Error(`${key} must scroll the open dialog: ${JSON.stringify(details)} ${error.message}`);
          });
      }
      await landscape.keyboard.down('w');
      await landscape.keyboard.press('g');
      await landscape.keyboard.press('r');
      assert.deepEqual(await landscape.evaluate(() => window.__SOL_DIAGNOSTICS__.input().keyboard), {x:0,y:0});
      assert.equal(await landscape.evaluate(() => window.__SOL_DIAGNOSTICS__.state.grindRequestUntil), 0);
      await landscape.keyboard.up('w');
      await landscape.locator('#controls-help-dialog').evaluate(el => { el.scrollTop = 0; });
      const session=await landscape.context().newCDPSession(landscape);
      const box=await landscape.locator('#controls-help-dialog').boundingBox();
      const x=box.x+box.width*.6,y=box.y+box.height*.8;
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*30}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await landscape.waitForFunction(()=>document.querySelector('#controls-help-dialog').scrollTop>0);
      await session.detach();
    }
    await landscape.keyboard.press('Escape');
    await landscape.waitForFunction(() => !document.querySelector('#controls-help-dialog').open);
    await landscape.close();

    console.log('PASS controls help desktop/mobile focus, Escape, touch, input release and gameplay resume');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
