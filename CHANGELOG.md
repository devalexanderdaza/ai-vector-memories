# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** Starting from version 0.1.0, this changelog is automatically generated using [semantic-release](https://github.com/semantic-release/semantic-release) based on [Conventional Commits](https://www.conventionalcommits.org/). Versions prior to 0.1.0 were manually maintained.

## 1.0.0 (2026-03-28)

### Features

* add hybrid scoring, reconsolidation tests, and integration test suite (Stories 2.1, 2.2, 4.1) ([b40b2e4](https://github.com/devalexanderdaza/ai-vector-memories/commit/b40b2e4a243faf880601de5209aca55baa1d09df))
* **debug:** add injection metrics report command ([472a281](https://github.com/devalexanderdaza/ai-vector-memories/commit/472a2815e9f06d2f391dc0cdb85fee82edf707aa))
* **metrics:** add rolling injection baseline and target evaluation ([ec9daa1](https://github.com/devalexanderdaza/ai-vector-memories/commit/ec9daa1b883464a036ba87fe7760bff3276a2ff0))
* add RuVector integration for enhanced memory management ([7d712c9](https://github.com/devalexanderdaza/ai-vector-memories/commit/7d712c928381a0b7a8cc1bebaf4a717b4e1ec79b))
* **memory:** centralize runtime embeddings flag access ([f0d5ccb](https://github.com/devalexanderdaza/ai-vector-memories/commit/f0d5ccb323ccf4ff7b073228b1ebea3903006103))
* create story 3.1 for optional context compression ([c32e020](https://github.com/devalexanderdaza/ai-vector-memories/commit/c32e02032b2df9a56e47bfb1da695f499881df17))
* implement adaptive quota policy by metrics (3.2) ([10dfcfa](https://github.com/devalexanderdaza/ai-vector-memories/commit/10dfcfa3d1f4897cfc72ed002dfff56ae1276858))
* implement metrics baseline/target report generation (Story 4.2) ([b137754](https://github.com/devalexanderdaza/ai-vector-memories/commit/b137754584ac999523e971a86a795e600ece3eed))
* implement optional context compression with tier-based truncation (Story 3.1) ([7c770e1](https://github.com/devalexanderdaza/ai-vector-memories/commit/7c770e1ddee53149c92a4c5258f2409b8edc2de5))
* **memory:** implement strict token budget and tiered prioritization (Story 1.2) ([aaee7d5](https://github.com/devalexanderdaza/ai-vector-memories/commit/aaee7d580098da6a6cb9d9c9c972752ed2411686))
* **memory:** implement structured logging for memory selection with fail-open telemetry (Story 1.3) ([c6f3dbc](https://github.com/devalexanderdaza/ai-vector-memories/commit/c6f3dbc0f7cc9ef856dc6d3aedeafc4bbd568243))
* **memory:** unify embeddings gating and add injection telemetry ([eddb8bb](https://github.com/devalexanderdaza/ai-vector-memories/commit/eddb8bb0d59c95fef0a2c5f171cfaece4b9a2a74))

### Bug Fixes

* address release workflow review findings ([c9f640b](https://github.com/devalexanderdaza/ai-vector-memories/commit/c9f640b7d98494872982a1708fb69f239e0e17ff))
* include proxy baselines and embedding-aware p95 targets ([6c195e5](https://github.com/devalexanderdaza/ai-vector-memories/commit/6c195e5ee73440a711d28c22d570ddb78323c4e5))
* persist injection metrics state to disk ([6899a42](https://github.com/devalexanderdaza/ai-vector-memories/commit/6899a42621ee4159b83720023a76def2f100ef23))
* refactor injection.ts for improved readability ([e314302](https://github.com/devalexanderdaza/ai-vector-memories/commit/e314302eb3836ef359d4f4b63e9489903188a830))
* **sprint:** sync status - mark epics 1 & 2 done, story 4.1 done ([5d058ca](https://github.com/devalexanderdaza/ai-vector-memories/commit/5d058cadafd9e001b1dd8aa8a9cccc61fa65cced))

## [Unreleased]

### Added

- Reworked project documentation for developer onboarding.
- Reorganized guides for architecture, development, deployment, and source tree navigation.

### Changed

- Updated README for clearer quick start and configuration guidance.
