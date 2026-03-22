# Quick Spec: Memoria Automática con RuVector para OpenCode

## 1. Contexto

El plugin ya cuenta con extracción de conversaciones, clasificación de memorias, almacenamiento en SQLite, embeddings opcionales y recuperación híbrida con fallback. El siguiente salto es consolidar un flujo totalmente automático que mejore:

- Calidad del contexto inyectado.
- Aprendizaje continuo (reconsolidación efectiva).
- Razonamiento contextual con menor consumo de tokens.
- Gestión de ventana de contexto bajo presupuesto configurable.

Este quick spec define una implementación incremental y segura para un plugin que corre embebido en el host.

## 2. Objetivo

Implementar una arquitectura de memoria automática basada en RuVector + SQLite que:

- Recupere memorias relevantes de forma semántica y determinística.
- Seleccione e inyecte contexto priorizando utilidad y presupuesto de tokens.
- Aprenda con reconsolidación híbrida para reducir duplicados y ruido.
- Mantenga latencia y estabilidad aceptables en runtime real.

## 3. Alcance

### En alcance

- Ajuste del pipeline de retrieval e inyección.
- Política explícita de presupuesto de tokens por prompt.
- Reconsolidación híbrida (léxica + semántica).
- Métricas y telemetría local de memoria.
- Pruebas de integración para retrieval y no-regresión.

### Fuera de alcance

- Cambios en API pública del host OpenCode.
- Sincronización remota de memoria entre máquinas.
- UI visual dedicada para administración de memoria.

## 4. Definición de éxito

### KPIs funcionales

- Recall semántico en casos de prueba: >= 0.80.
- Precisión top-5 en retrieval de memorias relevantes: >= 0.75.
- Reducción de duplicados en almacenamiento tras reconsolidación: >= 30%.

### KPIs de costo/rendimiento

- Tokens promedio inyectados por prompt: reducción >= 25% vs baseline.
- Latencia p95 de selección+inyección: <= 120 ms sin embeddings, <= 250 ms con embeddings.
- Fallos de inyección por error interno: 0 fallos fatales (modo fail-open).

## 5. Requerimientos funcionales

1. El sistema debe priorizar memorias críticas (constraint/preference/decision) en la inyección.
2. El sistema debe aplicar presupuesto máximo de tokens configurable y cortar contexto de forma estable.
3. El retrieval debe usar búsqueda semántica cuando embeddings estén habilitados y fallback robusto cuando no.
4. La reconsolidación debe decidir duplicate/conflict/complement con similitud híbrida.
5. El sistema debe evitar contaminación entre proyectos por scope.
6. Debe mantenerse comportamiento fail-open en hooks.

## 6. Requerimientos no funcionales

1. No bloquear UI del host por operaciones pesadas.
2. Mantener transacciones SQLite limpias, sin trabajo async dentro de BEGIN/COMMIT.
3. Trazabilidad por logs con datos de selección e inyección.
4. Compatibilidad con Bun/Node en runtime del plugin.

## 7. Diseño técnico propuesto

### 7.1 Pipeline objetivo

1. Extracción y clasificación de memorias.
2. Inserción asíncrona en SQLite y, si aplica, vectorización RuVector.
3. Retrieval por scope con semántica híbrida.
4. Selección por tiers y presupuesto de tokens.
5. Inyección XML en prompt del sistema.
6. Captura de métricas por evento de inyección.

### 7.2 Política de selección

- Tier 0: constraint.
- Tier 1: preference y decision.
- Tier 2: learning y procedural.
- Tier 3: semantic y episodic.

Reglas:

- Mantener cuota mínima global y cuota mínima de proyecto.
- Aplicar maxMemories y maxTokensForMemories.
- Si excede presupuesto, truncar por menor score marginal.

### 7.3 Reconsolidación híbrida

- Score final = alpha _ jaccard + beta _ semántico.
- Umbrales operativos:
  - duplicate: >= 0.85
  - conflict: >= 0.70 y < 0.85
  - complement: < 0.70
- Ajustar por clasificación y recencia para evitar sobrescrituras erróneas.

## 8. Plan incremental (3 fases)

### Fase 1: Retrieval e inyección confiables

- Endurecer política de selección con presupuesto estricto de tokens.
- Alinear flags de embeddings para usar una sola fuente de verdad.
- Mejorar logs de selección e inyección.

Criterio de salida:

- Pruebas de retrieval e inyección en verde.
- Baseline de métricas registrado.

### Fase 2: Reconsolidación y reducción de ruido

- Introducir score híbrido en reconsolidación.
- Mejorar deduplicación y manejo de conflicto.
- Agregar tests de duplicate/conflict/complement.

Criterio de salida:

- Reducción medible de duplicados.
- Sin regresión de recall.

### Fase 3: Optimización de ventana de contexto

- Compresión temática opcional de memorias inyectadas.
- Ajuste de cuotas por tipo y scope según métricas reales.
- Afinar latencia en p95.

Criterio de salida:

- Reducción de tokens objetivo alcanzada.
- Latencia dentro de umbral.

## 9. Riesgos y mitigaciones

1. Riesgo: sobreinyección de memoria y token bloat.

- Mitigación: presupuesto estricto + prioridades por tier.

2. Riesgo: drift semántico en reconsolidación.

- Mitigación: score híbrido + reglas por clasificación.

3. Riesgo: degradación por fallos de embeddings.

- Mitigación: fallback automático y fail-open con logging.

4. Riesgo: contaminación cross-project.

- Mitigación: validación estricta de scope y pruebas específicas.

## 10. Criterios de aceptación

1. Dado embeddings habilitados, cuando se consulta contexto semánticamente similar, entonces top-5 contiene memoria relevante esperada.
2. Dado presupuesto de tokens, cuando hay más memorias candidatas que presupuesto, entonces la inyección no supera maxTokensForMemories.
3. Dado dos memorias casi idénticas, cuando reconsolidación corre, entonces se clasifica como duplicate y no crea nuevo ruido.
4. Dado dos memorias en conflicto, cuando reconsolidación corre, entonces se aplica resolución consistente sin romper consistencia de datos.
5. Dado cambio de proyecto, cuando se inyecta memoria, entonces no aparecen memorias de otro scope.

## 11. Plan de validación

- Typecheck en cada iteración.
- Pruebas de integración de retrieval/reconsolidación/inyección.
- Escenarios de estrés con sesiones largas.
- Verificación de logs de métricas.

## 12. Dependencias

- RuVector operativo con dimensiones compatibles con embeddings.
- Worker de embeddings estable y observable.
- SQLite con esquema actual y migraciones controladas.

## 13. Entregables

1. Código de retrieval/selección/reconsolidación actualizado.
2. Suite de pruebas de integración para memoria.
3. Métricas locales de rendimiento y costo.
4. Nota de cambios técnicos en documentación.
