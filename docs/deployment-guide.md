# Deployment Guide

## CI/CD Pipeline
The project uses GitHub Actions for continuous integration and deployment.

### Release Workflow (`.github/workflows/release.yml`)
- Triggers on pushes or PRs to the main branch or manual dispatch.
- **Process**:
  - Checks out the code.
  - Sets up the environment.
  - Runs the build process.
  - Publishes the compiled plugin and type definitions as a package release.

## Manual Publishing
If publishing manually:
1. Ensure the code passes type checking: `bun run typecheck`.
2. Build the output: `bun run build`.
3. Bump the version in `package.json`.
4. Publish using `npm publish` or let the CI handle it via tagged releases.