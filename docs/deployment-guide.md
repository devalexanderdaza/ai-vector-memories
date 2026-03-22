# Deployment Guide

## Deployment Model

This package is distributed through npm and consumed by OpenCode as a plugin.

The release workflow is designed around Bun builds and repository automation.

## Pre-Release Checklist

1. Confirm version and metadata in package.json.
2. Run type checks:

```bash
bun run typecheck
```

3. Build production artifacts:

```bash
bun run build
```

4. Verify generated output in dist/.
5. Ensure README and docs reflect current behavior.

## Build Outputs

- dist/index.js
- dist/index.d.ts
- dist/memory/embedding-worker.js

## Versioning

- Use semantic versioning for releases.
- The preversion script runs bun run build to ensure artifacts are generated before version changes.

## CI/CD Notes

- Repository automation is expected to publish when release conditions are met.
- AGENTS.md states that pushes to main with package.json changes trigger npm publishing workflow.

## Manual Publish (If Needed)

1. Authenticate with npm.
2. Ensure clean, reviewed changes.
3. Execute publish from repository root:

```bash
npm publish
```

Only use manual publishing if your team process requires bypassing automated release jobs.

## Post-Release Validation

- Confirm package availability in npm registry.
- Validate plugin installation from OpenCode configuration.
- Smoke-test memory extraction and injection in a fresh OpenCode session.

## Related Docs

- [Development Guide](./development-guide.md)
- [README](../README.md)
