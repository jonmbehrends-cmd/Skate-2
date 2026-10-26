# SOL SKATE

Galaxy-first browser skateboarding game. The current `index.html` is an early **2D canvas perspective prototype**, not a full 3D game. Its controls and physics need actual Android device validation.

## Controls
- Left virtual stick: forward/backward acceleration and steering.
- PUSH: gain speed.
- OLLIE: jump.
- KICK, HEEL, SHOVE, GRAB: airborne trick inputs; ground trick buttons currently trigger a basic jump.

## Development and publishing
- Open `index.html` locally to inspect the prototype.
- The `.github/workflows/deploy.yml` workflow is intended to deploy the static site on pushes to `main`.
- In repository **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** if it is not already selected.
- Once deployment succeeds, check `https://jonmbehrends-cmd.github.io/Skate-2/`.

## Current limitations
The environment and skater use canvas perspective drawing rather than WebGL 3D. Collision with obstacles, grinds, ramps, trick validation, landing failures, audio, and robust physics remain to be built. No real Galaxy performance measurements have been taken.

## Next development steps
1. Verify Pages workflow and test on Samsung Galaxy Chrome/Samsung Internet.
2. Replace canvas pseudo-3D with a proper WebGL scene and follow camera.
3. Add obstacle collisions, ramp launches, grind rails, trick rotations and landing detection.
4. Add automated browser smoke tests, performance checks, and regression safeguards.
