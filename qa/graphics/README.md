# Ramp, board and rider verification

Base: `1cc0c744e7e82553f390e0398641306e90dd9c44` (main inspected again after it advanced during development).

## Reproduced defect

Real Chromium/WebGL reproduced apparently transparent bank and quarterpipe
tops. Their materials had alpha 1 and were pickable, but their cloned dynamic
textures were not ready. Babylon skipped drawing them. The same defect affected
the cloned plaza material, exposing the lower foundation and displacing visible
shadows. The ramp lighting normals also pointed inward.

The presentation pass explicitly shares uploaded textures and computes outward
lighting normals without changing the sealed mesh topology or contact profile.
Before/after screenshot pixel samples on the bank rise from about 133–135 to
174–176 luminance; the test requires a visible change, uploaded textures and
opaque surfaces on every riding skin.

## V2 Blender inspection

The local `SOL-SKATE-ASSET-LAB` contained the three V2 GLBs, a Blender review
scene, generation script, validation summary and review PNGs. The actual GLB
headers, geometry, materials, skins and animations were inspected, along with
the deck, truck and character review renders. Exact hashes and counts are in
`asset-inspection.json`.

- **Board:** 120,340 bytes, 27 meshes, 5,400 triangles. The authored concave maple
  deck and grip are imported into `board_v2.js` with a reproducible converter.
  A 0.043 m vertical offset aligns the deck center to the existing 0.235 m stance.
  Original animated wheels, trucks, board pivot and physics remain. The existing
  procedural deck is a fallback if the V2 script is unavailable.
- **Skater:** 101,020 bytes, a 20-bone skin and one `SOL_PushLoop` animation.
  It is not yet mapped to the game's trick, grab, grind and terrain poses.
  Retain the working detailed rider and add woven cloth/matte material shading.
- **Park:** 826,912 bytes, 133 meshes, 25,480 triangles. Do not substitute an
  independent art mesh for the shared analytical collision/riding surfaces
  without a profile-by-profile fit test. The verified ramp fix retains those
  surfaces and applies the concrete material pass directly.

PR #9 was inspected: its change is an Xbox ollie timing assertion, not assets.
No changes from that PR were merged by this task.

## Validation and reproduction

Install `playwright@1.55.1` and `babylonjs@8.56.2`, then install Playwright Chromium.

- `node tests/board_v2.cjs`: source hash, valid indices, finite coordinates,
  authored grip inset and stance alignment.
- `node tests/visuals_browser.cjs`: actual Chromium/WebGL, before/after texture
  readiness, outward normals, captured ramp pixels, six matching camera views,
  mobile controls, per-frame ollie/kick/heel/shove flight, push and steering.
- `node tests/browser_smoke.cjs`: full existing mobile geometry/gameplay suite,
  halfpipe airs/landings, coping/grinds/boardslides, bowl raycasts, Xbox emulation.
- `node tests/input_browser.cjs`: keyboard chords, outside touch release, Xbox
  mapping/release, denied Gamepad API, WebGL recovery and playable fallback.
- `node tests/bowl_browser.cjs`: ten uninterrupted airs and landings, no recovery
  teleports or page errors.
- Existing logic suites: controller, terrain, obstacles, grind, motion, wheels,
  landing, inline integration, push, ramp mesh, halfpipe, input, bowl, board
  geometry and pump physics.

The coping smoke assertion now samples the initial capture and advances its
blend in one browser task, retaining the same height/smoothness assertions.
This avoids observing an already-completed blend after a slow browser round trip.

The visual acceptance workflow uploads the generated PNGs and JSON from
`test-artifacts/visuals/`. `visual-result.json` records the local browser result.

## Limits

This is a procedural/low-poly art improvement with an authored V2 deck, not
photorealistic character animation. Physical Android/Samsung Internet and Xbox
Bluetooth testing has not been performed. Software Chromium rendering is not a
mobile hardware performance benchmark. No merge or deployment is part of this PR.
