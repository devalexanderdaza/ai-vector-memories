# Architecture Document

## Executive Summary

This project (`ai-vector-memories`) is an OpenCode AI plugin that provides persistent, cognitive memory capabilities to coding assistants. It allows the assistant to store and retrieve semantic memories over time, enhancing context awareness and overall performance.

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Bun (also compatible with Node.js)
- **SDK**: OpenCode Plugin SDK (`@opencode-ai/plugin`, `@opencode-ai/sdk`)
- **Memory & Embeddings**: [`ruvector`](https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md) (Vector Store), `@huggingface/transformers` (NLP Embeddings)
- **Database**: SQLite (via `src/storage/sqlite-adapter.ts`)

## Architecture Pattern

**Plugin / Modular Library Architecture**
The system is built as a plugin that attaches to the OpenCode host via hooks. It operates in an event-driven manner, intercepting chats, workspace events, and processing them asynchronously using an internal worker/queue system to prevent blocking the host UI.

## Component Overview

- **Adapter Layer (`src/adapters/opencode/`)**: Interfaces with the OpenCode API. Handles injection tracking, and chat lifecycle hooks.
- **Memory Layer (`src/memory/`)**: Core logic for generating embeddings via Hugging Face models, classifying text, matching patterns, and reconsolidating memories using a local RuVector database.
- **Storage Layer (`src/storage/`)**: Abstracts SQLite interactions. Handles connection, transaction management, and the raw querying of memories.
- **Extraction Layer (`src/extraction/`)**: Implements an asynchronous queue to safely process memory extractions in the background.

## Data Architecture

- **SQLite Database**: Stores memory units. A custom `sqlite-adapter` abstracts the SQL dialect to work across runtimes like Bun and Node.js.
- **Vectors**: Uses [`ruvector`](https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md) for embedding arrays and performing similarity search (cosine similarity / Euclidean distance) to fetch relevant context on subsequent prompts.

## External References

- **RuVector documentation index**: https://github.com/ruvnet/RuVector/blob/main/docs/INDEX.md
- **RuVector npm package README**: https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md

## Development Workflow

Development is managed using Bun. Core commands include `bun run dev` for watching and building, and `bun run typecheck` for validating TypeScript definitions.

## Deployment Architecture

The output is bundled via Bun into the `dist/` folder (ESM format). A separate worker bundle is built for `dist/memory/embedding-worker.js` to ensure heavy NLP tasks do not stall the main thread. It is published as an npm package via GitHub Actions (`release.yml`).
