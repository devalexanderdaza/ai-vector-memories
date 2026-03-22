# Backlog Inicial: RuVector Memory Automation

## Objetivo del backlog

Descomponer la implementación en historias ejecutables para Sprint Planning, minimizando riesgo en un plugin runtime-crítico.

## Epic 1: Retrieval semántico y selección de contexto

### Story 1.1: Unificar decisión de embeddings

Como sistema de memoria, quiero usar una fuente de verdad consistente para decidir si embeddings están activos, para evitar comportamientos divergentes entre hooks.

Criterios de aceptación:

1. La decisión embeddingsEnabled se obtiene desde un único punto de configuración runtime.
2. Los hooks de inyección usan esa misma decisión y no una lectura paralela inconsistente.
3. Typecheck en verde.

### Story 1.2: Presupuesto estricto de tokens en selección

Como sistema de inyección, quiero respetar maxTokensForMemories en todos los caminos de selección, para evitar desbordar la ventana de contexto.

Criterios de aceptación:

1. La función de selección contabiliza tokens de forma consistente por memoria.
2. La suma final nunca supera maxTokensForMemories.
3. Se priorizan tiers críticos cuando hay recortes.

### Story 1.3: Trazabilidad de selección de memorias

Como desarrollador, quiero logs estructurados de selección e inyección, para poder diagnosticar calidad y costo de contexto.

Criterios de aceptación:

1. Se registran conteos por clasificación y scope de memorias seleccionadas.
2. Se registra uso de presupuesto de tokens y latencia de selección.
3. El sistema sigue en modo fail-open si falla la telemetría.

## Epic 2: Reconsolidación híbrida y aprendizaje

### Story 2.1: Score híbrido configurable

Como motor de memoria, quiero combinar similitud léxica y semántica con pesos configurables, para mejorar la decisión duplicate/conflict/complement.

Criterios de aceptación:

1. El score híbrido utiliza al menos jaccard y similitud semántica.
2. Si embeddings no están disponibles, el sistema degrada a jaccard sin romper flujo.
3. Umbrales de decisión quedan centralizados y explícitos.

### Story 2.2: Pruebas de reconsolidación por tipo de decisión

Como mantenedor del plugin, quiero pruebas de duplicate/conflict/complement, para prevenir regresiones en aprendizaje.

Criterios de aceptación:

1. Existen pruebas para los 3 resultados de reconsolidación.
2. Incluye caso con memorias de distinta clasificación que deben coexistir.
3. Todas las pruebas pasan en entorno local.

## Epic 3: Optimización de ventana de contexto

### Story 3.1: Compresión opcional de contexto inyectado

Como sistema de inyección, quiero comprimir memorias de baja prioridad cuando falte presupuesto, para reducir tokens sin perder señales clave.

Criterios de aceptación:

1. El modo de compresión es opcional y configurable.
2. Constraints y decisions no se degradan por debajo de umbral mínimo de presencia.
3. La reducción promedio de tokens supera el baseline inicial.

### Story 3.2: Política de cuotas adaptable por métricas

Como sistema, quiero ajustar cuotas por scope y clasificación usando datos reales, para mejorar relevancia sin inflar costos.

Criterios de aceptación:

1. Existe configuración para cuotas global/project/flexible.
2. Hay reporte de impacto antes y después del ajuste.
3. No se detecta fuga de memorias entre proyectos.

## Epic 4: Calidad y operabilidad

### Story 4.1: Suite de pruebas de integración para retrieval e inyección

Como equipo de desarrollo, queremos pruebas de integración del flujo memoria a inyección, para liberar cambios con confianza.

Criterios de aceptación:

1. Se cubre retrieval semántico y fallback.
2. Se cubre presupuesto de tokens y orden de prioridades.
3. Se cubre aislamiento por project scope.

### Story 4.2: Reporte de métricas baseline y target

Como responsable técnico, quiero un reporte de baseline y target de memoria, para decidir cuándo promover cambios a producción.

Criterios de aceptación:

1. Se publica baseline de recall, precisión top-5, tokens promedio y latencia p95.
2. Se registran targets de salida por fase.
3. El reporte se puede regenerar con un comando documentado.

## Prioridad recomendada

1. Story 1.1
2. Story 1.2
3. Story 1.3
4. Story 2.1
5. Story 2.2
6. Story 4.1
7. Story 4.2
8. Story 3.1
9. Story 3.2

## Definición de listo para desarrollo

1. Historia incluye criterios de aceptación verificables.
2. Se especifica impacto en rendimiento y riesgo de runtime.
3. Se identifica estrategia de rollback o fallback.

## Definición de terminado

1. Código implementado y typecheck en verde.
2. Pruebas de la historia en verde.
3. Cambio registrado con métricas comparables contra baseline.
