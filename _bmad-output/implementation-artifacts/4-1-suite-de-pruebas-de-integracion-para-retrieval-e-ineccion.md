# Story 4.1: Suite de pruebas de integración para retrieval e inyección

Status: done

## Descripción
Como equipo de desarrollo, queremos pruebas de integración del flujo memoria a inyección, para liberar cambios con confianza.

## Criterios de aceptación
1. Se cubre retrieval semántico y fallback.
2. Se cubre presupuesto de tokens y orden de prioridades.
3. Se cubre aislamiento por project scope.

## Detalles de implementación
- **Tipo de prueba**: Integración
- **Flujo a probar**: Memoria → Retrieval → Inyección
- **Enfoque**: Verificar que el sistema completo funcione correctamente desde el almacenamiento de memorias hasta su inyección en el contexto
- **Escenarios clave**:
   - Pruebas de retrieval semántico con embeddings activos e inactivos
   - Validación de límites de tokens y priorización de memorias
   - Verificación de que las memorias estén aisladas por scope de proyecto
   - Tests de fallback cuando falla el retrieval semántico
   - Pruebas de rendimiento para asegurar que la latencia sea aceptable

## Dependencias
- Implementación de Epic 1 (Retrieval semántico y selección de contexto)
- Implementación de Epic 2 (Reconsolidación híbrida y aprendizaje)
- Base de datos SQLite funcionando correctamente
- Sistema de embeddings configurado

## Estrategia de testing
- Utilizar frameworks de testing adecuados para Node.js/Bun
- Mock de servicios externos cuando sea necesario
- Tests que cubran tanto el caso feliz como los modos de fallo
- Verificación de que los tests pasen en entorno local antes de considerar la historia terminada