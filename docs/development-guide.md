# Development Guide

## Prerequisites
- **Bun**: Recommended runtime and package manager.
- **Node.js**: (Optional but implicitly supported for typing/execution).
- **TypeScript**: Used for type checking.

## Setup Instructions
1. Install dependencies:
   ```bash
   bun install
   ```

## Available Commands
- **Development**:
  ```bash
  bun run dev
  ```
  Watches `src/index.ts` and builds into the `dist/` directory.

- **Build**:
  ```bash
  bun run build
  ```
  Bundles the plugin into `dist/index.js`, emits type declarations, and builds the memory worker (`src/memory/embedding-worker.ts`).

- **Type Checking**:
  ```bash
  bun run typecheck
  ```
  Runs the TypeScript compiler without emitting files to verify types (`tsc --noEmit`).

## Testing Strategy
There is currently no explicit testing framework configured in `package.json` scripts, but development generally involves typechecking and watching the build using the `dev` script.