# SOL SKATE — WebGL 3D Alpha

Galaxy-first skateboarding prototype using **Babylon.js/WebGL** with a third-person follow camera, 3D skateboard and skater, rideable banks and curved quarterpipe kickers with shared mesh/contact geometry and lip transfers, rails, ledges, frame-rate-independent 25 ms physics substeps, airborne tricks with acceleration-limited board rotation, landing-angle validation, height-gated rail grinds with bidirectional travel, speed loss and natural dismounts, swept side collisions with ledges/manual pads, airborne wall-normal momentum projection and tangential slides, elevated platform landings, walk-off drops, and combo scoring. The earlier 2D perspective prototype remains in `legacy.html`.

## Play

Open the GitHub Pages build at https://jonmbehrends-cmd.github.io/Skate-2/ in Samsung Internet or Chrome. The page loads Babylon.js from its CDN, so internet access is required. If WebGL or the CDN fails, use the legacy prototype for troubleshooting.

## Xbox Bluetooth controller (Standard Gamepad mapping)

- **Left stick**: steer (horizontal) and accelerate/brake (vertical).
- **Right trigger (RT)**: hold to push/accelerate.
- **A / X / B / Y**: ollie / kickflip / heelflip / shove-it.
- **RB**: grab.
- **Right stick flick**: up ollie, left kickflip, right heelflip, down shove-it. Re-center before the next flick.
- **D-pad**: directional fallback.
- **Touch**: left virtual stick plus trick buttons, including PUSH.

Pair the controller with Android before launching. Some Android browser/controller combinations expose nonstandard axis mappings; these require device validation.

## Development

- Entry point: `index.html`, with `controller.js`, `landing.js`, `terrain.js`, `obstacles.js` `grind.js`, `motion.js`, and `wheels.js` loaded before the inline Babylon game logic.
- `landing.js` advances roll and yaw angles with bounded angular acceleration and speed. A trick must actually finish its rotations before touchdown; insufficient airtime now bails. Rail attachments require a stable board, and restart resets angular state.
- `motion.js` applies ground-only pushing and throttle, carving drag, low-power aerial steering, and prevents midair RT acceleration; grinding retains its own friction model. Takeoff now locks world-space horizontal velocity, so turning the board in midair does not redirect its trajectory. Sideways landings bail when heading and travel disagree by more than roughly 60 degrees.
- `motion.js` also resolves sidewall, obstacle, and park-boundary impacts against world-space airborne velocity, removing inward motion while retaining damped tangential slides.
- `wheels.js` samples all four truck/wheel contact points to tilt the board on curved ramps and uneven ledges, raises the visual deck to prevent wheel clipping, and computes landing impact relative to the slope using true world-space airborne velocity. This is not yet a full rigid-body suspension.
- `grind.js` detects rail-top crossing only while descending with a stable board, sufficient speed and parallel heading; constrains travel to the rail, applies friction and combo points, and releases the board naturally at the endpoint or low speed. Ollie/trick dismounts impose a reattachment cooldown.
- Run `node --check controller.js && node --check landing.js && node --check terrain.js && node --check obstacles.js && node --check grind.js && node --check motion.js && node --check wheels.js && node tests/controller.cjs && node tests/landing.cjs && node tests/terrain.cjs && node tests/obstacles.cjs && node tests/grind.cjs && node tests/motion.cjs && node tests/wheels.cjs && node tests/check_inline.cjs` for input, physics and integration syntax checks. The separate `SOL SKATE logic regression` GitHub Actions workflow runs these Node checks on each push.
- Optional local Galaxy-sized Chromium touch emulation can exercise the physics module. This is not a physical Android/Xbox test.
- GitHub Actions workflow `.github/workflows/deploy.yml` publishes the repository on pushes to `main`, if Pages is configured for GitHub Actions.
- `window.__SOL_DIAGNOSTICS__` exposes the Babylon scene and simulation state for browser testing.

## Known limitations

