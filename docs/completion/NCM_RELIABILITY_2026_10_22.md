# Corrección NCM: identidad, preguntas y evidencia

El caso «termo Stanley, acero inoxidable, para mantener el agua caliente y tomar mate» no se recuperaba correctamente con el catálogo completo. El material elevaba laminados/lingotes y no se formulaba una pregunta útil. Las pruebas anteriores usaban un catálogo reducido y descripciones que ya incluían las palabras decisivas.

## Cambios

- Normalización conceptual de termo/thermos y función de recipiente para bebidas; la marca no selecciona un código. Volumen o sorbete por sí solos dejan de probar esa identidad.
- Separación entre evidencia de aislamiento térmico y construcción por vacío. «Térmico», «doble pared» y «mantiene caliente» no prueban vacío. Se reconocen confirmaciones y negaciones explícitas en español e inglés.
- Recuperación compatible con el artículo terminado: no competir con materias primas, tornillos, ampollas o partes por coincidencia de material. Materias primas y repuestos explícitos mantienen su identidad propia.
- Si falta la construcción decisiva, devolver una pregunta precisa sin candidatos arbitrarios ni tarifas. Una confirmación explícita del recipiente completo por vacío resuelve 9617.00.10 contra el catálogo oficial, sin llamada al modelo. Eléctricos, repuestos y negaciones no heredan ese atajo.
- Inferencias del modelo limitadas a ocho segundos cada una; fallo/timeout termina sin promover un código inseguro. La clasificación de termo pendiente/confirmado no depende de disponibilidad de IA.
- Una pregunta específica por pantalla. Respuestas persistentes y corregibles, sin sustituir uso/material, repetir preguntas respondidas o acumular afirmaciones contradictorias. Se preserva la ficha/oferta al volver del backend. Dos rondas locales antes de ofrecer revisión manual.
- La pregunta precisa prevalece sobre una NCM seed anterior: tarifas, NCM, SIM y estimaciones provisionales se bloquean hasta resolverla.
- Al agotar intentos, conservar los datos y ofrecer recuperación sin volver a preguntar precios. Próxima acción visible en móvil.

## Evidencia y gates

- Vitest completo: 187 archivos y 1.113 pruebas aprobadas.
- Regresión con las 10.504 posiciones del asset productivo, competidores reales de acero/partes/maquinaria, idiomas y contraejemplos, IA caída/adversarial/colgada.
- Endpoint `/api/ncm-classify` real con asset oficial: pregunta → confirmación → candidato y tarifa; ausencia de SIM no inventa sufijo.
- Gate de producción nuevo: seis casos contra el backend desplegado (pendiente, confirmado, sin vacío, ampolla de repuesto, partes genéricas, eléctrico). Usa el mecanismo de autenticación de servicio existente y debe aprobar antes de declarar verificado el despliegue.
- Chromium: ocho recorridos nuevos aprobados (descripción manual sí/no, búsqueda y link, a 390×844 y 1440×1000). Clasificador real y catálogo completo dentro del handler de prueba; búsqueda, proveedor y reserva usan fixtures. Dos solicitudes NCM, sin tercer bucle. Auditor independiente revisó 24 capturas y dos retomas del estado terminal.
- Gate de release: suite completa de 96 pruebas WebKit/Chromium, build TypeScript/Vite, presupuestos de bundle, schema y assets. El resultado del head final y del despliegue se registra en CI/PR.

La auditoría visual está en los artefactos de tarea `/workspace/shipping-review/ncm-ui-audit-2026-10-22.md` y `ncm-reliability-final-2026-10-22/`. No establece validación general de todas las mercaderías ni una tasa global de precisión. El conjunto independiente revisado por especialista propuesto en el plan sigue pendiente; no se afirma haber alcanzado sus metas de 95%/99%. Este cambio corrige el incidente y endurece los caminos inseguros, sin certificar toda la nomenclatura.

Las respuestas se persisten síncronamente antes de iniciar procesamiento: una prueba desmonta el panel en el mismo evento y verifica recuperación sin repetir la pregunta. El estado agotado muestra un mensaje y una acción de recuperación, preservando alertas reales de red/autenticación.
