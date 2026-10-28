const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf("const stick=document.querySelector('#stick')");
const endMarker = "document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInputs()});";
const end = html.indexOf(endMarker, start);
assert(start >= 0 && end > start, 'Input handlers must remain extractable from the game page');
const source = html.slice(start, end + endMarker.length);
const failures = [];

function check(name, run) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function fixture() {
  let now = 1000;
  const actions = [];
  const windowListeners = new Map();
  const documentListeners = new Map();

  function makeTarget(type) {
    return {
      dataset: type ? { t: type } : {},
      style: {},
      handlers: new Map(),
      addEventListener(name, callback) {
        const callbacks = this.handlers.get(name) || [];
        callbacks.push(callback);
        this.handlers.set(name, callbacks);
      },
      setPointerCapture(pointerId) {
        this.captured = pointerId;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 };
      },
      fire(name, event = {}) {
        for (const callback of this.handlers.get(name) || []) {
          callback({
            pointerId: 1,
            clientX: 80,
            clientY: 20,
            preventDefault() {},
            ...event
          });
        }
      }
    };
  }

  const stick = makeTarget();
  const nub = makeTarget();
  const buttons = ['ollie', 'kick', 'heel', 'shove', 'grab', 'push', 'grind', 'boardslide']
    .map(makeTarget);

  const document = {
    querySelector(selector) {
      return selector === '#stick' ? stick : selector === '#nub' ? nub : null;
    },
    querySelectorAll() { return buttons; },
    addEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      callbacks.push(callback);
      documentListeners.set(name, callbacks);
    }
  };
  const window = {
    SOLPad: null,
    addEventListener(name, callback) {
      const callbacks = windowListeners.get(name) || [];
      callbacks.push(callback);
      windowListeners.set(name, callbacks);
    }
  };
  const state = {
    grabHeld: false,
    padGrabHeld: false,
    touchGrabHeld: false,
    grabUntil: 0,
    pushBurstUntil: 0,
    grindRequestUntil: 0,
    controlSteer: 0,
    controlThrottle: 0
  };
  const context = {
    addEventListener(name, callback) {
      const callbacks = windowListeners.get(name) || [];
      callbacks.push(callback);
      windowListeners.set(name, callbacks);
    },
    document,
    window,
    state,
    joy: { x: 0, y: 0, id: null },
    keys: new Set(),
    keyboard: { x: 0, y: 0 },
    pushHeld: false,
    boost: false,
    gpX: 0,
    gpY: 0,
    performance: { now: () => now },
    trick(name) { actions.push(name); },
    restart() { actions.push('restart'); }
  };
  vm.runInNewContext(source, context);

  return {
    actions,
    buttons: Object.fromEntries(buttons.map(button => [button.dataset.t, button])),
    context,
    document,
    setNow(value) { now = value; },
    fireWindow(name, event = {}) {
      for (const callback of windowListeners.get(name) || []) callback(event);
    },
    fireDocument(name, event = {}) {
      for (const callback of documentListeners.get(name) || []) callback(event);
    }
  };
}

check('long-held pointer action', () => {
  const f = fixture();
  const kick = f.buttons.kick;
  kick.fire('pointerdown', { pointerId: 41, isTrusted: true });
  f.setNow(1700);
  kick.fire('click', { detail: 1, pointerType: 'mouse' });
  assert.equal(f.actions.length, 1, 'A long-held pointer action must not run again on its compatibility click');
});

check('immediate keyboard activation after pointer', () => {
  const f = fixture();
  const kick = f.buttons.kick;
  kick.fire('pointerdown', { pointerId: 42, isTrusted: true });
  kick.fire('click', { detail: 1, pointerType: 'mouse' });
  kick.fire('click', { detail: 0 });
  assert.equal(f.actions.length, 2, 'Immediate keyboard/assistive click activation must not be deduped');
});

check('two-pointer Push ownership', () => {
  const f = fixture();
  const push = f.buttons.push;
  push.fire('pointerdown', { pointerId: 51, isTrusted: true });
  push.fire('pointerdown', { pointerId: 52, isTrusted: true });
  push.fire('pointerup', { pointerId: 51 });
  assert.equal(f.context.pushHeld, true, 'Push must remain held while a second pointer owns it');
  push.fire('pointercancel', { pointerId: 52 });
  assert.equal(f.context.pushHeld, false, 'Cancelling the last Push owner must release Push');
});

check('two-pointer Grab ownership and timer', () => {
  const f = fixture();
  const grab = f.buttons.grab;
  grab.fire('pointerdown', { pointerId: 61, isTrusted: true });
  grab.fire('pointerdown', { pointerId: 62, isTrusted: true });
  f.context.state.grabUntil = 5000;
  f.context.state.touchGrabHeld = true;
  f.context.state.grabHeld = true;
  grab.fire('pointerup', { pointerId: 61 });
  assert.equal(f.context.state.touchGrabHeld, true, 'Grab must remain held by the second pointer');
  assert.equal(f.context.state.grabHeld, true, 'Grab state must remain held by the second pointer');
  assert.equal(f.context.state.grabUntil, 5000, 'Releasing one finger must preserve the other finger’s grab timer');
  grab.fire('lostpointercapture', { pointerId: 62 });
  assert.equal(f.context.state.touchGrabHeld, false, 'Losing the last capture must release touch grab');
  assert.equal(f.context.state.grabUntil, 0, 'Losing the last grab owner must clear the timer');
});

check('modified gameplay shortcut filtering', () => {
  const f = fixture();
  const defaultPrevented = [];
  for (const code of ['KeyW', 'KeyA', 'KeyD', 'KeyG', 'KeyR', 'Space']) {
    const event = {
      code,
      key: code === 'Space' ? ' ' : code.slice(3).toLowerCase(),
      ctrlKey: true,
      preventDefault() { this.defaultPrevented = true; }
    };
    f.fireWindow('keydown', event);
    defaultPrevented.push(event.defaultPrevented || false);
  }
  assert.deepEqual(f.actions, [], 'Modified gameplay shortcuts must not invoke gameplay actions');
  assert.equal(f.context.keys.size, 0, 'Modified shortcuts must not acquire movement keys');
  assert(defaultPrevented.every(value => !value), 'Modified shortcuts must not be prevented');
});

check('help and blur clear pointer ownership', () => {
  const f = fixture();
  f.buttons.push.fire('pointerdown', { pointerId: 71, isTrusted: true });
  f.fireWindow('sol-controls-help-state', { detail: { open: true } });
  assert.equal(f.context.pushHeld, false, 'Opening help must release Push');
  f.buttons.push.fire('pointerdown', { pointerId: 72, isTrusted: true });
  assert.equal(f.context.pushHeld, true, 'A new pointer must acquire Push after help reset');
  f.fireWindow('blur');
  assert.equal(f.context.pushHeld, false, 'Blur must clear pointer ownership');
  f.buttons.push.fire('pointerdown', { pointerId: 73, isTrusted: true });
  f.document.hidden = true;
  f.fireDocument('visibilitychange');
  assert.equal(f.context.pushHeld, false, 'Hidden page must clear pointer ownership');
});

console.log('PASS input ownership unit regressions');
if (failures.length) {
  throw new Error(`${failures.length} input ownership unit regression(s) reproduced:\n${failures.map(item => `${item.name}: ${item.message}`).join('\n')}`);
}
