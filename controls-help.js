(function () {
  'use strict';

  const trigger = document.createElement('button');
  trigger.id = 'controls-help-toggle';
  trigger.type = 'button';
  trigger.textContent = 'Controls';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'controls-help-dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const dialog = document.createElement('dialog');
  dialog.id = 'controls-help-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'controls-help-title');
  dialog.setAttribute('aria-describedby', 'controls-help-description');
  dialog.innerHTML = `
    <header>
      <h2 id="controls-help-title">Controls</h2>
      <button type="button" data-close aria-label="Close controls help">Close</button>
    </header>
    <p id="controls-help-description" class="controls-note">
      Your controls at a glance. Opening help releases held inputs.
    </p>
    <div class="controls-grid">
      <section aria-labelledby="controls-keyboard-title">
        <h3 id="controls-keyboard-title">Keyboard</h3>
        <dl>
          <div><dt>W</dt><dd>Push / accelerate</dd></div>
          <div><dt>A / D</dt><dd>Steer left / right</dd></div>
          <div><dt>Space</dt><dd>Ollie</dd></div>
          <div><dt>G</dt><dd>Request a grind</dd></div>
          <div><dt>R</dt><dd>Restart run</dd></div>
        </dl>
      </section>
      <section aria-labelledby="controls-touch-title">
        <h3 id="controls-touch-title">Touch</h3>
        <dl>
          <div><dt>Left stick</dt><dd>Steer; push up / slow down</dd></div>
          <div><dt>Ollie / Kick / Heel / Shove</dt><dd>Tricks</dd></div>
          <div><dt>Grab / Push</dt><dd>Hold grab / push</dd></div>
          <div><dt>Grind / Board Slide</dt><dd>Request a rail trick</dd></div>
        </dl>
      </section>
      <section aria-labelledby="controls-xbox-title">
        <h3 id="controls-xbox-title">Xbox controller</h3>
        <dl>
          <div><dt>Left stick</dt><dd>Steer / accelerate / slow</dd></div>
          <div><dt>RT</dt><dd>Push</dd></div>
          <div><dt>A / X / B / Y</dt><dd>Ollie / kickflip / heelflip / shove-it</dd></div>
          <div><dt>RB / LB</dt><dd>Grab / grind</dd></div>
          <div><dt>R3</dt><dd>Board slide</dd></div>
          <div><dt>Right-stick flick</dt><dd>Up ollie, left kickflip, right heelflip, down shove-it</dd></div>
          <div><dt>D-pad</dt><dd>Steering fallback</dd></div>
        </dl>
      </section>
    </div>
    <p class="controls-note">Use the on-screen Halfpipe and Restart buttons for those actions.</p>
    <button type="button" data-close>Done</button>
  `;

  document.body.append(trigger, dialog);

  function setOpen(open) {
    window.dispatchEvent(new CustomEvent('sol-controls-help-state', {
      detail: { open }
    }));
  }

  function closeDialog() {
    if (!dialog.open) return;
    dialog.close();
    trigger.setAttribute('aria-expanded', 'false');
    setOpen(false);
    trigger.focus();
  }

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    setOpen(true);
    dialog.querySelector('[data-close]').focus();
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) closeDialog();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener('touchmove', event => event.stopPropagation(), { passive: true });

  window.addEventListener('keydown', event => {
    if (!dialog.open || event.key === 'Escape' || event.key === 'Tab') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
