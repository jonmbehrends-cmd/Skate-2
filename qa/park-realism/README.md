# Park surface and woodland presentation

This pass builds on deployed bowl/daylight source `f9e37f0c700739fef7271c109b5d36024365e6f4`. It retains all terrain vertices, triangle indices, rail paths, collision and movement logic. Character assets, poses, controls and legacy.html are untouched. Board scale remains a separate candidate in PR115.

Changes:

- Deterministic curing clouds, fine aggregate and rare micro-pitting replace nearly uniform concrete. A matching wrapped-gradient normal map adds restrained surface response through the existing StandardMaterial and lights.
- Six muted concrete palettes distinguish core, river, competition, snake, surf and street areas. Slight pour-to-pour variation is encoded in existing vertex colors.
- Slab joints blend at 22% opacity. Enabling vertex-alpha blending is necessary: assigning LinesMesh.alpha alone still rendered opaque lines in Babylon 8.32.1.
- Original contour/river wall graphics and uneven paint coverage replace the hazard-stripe panels.
- Spatially perturbed, clustered crowns and tapered fir tiers replace identical ball/cone trees. One merged transparent ground-shade batch adds soft tree contact. Vegetation and shade stay outside riding lanes.
- Low distant landforms replace the perfectly flat outer horizon. The near woodland remains flat, all lawn vertices stay outside the riding rectangle, and the four landscape patches remain one merged mesh.

All new material textures together use approximately 3 MiB including mipmaps, replacing the old concrete texture and adding two shared maps. The woodland contributes one additional merged mesh. More crown vertices are present; no physical-phone FPS improvement is claimed.

`tests/park_surface_art.cjs` checks deterministic bytes, opaque albedo, normal-vector bounds and restrained distinct tints. `tests/park_realism_browser.cjs` records desktop/mobile before/after views against the pinned deployed baseline; hashes terrain geometry/contact samples/rail paths for equality; checks effective joint blending and texture/mesh budgets; and records source hashes. The existing expansion browser acceptance independently checks rendered/contact agreement, seams, uncovered bowls, trusted touch ownership and long production-loop routes.

External contribution: Gemini supplied a public-project aggregate/pitting and gradient-normal proposal, explicitly without runtime tests. Integration replaces its short-period sequential RNG with spatial hashes, uses one shared height signal, keeps existing StandardMaterial/daylight rather than adding an unverified PBR pipeline, and adds measured acceptance. The external AI did not run Chromium or repository suites.

Screenshot artifacts are uploaded under `newberg-desktop-mobile-evidence/realism`. Merge requires exact-head logic/gameplay/ramp/Chromium/hoodie/Newberg green checks plus actual desktop/mobile image review.
