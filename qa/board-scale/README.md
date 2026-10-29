# Board scale candidate

Open the branch build with `?board=realistic` to try Claude's coordinated scale proposal. The default and `?board=legacy` retain the production dimensions. `legacy.html` is unchanged.

The deck changes from 1.65 × 0.55 to approximately 0.921 × 0.234 game units. Trucks, wheels, wheel-sampling positions and hoodie foot/grip targets share the dimensions module. The vertical mapping fixes the original wheel-bottom plane, retaining the existing ride height. Positions use the affine mapping; lengths use scale factors. Wheel width uses its own target rather than the wheel-diameter scale.

The proposed 1.78 reference stature is an art-direction assumption. These are proposed proportions, not measurements of the licensed character or a surveyed board. The original claim that the module alone guarantees sole contact is not accepted: each character's skinned sole must be checked in its complete running pose.

Integration also shifts the V2 fallback's pelvis, feet and grip with the deck. Existing hoodie shallow-vert and ankle-flick logic remains. The experimental scale flag deliberately does not enable by default.

Local checks: dimensions/contact invariants; existing hoodie, V2 and wheel suites; actual desktop/mobile Chromium startup and screenshots with both the production hoodie and forced GLB-load-failure fallback. Additional trusted-input PUSH/OLLIE/landing acceptance is included in `tests/board_scale_browser.cjs` and CI.

Before enabling by default, inspect rendered sole contact throughout push recovery, both flips, grabs, both grind types and landing; measure pitch continuity on the smaller wheelbase; review side/opposite views and the fallback. Existing seated-grab anatomy work is outside this change. A startup or input pass is not full anatomical acceptance.

External contribution: Claude supplied the dimensions and builder proposal plus hoodie anchor edits. Its only reported execution was a Node math/invariant check. Integration corrected the wheel-width scaling, added input validation and immutable nested anchors, made the candidate opt-in, and added the V2 fallback adaptation. No external browser-test claim is made.
