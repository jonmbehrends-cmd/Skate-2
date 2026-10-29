# Production animation CPU profile

Measurement-only follow-up to PR47's independent review. This branch changes no gameplay, animation, controls or rendering source. Main baseline: `9fcb022d1c96fcc6152818dad958bd0870fcb28b`.

`tools/animation_profile.cjs` loads the real game, bundled Babylon **8.32.1** and real hoodie GLB in Chromium/SwiftShader. A second page aborts the GLB request to exercise the actual V2 fallback. Visibility is recorded: the production page has a visible hoodie and hidden V2; the fallback page has visible V2. No substitute rig or engine is used.

## Method

- Ten workloads: ride, push, ollie takeoff, steady air, flip, shove, grab, grind, boardslide and landing. Canned state/pose objects are reused and frozen during direct measurements, avoiding harness allocations and detecting accidental state writes.
- Direct measurements use 30 batches of 200 workload iterations after 400 warm-up iterations. Raw batch times, medians and p95 are retained. Takeoff and landing are two-update transition workloads (ground→air and air→ground); all others use one update. Units are **per workload iteration**, not uniformly per update.
- Two direct regimes: repeated updates in one render id, and a fresh update id plus final palette preparation at the next render boundary. The latter includes skeleton work for both rigs. The former intentionally exposes the engine's same-render-id cache and must not be presented as complete per-frame animation cost.
- The production callback is separately exercised at exactly 1/2/4/10 substeps using a virtual simulation clock advancing 16.667/50/100/250 ms. The original real CPU timer is retained. Every sampled callback asserts the actual V2 and hoodie call counts. Five warm-up callbacks and 30 sampled callbacks per workload/substep case are used.
- Rendering is suppressed for callback CPU attribution, separating simulation, animation and DOM work from SwiftShader raster/presentation. Wrapper timings report V2, hoodie, pose and wheel sampling; the remainder includes physics, legacy pose-driver assignments, DOM updates and measurement overhead. Nested skeleton preparation/build timers are recorded but must not be added again to updater totals. This is not full-frame time or FPS.
- GC and heap observations use exposed GC and precise heap counters around 10,000 mixed workload iterations per rig. Transitions produce extra updates, which are counted. Heap growth before GC and retained heap after GC are observations, not total allocated bytes; natural GC may occur inside a batch.
- A real-engine probe counts `_computeTransformMatrices` calls after a first update, a second update in the same render id, and the next render id. This verifies caching behavior rather than relying on recollection of Babylon internals. It does not establish pose equivalence for a future optimization.

All results are descriptive measurements on a shared host. There is no optimized variant, randomized A/B speedup estimate, physical-phone trace or FPS claim. Direct workloads do not include all production ancestor/legacy pose-driver work. Callback shares include instrumentation overhead and should guide a preservation experiment, not promise savings.

## Reproduce

With the existing Playwright test dependencies and Chromium installed:

```text
node tools/animation_profile.cjs
```

Results are written to `test-artifacts/animation-profile/result.json`. Environment variables `ANIMATION_BATCHES`, `ANIMATION_CALLS`, `ANIMATION_FRAMES`, `ANIMATION_WARMUP` and `ANIMATION_HEAP_ITERATIONS` override the defaults. A 2/10/2/20/100 harness check verifies startup, real fallback, transition workloads, all forced substep counts and report generation; it cannot support a performance conclusion.

The full run and its interpretation will be recorded here after measurement. PR47 remains independently held; this profiler does not make its noisy rendering experiment conclusive.
