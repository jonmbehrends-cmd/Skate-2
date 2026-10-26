# SOL SKATE — WebGL 3D Alpha

Galaxy-first skateboarding prototype using **Babylon.js/WebGL** with a third-person follow camera, 3D skateboard and skater, rideable banks and curved quarterpipe kickers with shared mesh/contact geometry and lip transfers, rails, ledges, frame-rate-independent 25 ms physics substeps, airborne tricks with acceleration-limited board rotation, landing-angle validation, basic grinds, swept side collisions with ledges/manual pads, elevated platform landings, walk-off drops, and combo scoring. The earlier 2D perspective prototype remains in `legacy.html`.

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

- Entry point: `index.html`, with `controller.js`, `landing.js`, `terrain.js` and `obstacles.js` loaded before the inline Babylon game logic.
- `landing.js` advances roll and yaw angles with bounded angular acceleration and speed. A trick must actually finish its rotations before touchdown; insufficient airtime now bails. Rail attachments require a stable board, and restart resets angular state.
- Run `node --check controller.js && node --check landing.js && node --check terrain.js && node --check obstacles.js && node tests/controller.cjs && node tests/landing.cjs && node tests/terrain.cjs && node tests/obstacles.cjs && node tests/check_inline.cjs` for input, physics and integration syntax checks. The separate `SOL SKATE logic regression` GitHub Actions workflow runs these Node checks on each push.
- Optional local Galaxy-sized Chromium touch emulation can exercise the physics module. This is not a physical Android/Xbox test.
- GitHub Actions workflow `.github/workflows/deploy.yml` publishes the repository on pushes to `main`, if Pages is configured for GitHub Actions.
- `window.__SOL_DIAGNOSTICS__` exposes the Babylon scene and simulation state for browser testing.

## Known limitations

This is an early **true WebGL 3D** prototype, not console-grade graphics or a complete physics simulation. Ramp contact, curved kickers and lip launch follow the same analytical profile as rendered geometry, but bowls, rail contact and full rigid-body wheel physics remain simplified, angular rotation is still kinematic rather than rigid-body physics, and obstacle collision and advanced park objectives remain incomplete. Physical Samsung Galaxy and Xbox Bluetooth hardware testing has **not** been performed by the automated workshop. Publishing the source does not by itself confirm a successful Pages deployment.

## Next milestones

1. Validate live Pages deployment and Samsung Internet/Xbox mappings on hardware.
2. Improve contact-aware landings, board/terrain collisions, and realistic airborne inertia beyond kinematic angular motion.
3. Add bowls, refined ramp-wall corner contact and stable rail transitions.
4. Add objectives, combo challenges, audio, performance budgets, and graphics improvements.
