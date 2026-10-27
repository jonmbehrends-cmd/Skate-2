# SOL SKATE — AI Collaboration Contract

Applies to ChatGPT/RH SOL, GitHub Copilot, and human contributors.

## Mission
Improve the playable Babylon.js/WebGL skateboarding game without regressions. The live GitHub Pages site is production; do not edit main directly.

## Ground rules
1. Inspect source and existing tests before changing code. Reproduce the defect, record expected vs actual behavior, and identify the root cause.
2. Work from a fresh branch per issue. Keep changes focused. Open a pull request against main; do not self-merge.
3. Preserve working tricks, grabs, grind mechanics, fakie steering, Xbox controller input, touch controls, and restart behavior.
4. Geometry and collision must agree. Verify visible ramp faces from multiple camera angles, bowl/halfpipe interiors, coping clearance, and underside visibility. Avoid masking bugs with decorative patches.
5. Run the repository's documented Node checks and relevant tests; add targeted regression coverage. A passing unit test does not prove visual correctness.
6. When browser tooling is available, test the actual game at the start camera and from several angles; check repeated launch/landing cycles and controller/touch behavior. If not available, explicitly mark visual/device testing unverified.
7. Never claim a test passed without running it. Record command, result, commit SHA, screenshots or artifacts where applicable, and known gaps.
8. No secrets or tokens in commits, logs, screenshots, or issues. Avoid new dependencies unless justified.
9. If an issue cannot be completed, leave a precise handoff with reproduction steps, code locations, evidence, and next experiment.
10. Prefer small, reversible changes and independent review. Do not alter deployment or protection settings without owner authorization.

## Shared workflow
RH SOL drafts issues with acceptance criteria; Copilot or a human implementer works on a branch and PR; RH SOL reviews code/test evidence and requests fixes; the owner approves release decisions. Agents communicate through issues, PR descriptions, comments, and docs/AI_HANDOFF.md. Assignment to Copilot depends on account eligibility; an issue is not an active agent session until GitHub confirms one.

## Pull request evidence
Include: linked issue; root cause; files changed; risk/regression analysis; tests run with results; browser screenshots/video if available; remaining unverified items; rollback plan.

## Deployment gate
Do not merge if checks fail, visual defects remain unverified for rendering changes, or a core mechanic regresses. GitHub Pages deployment follows main; keep main stable.
