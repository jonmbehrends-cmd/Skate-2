# Local architecture batching: validation and experiment

This branch remains unmerged. Fewer draw submissions are verified; a device speedup has not been established. The earlier sequential timing experiment is preserved in [legacy/](legacy/README.md) and is not used to infer performance on current main.

## Current geometry and rendering

The baseline fixture is the unbatched component from main `cc81a51`. Both variants contain the same mural artwork. Architecture becomes 63 meshes instead of 150 (87 fewer objects). Only opaque, noninteractive component geometry is batched by material, shadow-receiver flag, and 40m spatial cell. Named mural planes remain independent. All 64 painted triangles (eight panels and four box fascias) are preserved, independently of their merged object count.

The local V2-rider validation used the scene at `cc81a51`: 436 → 349 meshes. Main subsequently added the licensed hoodie character and bundled Babylon 8.32.1. Hosted acceptance against that main (`68d7356`) passed at PR head `322c1f3`, merge checkout `3f3c91f`: 447 → 360 meshes, again 87 fewer. [The hosted result](hoodie-integration-result.json) records all 12 cases and links the exact job. These are separate integration records; the long local timing experiment remains pinned to its original source revision.

The unit test compares indexed world-space triangles, winding, normals, UVs, materials and shadow flags at 1mm positional precision. It also checks local bounds and component disposal. The component owns five materials and one atlas; its dispose method now releases those as well as its meshes. The production call site builds the component once during page initialization; restarting a run does not rebuild the scene. The baseline's incomplete material disposal predates batching.

The browser test now requires exact equality of every RGB pixel. It compares six cameras at desktop 960×720 and mobile 390×844: spawn, park, both perimeter walls, halfpipe, and a rider standing on the deck. Physics is frozen after a deterministic idle pose; the real rider, shadows and current artwork remain visible. Only the HUD is hidden. All 12 comparisons passed with zero channel difference.

A final local rerun with the hoodie integrated also passed all 12 comparisons. It explicitly waits for the production rig and asserts visible skinned meshes, registered rider shadow casters and enabled shadows in every comparison: ten hoodie meshes and ten shadow casters in both variants. [Local results](hoodie-local-result.json) record the runtime revision and test-file hash; the current hoodie images appear below.

Direct WebGL draw calls are counted and cross-checked against Babylon's per-render counter. `SceneInstrumentation` resets that counter before each render, so current is read after the render rather than subtracting a previous frame. The previous static/whole-game tables also differed in viewport, rider visibility and shadow passes; their totals were never interchangeable.

| Fixed-pose view | Desktop GL draws before/after | Mobile GL draws before/after |
|---|---:|---:|
| Spawn | 151 / 151 | 115 / 115 |
| Park | 207 / 181 | 111 / 101 |
| Left wall | 113 / 82 | 96 / 68 |
| Right wall | 117 / 86 | 94 / 65 |
| Halfpipe | 148 / 121 | 104 / 87 |
| Rider on deck | 146 / 116 | 107 / 96 |

This table is the hosted hoodie/Babylon 8.32.1 integration. The earlier local V2/Babylon 8.56.2 result remains in `visual-result.json` and the four images below. Its direct GL counts are valid; its historical `engineDrawDelta` field predates the instrumentation reset correction and is not the current counter API.

The small increase in active indices at cell boundaries is retained in the raw visual results. Batching never removes geometry.

## Paired timing protocol

`tools/render_budget_paired.cjs` measures the render path with simulation frozen. It does not measure FPS, animation speed, or physical mobile performance. The previous wall-clock full-game profiler remains an exploratory tool: its physics substep count depends on host frame intervals and it must not be used to estimate animation savings on a 60 FPS device.

- One Chromium process, eight blocks per viewport. Each block uses ABBA or BAAB plus two baseline A/A control runs, with a fresh page for every run. The entire first block is discarded.
- All five original camera views are timed, including the previously untimed wall and halfpipe views.
- Each camera uses a fixed projection at both a 64×64 render target and full resolution. Rider and shadows are disabled in **both timing conditions**, isolating architectural submission and raster work without a large shadow-map fill cost at 64×64. Rider/shadow preservation is tested separately above.
- Three warm-up renders and five measured renders per condition. Each sample ends with a 1×1 readPixels synchronization. Submission time, synchronized time, sync wait, Babylon render time, active-mesh evaluation time, active indices and GL draw counts are recorded.
- GL-counting wrappers are removed during timed samples. Timing therefore does not include per-draw JavaScript counting overhead.
- A fixed-work JS canary runs before and after each page's measurements, using the median of five batches after ten warm-up calls. A whole block is excluded if any canary differs by more than 10% from the session median. Rejected data remains in the raw report.
- Inference uses block-level paired median percent changes and a seeded 10,000-resample bootstrap 95% interval. Frames within a page are not treated as independent pairs. At least four accepted blocks are required for an interval.
- A submission signal requires lower GL draw counts, both render-time and synchronized-time intervals below zero, and improvements exceeding the corresponding A/A spread. Full-resolution equivalence requires the synchronized interval to lie entirely within a predefined ±5% margin and A/A noise no larger than 5%. An interval merely covering zero does not establish equivalence.
- Three scratch-scene build/dispose measurements per page record construction cost, disposal cost, retained materials and retained atlas. Scratch scenes are then fully cleaned to prevent the baseline's lifecycle leak from affecting subsequent samples.

