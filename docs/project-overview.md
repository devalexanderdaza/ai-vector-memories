# Project Overview

## Purpose

ai-vector-memories adds persistent memory to OpenCode so coding agents can retain useful context across sessions.

The plugin is built to preserve high-value information such as preferences, constraints, and project decisions while minimizing runtime overhead.

## What the Plugin Does

- Observes relevant chat and tool lifecycle events from OpenCode hooks
- Extracts memory candidates asynchronously to avoid blocking interactions
- Stores memory units in SQLite with classification metadata
- Retrieves and injects scoped memory into future prompts
- Reconsolidates similar memories to prevent duplication and handle conflicts

## Key Product Characteristics

- Persistent by design: memory survives restarts
- Scope-aware: supports global and project boundaries
- Robust retrieval: lexical plus optional embedding-assisted similarity
- Configurable behavior: injection mode, memory limits, and feature flags
- Fail-open runtime: plugin logs errors and continues when safe

## Primary Users

- Developers using OpenCode in medium-to-long coding sessions
- Teams that want assistants to remember coding conventions and decisions

## Non-Goals

- Replacing source control history
- Replacing formal architecture decision records
- Acting as a full vector database service outside the plugin context

## Tech Stack Summary

- Language: TypeScript
- Runtime/build: Bun
- Plugin SDK: @opencode-ai/plugin, @opencode-ai/sdk
- Database: SQLite
- Similarity/vector layer: ruvector
- Optional NLP embeddings: @huggingface/transformers

## Where to Go Next

- [Architecture](./architecture.md)
- [Development Guide](./development-guide.md)
- [Source Tree Analysis](./source-tree-analysis.md)
