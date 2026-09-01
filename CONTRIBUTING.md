# Contributing to VYUHAM

Thank you for helping improve VYUHAM. The project benefits most from small, testable changes with a clear investigative use case and an explicit evidence or safety model.

## Before you begin

- Search existing issues before creating a new one.
- Use only synthetic or legally shareable information.
- Never include real personal identifiers, criminal records, credentials, tokens, or operational data.
- For significant architectural changes, open a proposal issue before implementation.

## Local setup

Follow the root [README](README.md#quickstart). The production frontend is served by FastAPI after `npm run build`; Vite can also be used during frontend development.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Use a descriptive branch name such as `feat/graph-path-playback` or `fix/upload-preview`.
3. Keep unrelated formatting and refactoring out of the same change.
4. Add or update tests for changed behavior.
5. Run the relevant verification commands before opening a pull request.

```powershell
cd frontend
npm test
npm run build

cd ..\backend
python -m compileall app
python scripts/evaluate.py
```

## Product principles

- Evidence first: investigative claims must link back to source evidence.
- Human review: AI output must never be presented as a verdict.
- Authorised scope: searches and graph queries must respect case access.
- Explainability: confidence, review status, and relationship provenance remain visible.
- Reversibility: consequential review actions should be auditable and reversible.
- Accessibility: keyboard navigation, focus visibility, contrast, and reduced motion are required.

## Pull requests

Include the user problem, intended workflow, API or data-contract changes, tests performed, privacy considerations, and screenshots for visual changes. Maintainers may request that large pull requests be divided into smaller reviewable changes.
