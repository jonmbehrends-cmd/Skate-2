# Rider preservation gates

Run `node tests/rider_preservation_gates.cjs` with Playwright Chromium installed.
The fixture loads the shipped Babylon 8.32.1 bundle, loader, V2 data and real
hoodie GLB. Its small host hierarchy is test-owned; production composition is
covered separately by `animation_ancestor_probe.cjs`.

Seven deterministic traces check every substep's landing, takeoff, modes, push
compression, and grab release against source arithmetic and independent scalar
anchors. Grind uses the actual `SOLGrind.attach` contract: grounded is false.
Rendered snapshots compare V2 bone matrices/palettes/joints and sixteen hoodie
joint world matrices, its skin palette and contact diagnostics. Repeated runs
must match exactly; hoodie presence must preserve the hidden V2 pose.

Missing assets and an empty loader container must leave no graph/visibility
changes. Disposing the hoodie must restore V2 before its first visible render.
Intentional broken strategies must expose lost intermediate landing edges and
a stale revealed V2 pose. Comparator controls reject NaN, mismatched container
types and asymmetric keys. No proposed counter or future candidate API is
reported as a passing test. Results are written to
`test-artifacts/rider-preservation.json`.

These are correctness tests using software-rendered Chromium, not performance
measurements or evidence of physical mobile frame rates. No runtime optimization
or physics change is included.
