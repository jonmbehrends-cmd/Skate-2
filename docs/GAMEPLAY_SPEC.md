# SOL SKATE — Gameplay Acceptance Contract

These are target behaviors, not claims about the current build.

## Ramp and bowl visuals
Solid, correctly oriented, nontransparent interior riding surfaces with proper normals, depth, sidewalls, coping, and materials. No black triangle wedges, covers across bowl openings, visible backfaces through riding surfaces, or player falling through collidable riding areas. Visual mesh and collision/contact surfaces must align.

## Vert transition
Skater rides a curved transition, gains upward momentum, can cross coping and launch upward, follows a physically plausible airborne arc, rotates/reorients back toward the interior, and lands on the inside transition without teleporting, sticking to coping, or being forcibly ejected. Repeated hits should preserve plausible speed/energy, with pumping providing controlled acceleration and friction/gravity dissipating energy. Do not fake infinite speed gain.

## Controls and mechanics
Preserve push, ollie, kickflip, heelflip, shove-it, grab, grinds, fakie steering consistency, and reset. Xbox Bluetooth mapping and mobile virtual stick/buttons must remain usable. Landing validation should reject clearly incomplete tricks without breaking ordinary landings.

## Test scenarios
1. Starting camera and multiple exterior/interior angles: verify ramp surfaces and no see-through gaps.
2. Bowl and halfpipe: at least five consecutive launches and landings without clipping or stuck state.
3. Flat ground: push, carve, stop, reverse/fakie; steering remains consistent with player input.
4. Air: each trick, grab, bail, and reset; no unexpected regression.
5. Grind: rail/ledge/coping approach, attach, travel, dismount.
6. Mobile touch and Xbox: test on real devices when possible; otherwise mark as unverified.

Acceptance requires both automated evidence and appropriate visual/manual validation.
