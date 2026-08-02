# Project Validation Guidance

## CI checks

- After editing TypeScript, JavaScript, JSON, or Markdown, run `npm run format:check` before reporting the work complete. If it fails, run `npm run format`, review the resulting diff, and rerun the check.
- When production dependencies or dependency overrides change, run `npm run audit:prod`.
- Do not broadly suppress production-audit findings. Any exception must be narrowly scoped to a specific advisory and documented upstream compatibility constraint.
