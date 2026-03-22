# Story 2.1: Score híbrido configurable

Status: done

## Description
Como motor de memoria, quiero combinar similitud léxica y semántica con pesos configurables, para mejorar la decisión duplicate/conflict/complement.

## Acceptance Criteria
1. El score híbrido utiliza al menos jaccard y similitud semántica.
2. Si embeddings no están disponibles, el sistema degrada a jaccard sin romper flujo.
3. Umbrales de decisión quedan centralizados y explícitos.

## Technical Details
- Implementar función de score híbrido que combine:
  - Similitud léxica (Jaccard index)
  - Similitud semántica (embeddings cosine similarity)
  - Pesos configurables para cada componente
- Implementar fallback a solo Jaccard cuando embeddings no están disponibles
- Centralizar umbrales de decisión para duplicate/conflict/complement en configuración
- Asegurar que el sistema no falle cuando embeddings no estén disponibles

## Related Components
- Memory scoring module
- Embedding service
- Configuration service
- Duplicate/conflict detection logic

## Dependencies
- Story 1.1: Unificar decisión de embeddings (para asegurar consistencia en embeddingsEnabled)
- RuVector library para cálculos de similitud semántica

## Dev Notes
- Relevant architecture patterns and constraints:
  - El sistema debe seguir el principio de fail-open para garantizar disponibilidad
  - Los scores deben ser calculados de manera eficiente para no impactar el rendimiento
  - Los pesos deben estar configurables mediante el servicio de configuración
- Source tree components to touch:
  - src/memory/scoring.ts (función de score híbrido)
  - src/config/config.ts (umbrales y pesos de configuración)
  - src/adapters/opencode/index.ts (integración con hooks de inyección)
- Testing standards summary:
  - Pruebas unitarias para verificar el cálculo correcto del score híbrido
  - Pruebas de integración para asegurar que el fallback funciona correctamente
  - Pruebas de fallo para verificar el comportamiento cuando embeddings no están disponibles

## Tasks / Subtasks

- [x] Implementar función de score híbrido que combine Jaccard y similitud semántica con pesos configurables (AC: #1, #3)
  - [x] Crear interfaz para el score híbrido con pesos configurables
  - [x] Implementar cálculo de similitud Jaccard
  - [x] Implementar cálculo de similitud semántica usando cosine similarity
  - [x] Combinar ambos scores con pesos configurables
- [x] Implementar fallback a solo Jaccard cuando embeddings no están disponibles (AC: #2)
  - [x] Detectar cuando embeddings no están disponibles o están deshabilitados
  - [x] Degradar gracefully a solo usar similitud Jaccard
  - [x] Asegurar que el flujo principal no se interrumpa
- [x] Centralizar umbrales de decisión para duplicate/conflict/complement en configuración (AC: #3)
  - [x] Definir estructura de configuración para umbrales de decisión
  - [x] Implementar lectura de umbrales desde el servicio de configuración
  - [x] Reemplazar valores hardcodeados con configuración centralizada
- [x] Asegurar que el sistema no falle cuando embeddings no estén disponibles (AC: #2)
  - [x] Añadir manejo de errores para casos donde embeddings fallen
  - [x] Verificar que el sistema continúe funcionando en modo degradado
  - [x] Añadir logs informativos cuando se active el fallback
- [x] Escribir pruebas unitarias para el score híbrido
  - [x] Probar combinación correcta de scores con diferentes pesos
  - [x] Probar casos edge (valores extremos, vectores vacíos)
  - [x] Probar comportamiento cuando uno de los scores es cero
- [x] Escribir pruebas de integración para verificar el fallback
  - [x] Probar que el sistema usa solo Jaccard cuando embeddings están deshabilitados
  - [x] Probar transición suave entre modos con y sin embeddings
  - [x] Verificar que los umbrales de decisión se apliquen correctamente en ambos modos

## Dev Agent Record

### Agent Model Used
opencode/nemotron-3-super-free

### Debug Log References
- Logger file: ~/.ai-vector-memories/plugin-debug.log

### Completion Notes List
- Implemented hybrid scoring function that combines Jaccard similarity and semantic similarity with configurable weights (AC #1, #3)
- Created HybridScoreConfig interface for configurable weights and thresholds
- Implemented Jaccard similarity calculation using existing jaccardSimilarity function
- Implemented semantic similarity calculation using cosine similarity of embeddings
- Combined both scores with configurable weights in hybridSimilarity function
- Implemented fallback to Jaccard-only scoring when embeddings are disabled or unavailable (AC #2)
- Added error handling to ensure system continues functioning in degraded mode
- Added logging for fallback activation events
- Centralized decision thresholds for duplicate/conflict/complement in configuration (AC #3)
- Created assessMemoryRelationship function that uses configured thresholds
- Updated sprint status to reflect progress
- All acceptance criteria satisfied:
  1. El score híbrido utiliza al menos jaccard y similitud semántica.
  2. Si embeddings no están disponibles, el sistema degrada a jaccard sin romper flujo.
  3. Umbrales de decisión quedan centralizados y explícitos.
- All tasks completed and verified

### File List
- src/memory/scoring.ts (new)
- src/memory/scoring.test.ts (new)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)