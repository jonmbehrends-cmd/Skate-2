const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'audio-feedback.js'), 'utf8');

function createFixture(event, fps, durationMs, speed = 10) {
  let nowMs = 0;
  let update;
  let contexts = 0;
  const started = [];
  const listeners = new Map();
  const state = {
    grounded: event === 'wheel',
    grinding: event === 'grind',
    name: '',
    speed,
    vy: 0
  };

  class FakeParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
    linearRampToValueAtTime() {}
    setTargetAtTime() {}
  }

  class FakeNode {
    constructor() {
      this.frequency = new FakeParam();
      this.gain = new FakeParam();
      this.listeners = new Map();
      this.disconnectCount = 0;
    }

    connect(node) { this.connectedTo = node; }
    disconnect() { this.disconnectCount++; }
    addEventListener(type, callback) {
      const callbacks = this.listeners.get(type) || [];
      callbacks.push(callback);
      this.listeners.set(type, callbacks);
    }
    start() { started.push({ type: this.type, timeMs: nowMs, node: this }); }
    stop() {}
    end() {
      for (const callback of this.listeners.get('ended') || []) callback();
    }
  }

  class FakeAudioContext {
    constructor() {
      contexts++;
      this.state = 'suspended';
      this.destination = {};
    }

    get currentTime() { return nowMs / 1000; }
    createGain() { return new FakeNode(); }
    createOscillator() { return new FakeNode(); }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
  }

  function element() {
    return {
      attributes: {},
      listeners: new Map(),
      addEventListener(type, callback) {
        const callbacks = this.listeners.get(type) || [];
        callbacks.push(callback);
        this.listeners.set(type, callbacks);
      },
      setAttribute(name, value) { this.attributes[name] = value; }
    };
  }

  const window = {
    AudioContext: FakeAudioContext,
    __SOL_DIAGNOSTICS__: {
      scene: { onAfterRenderObservable: { add(callback) { update = callback; } } },
      state
    },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    dispatch(type, event) {
      for (const callback of listeners.get(type) || []) callback(event);
    }
  };
  const document = {
    hidden: false,
    addEventListener() {},
    createElement: element,
    head: { append() {} },
    body: { append() {} }
  };
  const sandbox = {
    document,
    localStorage: { getItem() { return null; }, setItem() {} },
    performance: { now() { return nowMs; } },
    window,
    console
  };
  vm.runInNewContext(source, sandbox, { filename: 'audio-feedback.js' });

  window.dispatch('pointerdown', { isTrusted: true });
  assert.equal(contexts, 1, 'A trusted gesture should create one AudioContext');
  assert.equal(typeof update, 'function', 'Audio module should subscribe to render updates');

  const frameCount = Math.floor(durationMs * fps / 1000);
  for (let frame = 0; frame <= frameCount; frame++) {
    nowMs = frame * 1000 / fps;
    update();
  }

  const cues = started.filter(entry =>
    event === 'wheel' ? entry.type === 'triangle' : entry.type === 'sawtooth');
  const expectedCueCount = event === 'wheel'
    ? window.__SOL_DIAGNOSTICS__.audio.status().events.wheel
    : window.__SOL_DIAGNOSTICS__.audio.status().events.grind;
  assert.equal(cues.length, expectedCueCount);
  assert(expectedCueCount > 1, `${event} cadence should produce repeated cues`);

  for (const cue of cues) {
    cue.node.end();
    assert.equal(cue.node.disconnectCount, 1, 'Ended oscillator must disconnect');
    assert.equal(cue.node.connectedTo.disconnectCount, 1, 'Ended envelope must disconnect');
  }

  return cues.map(cue => cue.timeMs);
}

function assertIntervals(times, targetMs, frameMs, label) {
  const tolerance = 0.001;
  for (let i = 1; i < times.length; i++) {
    const interval = times[i] - times[i - 1];
    assert(
      interval >= targetMs - tolerance && interval < targetMs + frameMs + tolerance,
      `${label} interval ${interval.toFixed(2)}ms must respect ${targetMs}ms deadline at ${frameMs.toFixed(2)}ms frame time`
    );
  }
}

const results = [];
for (const fps of [30, 60, 120]) {
  const frameMs = 1000 / fps;
  const wheelCueCounts = {};
  for (const speed of [2, 10, 40]) {
    const wheelTimes = createFixture('wheel', fps, 5000, speed);
    assert.equal(wheelTimes[0], 0);
    const expectedIntervalMs = Math.max(160, 320 - Math.min(160, speed * 6));
    assertIntervals(wheelTimes, expectedIntervalMs, frameMs, `Wheel at speed ${speed}, ${fps} FPS`);
    wheelCueCounts[speed] = wheelTimes.length;
  }

  const grindTimes = createFixture('grind', fps, 5000);
  assert.equal(grindTimes[0], 0);
  assertIntervals(grindTimes.slice(0, 2), 120, frameMs, `Grind entry at ${fps} FPS`);
  assertIntervals(grindTimes.slice(1), 130, frameMs, `Grind repeats at ${fps} FPS`);
  results.push({ fps, wheelCuesAtSpeed: wheelCueCounts, grindCues: grindTimes.length });
}

console.log('PASS deterministic audio cadence (5s):', JSON.stringify(results));
console.log('PASS ended oscillators and envelopes disconnect cleanly');
