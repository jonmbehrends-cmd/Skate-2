# SOL SKATE — AI Handoff

Status: collaboration protocol proposed on branch `chore/ai-collaboration-protocol`. Not yet merged. No Copilot coding-agent assignment has been verified.

## Repository facts
- Public game: https://jonmbehrends-cmd.github.io/Skate-2/
- Source: https://github.com/jonmbehrends-cmd/Skate-2
- Babylon.js/WebGL; game entry `index.html`; modules include `controller.js`, `landing.js`, `terrain.js`, `obstacles.js`, `grind.js`, `motion.js`, `wheels.js`, `ramp_geometry.js`.
- Existing GitHub Actions and Node regression tests; see README for current commands.
- Owner screenshots report see-through/hollow/black-wedge ramp geometry and earlier regressions in tricks and bowl/halfpipe launches. Current deployed behavior must be reproduced rather than assumed.

## Priorities
1. Reproduce and root-cause ramp rendering/geometry failure; verify visible faces and collision geometry.
2. Stabilize bowl/halfpipe vertical launch, return trajectory, coping transitions, and repeated landings.
3. Lock regression coverage for tricks, grabs, fakie steering, grind, touch, and Xbox controls.
4. Improve skater/park realism after geometry and mechanics are stable.

## Handoff format for each task
- Issue/PR URL and owner
- Starting and ending commit SHA
- Reproduction and root cause
- Changes made
- Test commands/results, browser/device evidence
- Open risks and next concrete action

## Release rules
No direct edits to main for AI work. Review PRs and require relevant CI checks; browser rendering and physical device claims must be evidence-backed. The repository owner controls merge/deploy approval.