This is an early **true WebGL 3D** prototype, not console-grade graphics or a complete physics simulation. Ramp contact, curved kickers and lip launch follow the same analytical profile as rendered geometry, and four-wheel support now improves deck pose, but bowls and full rigid-body wheel physics remain simplified, angular rotation is still kinematic rather than rigid-body physics, and complex multi-contact rigid-body collisions and advanced park objectives remain incomplete. Physical Samsung Galaxy and Xbox Bluetooth hardware testing has **not** been performed by the automated workshop. Publishing the source does not by itself confirm a successful Pages deployment.

## Next milestones

1. Validate live Pages deployment and Samsung Internet/Xbox mappings on hardware.
2. Improve contact-aware landings, board/terrain collisions, and realistic airborne inertia beyond kinematic angular motion.
3. Add bowls, refined ramp-wall corner contact, more precise truck/rail alignment, and rail-side transfer geometry.
4. Add objectives, combo challenges, audio, performance budgets, and graphics improvements.

## R16 ramp, grind and V2 integration

Ramp volumes now use Babylon's left-handed winding so their lighting normals point outward. Cloned concrete materials explicitly share the uploaded source texture: alpha=1 alone did not prevent Babylon from skipping a surface with an unready cloned DynamicTexture.

GRIND (touch, G, Xbox LB) engages a nearby rail as a 50-50 without dispatching OLLIE. Away from a rail it arms a 2.2-second catch request. OLLIE retains its own jump; BOARD SLIDE retains its existing assisted jump and sideways stance. Incomplete board rotations still prevent catches.

The recovered Gemini V2 deck and 20-bone rider are connected to the existing board pivot and production pose updates. The rider follows riding, pushing, flips, shoves, grabs, grinds, boardslides and landing compression; the skin does not write physics state. The original procedural deck and rider nodes remain available as fallback/pose drivers. Importers in tools/ reproduce the runtime assets from the reviewed local GLBs and include source hashes.

Validation: existing logic/geometry suites, Chromium gameplay/input/recovery, ten uninterrupted bowl airs, plus tests/ramp_grind_browser.cjs (desktop/mobile render readiness, camera views and touch/keyboard/Xbox actions) and tests/skater_v2_browser.cjs (eight skin poses). Physical Samsung/Xbox hardware remains untested.

## Controls help

Open Controls for keyboard, touch and Xbox mappings. The dialog releases held inputs, suppresses gameplay hotkeys and gamepad input while open, supports Enter/Space activation, Escape and focus return, and scrolls on short touch screens. GRIND remains a 50-50 catch action; OLLIE and assisted BOARD SLIDE stay separate.

The panel originated in Copilot PR #39. This integration applies only its help UI and input-suspension changes to current R16 main, with additional keyboard and touch-scroll fixes. `node tests/controls_help_browser.cjs` covers desktop, portrait and landscape mobile behavior, including a real touch scroll gesture.

## Optional audio feedback

The persistent, keyboard-focusable Sound toggle enables or mutes short procedural Web Audio cues for wheel roll, ollies, landings and grinds. Audio starts silent until a trusted browser gesture unlocks it; browsers that block or do not support Web Audio remain playable. The single AudioContext is suspended when the tab loses focus, becomes hidden, or Controls help opens, and resumes when the page is active again. No audio files or third-party audio libraries are used.

Run `node tests/audio_feedback_rate.cjs` to verify wheel/grind cue deadlines deterministically at 30, 60 and 120 FPS and confirm ended oscillators and envelopes disconnect. Run `node tests/audio_feedback_browser.cjs` to verify startup silence, saved mute preference, context reuse, gameplay cues, focus/help/visibility suspension and resume, and toggle layout in Chromium desktop, mobile portrait and mobile landscape. The hidden-page transition is simulated with the browser visibility event because headless Chromium does not reliably background tabs. These validate browser audio scheduling, not subjective sound quality or physical-device speakers.
