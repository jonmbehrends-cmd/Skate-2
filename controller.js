/* SOL SKATE controller adapter v0.1 — Standard Gamepad mapping for mobile browsers. */
(function (root) {
  'use strict';
  let selected = null;
  let lastButtons = [];
  let rightArmed = true;
  let lastFlick = -Infinity;
  const deadzone = value => {
    const v = Number.isFinite(value) ? value : 0;
    return Math.abs(v) < .16 ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - .16) / .84);
  };
  const read = (buttons, index) => !!(buttons[index] && buttons[index].pressed);
  function reset() {
    selected = null;
    lastButtons = [];
    rightArmed = true;
    lastFlick = -Infinity;
  }
  function poll(onTrick, now) {
    const time = Number.isFinite(now) ? now : performance.now();
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad = selected === null ? null : pads[selected];
    if (!pad || !pad.connected) pad = Array.from(pads).find(p => p && p.connected);
    if (!pad) {
      reset();
      return { x: 0, y: 0, boost: false, connected: false, status: '🎮 Press a controller button' };
    }
    if (selected !== pad.index) {
      selected = pad.index;
      lastButtons = pad.buttons.map(b => !!b.pressed);
      rightArmed = false; // Prevent a trick firing immediately on reconnection.
    }
    const b = pad.buttons;
    const pressed = i => read(b, i);
    // Xbox Standard mapping: A ollie, X kickflip, B heelflip, Y shove-it, RB grab.
    for (const [i, action] of [[0, 'ollie'], [2, 'kick'], [1, 'heel'], [3, 'shove'], [5, 'grab']]) {
      if (pressed(i) && !lastButtons[i]) onTrick(action);
    }
    lastButtons = b.map(v => !!v.pressed);
    // Optional right-stick flick: up=ollie, left=kickflip, right=heelflip,
    // down=shove-it. Re-center before the next flick. Face buttons remain usable.
    const rx = deadzone(pad.axes[2] || 0), ry = deadzone(pad.axes[3] || 0);
    const magnitude = Math.hypot(rx, ry);
    if (magnitude < .3) rightArmed = true;
    if (rightArmed && magnitude > .82 && time - lastFlick > 220) {
      const action = Math.abs(rx) > Math.abs(ry) ? (rx < 0 ? 'kick' : 'heel') : (ry < 0 ? 'ollie' : 'shove');
      onTrick(action);
      lastFlick = time;
      rightArmed = false;
    }
    // D-pad fallback helps controllers that expose their left stick unreliably.
    let x = deadzone(pad.axes[0] || 0), y = deadzone(pad.axes[1] || 0);
    if (!x) x = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
    if (!y) y = (pressed(13) ? 1 : 0) - (pressed(12) ? 1 : 0);
    return {
      x, y, boost: pressed(7), connected: true,
      status: '🎮 ' + (/xbox/i.test(pad.id || '') ? 'Xbox connected' : 'Controller connected') + ' · LS steer · RT push · RS flick'
    };
  }
  root.SOLPad = { poll, reset, deadzone };
})(window);
