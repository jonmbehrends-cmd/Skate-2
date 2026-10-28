(function () {
  'use strict';

  const preferenceKey = 'sol-skate-audio-muted';
  const events = { wheel: 0, ollie: 0, landing: 0, grind: 0 };
  let muted = readMutePreference();
  let context = null;
  let master = null;
  let audioUnavailable = false;
  let blurred = false;
  let helpOpen = false;
  let previousGrounded = null;
  let previousGrinding = false;
  let nextWheelAtMs = 0;
  let nextGrindAtMs = 0;
  const grindEntryIntervalMs = 120;
  const grindRepeatIntervalMs = 130;

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'audio-feedback.css';
  document.head.append(style);

  const toggle = document.createElement('button');
  toggle.id = 'audio-feedback-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', String(muted));
  document.body.append(toggle);
  updateToggle();

  function readMutePreference() {
    try {
      return localStorage.getItem(preferenceKey) === 'true';
    } catch (error) {
      console.warn('SOL SKATE could not read the audio preference:', error);
      return false;
    }
  }

  function saveMutePreference() {
    try {
      localStorage.setItem(preferenceKey, String(muted));
    } catch (error) {
      console.warn('SOL SKATE could not save the audio preference:', error);
    }
  }

  function updateToggle() {
    toggle.textContent = muted ? 'Sound: Off' : 'Sound: On';
    toggle.setAttribute('aria-pressed', String(muted));
    toggle.setAttribute('aria-label', muted ? 'Enable audio feedback' : 'Mute audio feedback');
    toggle.title = muted ? 'Audio feedback is muted' : 'Audio feedback is on';
  }

  function canResume() {
    return !muted && !blurred && !document.hidden && !helpOpen;
  }

  function createContext() {
    if (context) return true;
    if (audioUnavailable) return false;

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      audioUnavailable = true;
      toggle.disabled = true;
      console.warn('SOL SKATE audio feedback is unavailable in this browser.');
      return false;
    }

    try {
      context = new AudioContextConstructor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.65;
      master.connect(context.destination);
      return true;
    } catch (error) {
      audioUnavailable = true;
      toggle.disabled = true;
      console.error('SOL SKATE could not initialize audio feedback:', error);
      return false;
    }
  }

  function resumeContext() {
    if (!context || !canResume() || context.state === 'running') return;
    context.resume().catch(error => {
      console.warn('SOL SKATE audio feedback could not resume:', error);
    });
  }

  function suspendContext() {
    if (!context || context.state !== 'running') return;
    context.suspend().catch(error => {
      console.warn('SOL SKATE audio feedback could not suspend:', error);
    });
  }

  function unlockFromGesture(event) {
    if (!event.isTrusted || muted || !createContext()) return;
    resumeContext();
  }

  function setMuted(value) {
    muted = value;
    updateToggle();
    saveMutePreference();

    if (muted) {
      if (master && context) master.gain.setTargetAtTime(0, context.currentTime, 0.015);
      suspendContext();
      return;
    }

    if (!createContext()) return;
    master.gain.setTargetAtTime(0.65, context.currentTime, 0.02);
    resumeContext();
  }

  function play(type, intensity) {
    if (!context || !master || !canResume() || context.state !== 'running') return;

    const amount = Math.max(0, Math.min(1, intensity));
    const audioTimeSeconds = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const sounds = {
      wheel: { wave: 'triangle', from: 82, to: 62, duration: 0.12, volume: 0.065 },
      ollie: { wave: 'sine', from: 190, to: 390, duration: 0.17, volume: 0.14 },
      landing: { wave: 'triangle', from: 104, to: 54, duration: 0.21, volume: 0.17 },
      grind: { wave: 'sawtooth', from: 215, to: 145, duration: 0.14, volume: 0.06 }
    };
    const sound = sounds[type];
    if (!sound) return;

    oscillator.type = sound.wave;
    oscillator.frequency.setValueAtTime(sound.from + amount * 34, audioTimeSeconds);
    oscillator.frequency.exponentialRampToValueAtTime(sound.to + amount * 22, audioTimeSeconds + sound.duration);
    envelope.gain.setValueAtTime(0.0001, audioTimeSeconds);
    envelope.gain.linearRampToValueAtTime(sound.volume * (0.65 + amount * 0.35), audioTimeSeconds + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, audioTimeSeconds + sound.duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
    oscillator.start(audioTimeSeconds);
    oscillator.stop(audioTimeSeconds + sound.duration + 0.01);
    events[type]++;
  }

  function updateGameplayAudio(state) {
    const nowMs = performance.now();

    if (previousGrounded === true && !state.grounded && state.name === 'OLLIE') {
      play('ollie', Math.min(1, Math.abs(state.speed) / 16));
    }
    if (previousGrounded === false && state.grounded) {
      play('landing', Math.min(1, Math.abs(state.speed) / 20));
    }
    if (!previousGrinding && state.grinding) {
      play('grind', Math.min(1, Math.abs(state.speed) / 16));
      nextGrindAtMs = nowMs + grindEntryIntervalMs;
    }

    if (state.grinding && nowMs >= nextGrindAtMs) {
      play('grind', Math.min(1, Math.abs(state.speed) / 16));
      nextGrindAtMs = nowMs + grindRepeatIntervalMs;
    } else if (state.grounded && !state.grinding && Math.abs(state.speed) > 1 && nowMs >= nextWheelAtMs) {
      play('wheel', Math.min(1, Math.abs(state.speed) / 18));
      nextWheelAtMs = nowMs + Math.max(160, 320 - Math.min(160, Math.abs(state.speed) * 6));
    } else if (!state.grounded || state.grinding) {
      nextWheelAtMs = nowMs + grindEntryIntervalMs;
    }

    previousGrounded = !!state.grounded;
    previousGrinding = !!state.grinding;
  }

  window.addEventListener('pointerdown', unlockFromGesture, { capture: true });
  window.addEventListener('keydown', unlockFromGesture, { capture: true });
  toggle.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  });
  toggle.addEventListener('click', event => {
    if (!event.isTrusted) return;
    setMuted(!muted);
  });
  window.addEventListener('blur', () => {
    blurred = true;
    suspendContext();
  });
  window.addEventListener('focus', () => {
    blurred = false;
    resumeContext();
  });
  window.addEventListener('pagehide', suspendContext);
  window.addEventListener('pageshow', resumeContext);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendContext();
    else resumeContext();
  });
  window.addEventListener('sol-controls-help-state', event => {
    helpOpen = !!event.detail?.open;
    if (helpOpen) suspendContext();
    else resumeContext();
  });

  const scene = window.__SOL_DIAGNOSTICS__?.scene;
  const state = window.__SOL_DIAGNOSTICS__?.state;
  if (!scene?.onAfterRenderObservable || !state) {
    toggle.disabled = true;
    console.warn('SOL SKATE audio feedback could not find the active gameplay scene.');
    return;
  }

  scene.onAfterRenderObservable.add(() => updateGameplayAudio(state));
  window.SOLAudio = {
    status() {
      return {
        muted,
        unlocked: !!context,
        contextState: context?.state || 'uninitialized',
        events: { ...events }
      };
    }
  };
  window.__SOL_DIAGNOSTICS__.audio = window.SOLAudio;
})();
