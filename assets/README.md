# SOL SKATE production skater asset contract

The new optional loader is `SOLProductionSkater.load(BABYLON, scene, 'assets/skater.glb')`.

**Status:** loader groundwork only. No licensed character GLB has been installed and no replacement is activated in the gameplay loop. Existing skater and gameplay are unchanged.

## Required production GLB
- Legally usable glTF 2.0 binary asset, with source/license attribution retained.
- Human-scale anatomically credible skater with a single root, skin weights and skeletal joints for pelvis, spine, neck, head, shoulders, elbows, wrists, hips, knees and ankles.
- Skateboarding stance and animations: idle, push, crouch, ollie, land, carve, grind, grab and airborne pose. Prefer in-place animation so existing physics owns world movement.
- PBR textures and material atlases sized for mobile; budget target <= 20k skinned triangles, <= 2K textures, <= 60 bones, ideally one skinned draw call.
- Blender source file stored separately when redistribution license permits.
- Board and wheels separate from the skater skeleton; existing board physics remain authoritative.

## Integration gates
1. Install the licensed asset at `assets/skater.glb`.
2. Map animation groups to gameplay states and align world units and facing direction.
3. Attach the visual root to existing rider movement while preserving collision and controls.
4. Test repeated push, fakie, ollie, grind, grab, bowl and halfpipe runs.
5. Verify real Chromium WebGL mobile and desktop screenshots; measure performance and fall back to legacy skater on load failure.
6. Merge only after screenshots show an actual visual improvement and gameplay acceptance passes.
