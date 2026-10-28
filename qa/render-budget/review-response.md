# PR47 independent-review response

The review correctly limits the original evidence to fewer objects/submissions and static image preservation. The sequential timings are archived, not evidence of a speedup. PR47 stays unmerged and undeployed.

| Finding | Resolution and evidence |
|---|---|
| R1: sequential runs and host drift | Replace timing inference with fresh-page ABBA/BAAB blocks, A/A controls, a discarded first block, a fixed-work host canary, and paired block bootstrap intervals. Reject whole blocks at the predefined 10% canary threshold. Preserve rejected raw samples. Report insufficient stable blocks as inconclusive. |
| R2: slow host frames inflate physics/animation work | Freeze simulation entirely for architecture measurements. No wall-clock frame interval, gameplay callback time, FPS or animation saving is inferred. The old whole-game profiler remains exploratory. V2 update cadence and landing state are unchanged. |
| R3: wrong layer and incomparable counters | Record direct WebGL submissions, Babylon render/evaluation time, submission time, synchronized time, readback wait, active meshes and active indices for all five views at 64×64 and full resolution. Cross-check GL counts against the instrumented engine's per-render current value. Remove counting wrappers during timed samples. |
| R4: loose pixel tolerance and hidden rider | Require maximum RGB channel difference exactly zero. Keep the real rider and shadows visible, use a deterministic idle pose, and add a rider-on-deck camera. Six views × two viewports provide 12 exact comparisons. Named mural panels remain independent and all 64 painted triangles survive; geometry tests compare winding, positions, normals, UVs, material properties and shadow receiver flags. |
| R5: construction and lifecycle | Measure three scratch-scene build/dispose cycles per page, recording retained materials and atlas. The component is built once at startup; restart changes gameplay state and does not rebuild it. Dispose now releases its five owned materials and atlas. Full scratch-scene cleanup prevents the baseline's pre-existing leak from contaminating later samples. |

The timing experiment's source revision is recorded separately from subsequent analysis and test changes. A moving main branch is not silently substituted during sampling. The baseline component fixture is from main `cc81a51`, before the later hoodie-character integration; any later integration check is identified separately.

## Decision boundaries

A submission signal requires fewer GL calls, render and synchronized-time intervals entirely below zero, and both effects larger than their corresponding A/A noise. Full-resolution equivalence requires the entire synchronized interval inside ±5% and A/A noise at most 5%. Merely spanning zero is not equivalence. At least four accepted blocks are required for an interval. None of these results establish physical phone performance.

## Animation proposal

No once-per-render retargeting change is included. A future split must retain per-substep grounded transition observation, landing decay, mode and frame counting while preserving the final rendered skeleton palette. In particular, intermediate land-then-launch sequences must remain visible to the state machine. Profile realistic 1/2/4/10 substep cases before deciding whether that work is worthwhile; verify Babylon skeleton preparation and palette behavior before relying on overwritten intermediate bone writes.

See [README.md](README.md) for the recorded experiment result, limitations and reproduction commands, and [legacy/README.md](legacy/README.md) for the superseded sequential evidence.
