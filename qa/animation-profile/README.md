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

## Recorded full run

[Full raw report](result.json), measurement source `556507e47c0b3f25125dc8598546192e703fc326`, Chromium 140.0.7339.186, production Babylon 8.32.1. Both variants completed: 60 direct workload/regime cases (30×200 iterations each), 80 callback workload/substep cases (30 samples each after warm-up), and 10,000 mixed workload iterations per rig. Each mixed sequence generated 12,000 updates because takeoff and landing are transitions.

Production ride callback attribution is shown below. These are **instrumented callback CPU costs with rendering suppressed**, not frame times, phone timings, predicted savings or treatment effects. Each row's percentage is the median of sample-level shares, not a ratio of separately reported medians.

| Substeps | Virtual elapsed (ms) | Callback median (ms) | Hidden V2 median share | Visible hoodie median share |
|---:|---:|---:|---:|---:|
| 1 | 16.667 | 2.60 | 16.2% | 61.8% |
| 2 | 50 | 4.75 | 15.5% | 67.1% |
| 4 | 100 | 9.45 | 12.6% | 73.4% |
| 10 | 250 | 21.70 | 11.9% | 74.5% |

Fallback ride callback medians were 0.40 / 0.60 / 0.65 / 1.40 ms at 1/2/4/10 steps, with V2 shares 50.0% / 50.0% / 64.6% / 68.6%. This is a different page, rig configuration and execution order. It is **not** an A/B estimate of removing the hoodie or hidden V2.

For direct new-render-id workloads, production V2 ride/push/grab medians were 0.1125 / 0.1075 / 0.1145 ms per iteration. Hoodie medians were 2.3508 / 2.5125 / 3.1095 ms. Landing transitions were 0.1932 ms for V2 and 4.8705 ms for hoodie, each including **two updates**. This regime includes final palette preparation; it is not directly interchangeable with callback updater shares. Cache/order/host conditions differ across these buckets. GPU texture submission inside palette preparation can also contribute to elapsed CPU-clock time.

Some small per-function callback counters are zero at the available clock resolution. They do not establish zero work. Batching makes direct measurements less sensitive to that quantization. Raw p95/ranges and every batch/sample are retained; no noisy tails have been removed.

### Engine preparation and heap observations

The actual Babylon `_computeTransformMatrices` probe produced **1 / 0 / 1** builds after first update / second update in the same render id / preparation at the next render id, for both rigs and both available configurations. This confirms the render-id early return in bundled 8.32.1. It does not prove that skipping intermediate bone writes preserves a final pose.

| Configuration / rig | Before batch (bytes) | Before forced GC | After forced GC |
|---|---:|---:|---:|
| Production / hidden V2 | 64,525,944 | 94,460,876 | 64,281,020 |
| Production / hoodie | 64,281,468 | 69,074,768 | 64,283,864 |
| Fallback / V2 | 56,351,537 | 84,652,921 | 56,134,313 |

GC was available in every case. These are heap observations around 10,000 workload iterations / 12,000 updates. Natural collection may occur within a batch; the differences do not measure total allocations or prove a leak.

## Shared-transform preservation probe

Claude's independent source review identified a possible hidden dependency: V2 forces shared driver matrices before the hoodie reads them. `tests/animation_ancestor_probe.cjs` compares three real-game pages: unchanged V2; V2's update omitted; and V2 replaced only by explicit skater/body/stance/board refreshes. No production source is patched. The probe renders normally and then reads the matrices and palettes available to that render, without forcing a corrective refresh.

Ten moving/pose cases × 1/2/4/10 substeps produced 40 cases per page, 120 rendered cases total. Each comparison included 18 selected joint world matrices, actual skin palettes, hand/foot contacts, physics state and grab-helper visibility. Both omission and explicit-refresh variants matched the unchanged baseline exactly: maximum world, palette and contact delta **0**; physics states equal; helpers hidden. Coverage and per-case results are in [the summary](ancestor-probe-summary.json); [the gzip archive](ancestor-probe.json.gz) retains all raw matrices and palettes. The summary records the probe file's SHA-256 and raw-report hash. The final probe was rerun at integration source `850cdc8da0f33907b152d4f762caf3b664fc87e3`, including deployed input PR49 and main `a558e1a`; the hoodie module remains identical to the measurement baseline. It asserts actual production substep counts and nonempty, finite joint/palette coverage.

The normal hoodie acceptance workflow now runs this probe and retains its raw artifact. It requires the explicit-refresh control to preserve the baseline and all diagnostic variants to preserve physics. Omission differences are recorded as findings rather than failing the build: omitting V2 is not production behavior. The long timing profiler remains an intentional local run and is not a timing gate in CI.

This result reduces the shared-matrix concern for these cases. It does **not** prove hot fallback reveal, arbitrary parent hierarchies, intermediate land→launch events, or an optimized observe-only state machine. The omission path deliberately stops the hidden V2 state machine, so it is a diagnostic experiment, not a shippable standby implementation.

## Decision

The visible hoodie is a larger CPU attribution target in the sampled production callbacks. Hidden V2 also performs measurable work, including at one substep. Neither observation establishes the benefit of a proposed optimization. Once-per-render retargeting cannot save repeated substep work at one substep; hidden-rider standby is a separate proposal.

Before a runtime change, preserve every landing/takeoff observation and decay step, confirm pose/palette equivalence at matched substep counts, verify default direct-call behavior and diagnostic cadence, keep legacy grab helpers hidden, and test dispose/reveal with a fresh V2 pose before the first visible render. Profile a proposed variant separately with interleaved controls before claiming a speedup. No animation optimization ships with this measurement branch. PR47 remains independently held.
