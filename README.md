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

## Ramp and rider graphics verification

`visuals.js` is a presentation-only pass. It shares uploaded dynamic concrete
textures explicitly: Babylon 8.56.2 material clones otherwise hold unready
textures, causing opaque, pickable ramp tops and plaza slabs to be skipped by
the renderer. It also computes outward lighting normals for the existing sealed
ramp geometry and keeps the key light near-vertical so skater shadows stay close
to the rider. The terrain/contact profile, simulation, and animation rig are
unchanged.

The reviewed Gemini `skateboard_v2.glb` deck and grip are imported into
`board_v2.js` by `tools/import_board_v2.cjs`, with a .043 m visual height offset
to match the current stance. The existing board pivot, trucks, animated wheels,
and contact physics remain. The detailed rider receives woven cloth and matte
skin/apparel shading. The V2 skater has a 20-bone rig with one push animation;
trick/grab/grind retargeting is still needed. Its park mesh is not substituted
for shared analytical riding surfaces. See `qa/graphics/README.md` for findings.

Run `npm install --no-save playwright@1.55.1 babylonjs@8.56.2`,
`npx playwright install chromium`, then `node tests/visuals_browser.cjs`.
The test uses real Chromium/WebGL, records before/after cameras, verifies
texture readiness and captured surface pixels, and exercises touch tricks,
push and keyboard steering with per-frame observations. Evidence is written to
`test-artifacts/visuals/` and uploaded by the separate visual acceptance workflow.
This is software-rendered browser QA, not physical Android/Xbox validation.

## Known limitations

This is an early **true WebGL 3D** prototype, not console-grade graphics or a complete physics simulation. Ramp contact, curved kickers and lip launch follow the same analytical profile as rendered geometry, and four-wheel support now improves deck pose, but bowls and full rigid-body wheel physics remain simplified, angular rotation is still kinematic rather than rigid-body physics, and complex multi-contact rigid-body collisions and advanced park objectives remain incomplete. Physical Samsung Galaxy and Xbox Bluetooth hardware testing has **not** been performed by the automated workshop. Publishing the source does not by itself confirm a successful Pages deployment.

## Next milestones

1. Validate live Pages deployment and Samsung Internet/Xbox mappings on hardware.
2. Improve contact-aware landings, board/terrain collisions, and realistic airborne inertia beyond kinematic angular motion.
3. Add bowls, refined ramp-wall corner contact, more precise truck/rail alignment, and rail-side transfer geometry.
4. Add objectives, combo challenges, audio, performance budgets, and graphics improvements.
