# Project Overview

## Purpose

`ai-vector-memories` is a plugin for OpenCode AI designed to provide persistent, cognitive memory capabilities. It enables the AI coding assistant to retain context, user preferences, and project-specific knowledge over long periods, enhancing both short-term context awareness and long-term utility.

## Executive Summary

This library intercepts interactions and workspace events to store critical information into a local vector database. By mapping relationships and using state-of-the-art NLP embeddings (`@huggingface/transformers`), it allows for fast semantic and similarity searches ([`ruvector`](https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md)) against a SQLite backing store.

## Technology Stack Summary

| Category         | Technology                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Runtime          | Bun / Node.js                                                                                                           |
| Language         | TypeScript                                                                                                              |
| Memory/Vector    | [`ruvector`](https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md), `@huggingface/transformers` |
| Database         | SQLite                                                                                                                  |
| Host Integration | `@opencode-ai/plugin` SDK                                                                                               |

## External References

- **RuVector Docs Index**: https://github.com/ruvnet/RuVector/blob/main/docs/INDEX.md
- **RuVector npm Package README**: https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md

## Architecture Type

- **Monolith**: Single cohesive TypeScript project exporting an ESM plugin.
- **Pattern**: Event-driven plugin architecture with background worker processing.

## Quick Links

- [Architecture Document](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Development Guide](./development-guide.md)
- [Deployment Guide](./deployment-guide.md)