The raw report records flags, Chromium version, CPU count and OS load averages. Windows does not expose loadavg through Node, so those zeros are explicitly marked unavailable. All local browser rendering uses SwiftShader. Host drift, GPU-driver waits and the readback itself remain limitations; no result supports a claim about phones.

## Paired result: timing remains inconclusive

The full run completed all 96 fresh pages, 4,800 measured renders and 288 scratch build/dispose cycles. [Raw samples, block audit, lifecycle observations and analysis](paired-result.json) are retained. Render measurement source: `9f88e12893801383f1adef0559622f31a05a6c28`; analysis source: `322c1f36ed9dd17fc34a45a36587fb82ca605f3f`. The latter adds the explicit guard that unavailable A/A noise cannot establish equivalence. Production rendering did not change during the run.

| Viewport | Warm-up blocks discarded | Eligible blocks rejected | Accepted blocks | Canary median / range (ms) |
|---|---:|---:|---:|---|
| Desktop | 1 | 7 / 7 | 0 | 3.90 / 3.30–6.80 |
| Mobile emulation | 1 | 7 / 7 | 0 | 4.60 / 3.30–15.80 |

Every eligible block contains at least one host-canary sample outside the predefined ±10% band. Consequently there are no valid paired confidence intervals, no established submission-time speedup and no established raster equivalence. Null metrics in the report mean insufficient accepted data, not zero cost or zero change. Thresholds were not relaxed. A quieter controlled host is required for timing inference; this shared Windows/SwiftShader session cannot answer it.

Construction measurements below describe **all raw cycles**, including rejected blocks. They do not establish a startup regression or improvement, but expose the additional merge work instead of hiding it. The module is built once per page, not on restart.

| Viewport / variant | Cycles | Build median / p95 (ms) | Dispose median / p95 (ms) | Retained owned materials / atlas |
|---|---:|---:|---:|---|
| Desktop before | 96 | 26.25 / 80.20 | 2.15 / 6.40 | 5 / yes |
| Desktop after | 48 | 38.10 / 78.20 | 1.15 / 3.60 | 0 / no |
| Mobile before | 96 | 52.50 / 80.90 | 3.30 / 5.30 | 5 / yes |
| Mobile after | 48 | 77.35 / 108.30 | 1.70 / 5.90 | 0 / no |

All 288 cycles released their meshes. Every after cycle also released the five owned materials and atlas, while the baseline retained them. That lifecycle observation and the independent geometry/parity/draw-count checks remain valid regardless of noisy timing. PR47 remains unmerged and undeployed.

## Reproduce

Install the existing test dependencies and Chromium:

```text
npm install --no-save playwright@1.55.1 babylonjs@8
npx playwright install chromium
node tests/park_architecture.cjs
node tests/render_budget_statistics.cjs
node tests/render_budget_browser.cjs
node tools/render_budget_paired.cjs
```

`RENDER_PAIRS` defaults to 8 and `RENDER_SAMPLES` to 5. A two-block/one-sample harness check verifies execution but cannot establish a timing conclusion. Reports and screenshots are written under `test-artifacts/render-budget/`. The normal acceptance workflow runs the geometry and exact-pixel checks; the longer timing experiment is a deliberate local run.

## Animation work is deferred

V2 retargeting is unchanged. Its heavy bone writes occur inside physics substeps, but the same function observes landing transitions and applies landing decay. A single call after the loop would lose intermediate landings and can change the rendered pose. Before implementing a split, profile V2's actual share at 1/2/4/10 substeps and compare final palettes, joints, feet, grab contact and landing decay across intermediate land/launch sequences. No animation saving is claimed from this batching experiment.

[Response to all five independent-review findings](review-response.md).

![Hoodie rider/deck before](hoodie-desktop-rider-on-deck-before.png)
![Hoodie rider/deck after](hoodie-desktop-rider-on-deck-after.png)
![Hoodie mobile halfpipe before](hoodie-mobile-halfpipe-before.png)
![Hoodie mobile halfpipe after](hoodie-mobile-halfpipe-after.png)
