# Aceptación con una cuenta real — 25 de octubre de 2026

La cuenta indicada por el usuario completó el ingreso mediante código de Clerk. Después se probó el build local de la PR #213 dentro de un navegador controlado, manteniendo el origen de la aplicación y conectando las APIs reales de producción. Los assets de interfaz se sirvieron desde `dist`; las respuestas de cuenta, NCM, guardado e historial no fueron fixtures. Esto no constituye un despliegue de la PR.

El transporte del navegador usó el proxy y la CA confiable del entorno, con verificación TLS activa. No se guardaron contraseñas, códigos ni tokens en el repositorio o los informes.

| Operación | Evidencia observada |
| --- | --- |
| Ingreso y conexión de cuenta | Código aceptado; `/api/me` y `/api/usage` respondieron 200. |
| Historial existente | GET `/api/history` respondió 200 y mostró registros de la cuenta. |
| Preferencias de email | GET y PATCH `/api/email-preferences` respondieron 200; se guardaron los valores cargados, sin cambiar opciones. |
| Producto de prueba | Ficha manual de un termo completo, declarado aislado por vacío, con oferta y embalaje de prueba. |
| Clasificación y resultado | `/api/analyze` y `/api/ncm-classify` respondieron 200; el cálculo utilizó 9617.00.10 del catálogo completo. |
| Guardado | POST `/api/history` respondió 201 y la interfaz confirmó Presupuesto guardado. |
| Persistencia y reapertura | Tras recargar, un GET independiente mostró el registro de prueba; GET `/api/history-item` respondió 200 y el presupuesto se reabrió desde el historial. |
| Limpieza | Se eliminó únicamente el registro identificado como prueba: DELETE devolvió 204 y un GET posterior confirmó su ausencia. Los registros anteriores se conservaron. |
| Cierre | Se cerró la sesión de navegador de esta prueba y se retiró su perfil local. |

Se ejecutó un análisis real sujeto al uso normal de la cuenta. No se realizaron compras, pagos ni envíos comerciales de email.

## Defectos encontrados durante la aceptación y corregidos

1. **Recuperación de resultado manual.** La categoría no visible de un producto manual era `unknown`, mientras que la reproducción de las preguntas visibles la dejaba en `null`. Esa diferencia invalidaba el contexto del cálculo y devolvía al usuario a revisión tras recargar. Ahora se recupera la categoría validada del contexto privado guardado sólo cuando las otras siete entradas coinciden. Si cambian uso, importador, firma o capacidad, el resultado anterior no se reutiliza. La regresión de navegador falló antes del arreglo y pasó después en Chromium y WebKit; los tests del helper incluyen cambios reales e información inválida.
2. **Eliminación con respuesta sin cuerpo.** El servidor eliminaba correctamente el registro con 204, pero una respuesta envuelta con un stream vacío hacía fallar su reconstrucción y la interfaz mostraba un error. El cliente normaliza 204/205/304 con cuerpo `null`, conservando estado y cabeceras. Tres regresiones reproducen ese caso. La eliminación de historial y seguimiento se agregó a los casos de navegador existentes, con confirmación, retirada de fila y una sola solicitud.
3. **Foco después de eliminar.** Se conserva o recupera un control válido al desaparecer la fila, sin quitar el foco si el usuario eligió otra acción mientras esperaba. Los casos cubren cierre con Escape y vuelta al trigger.

## Validación y límites

Los casos focales de paneles aprobaron 8/8 en Chromium/WebKit, y la recuperación manual aprobó 2/2. La suite completa y CI de la revisión definitiva se registran en la PR; el total de casos de navegador permanece en 109. Las nuevas regresiones funcionales amplían la batería unitaria a 1.135 pruebas.

La instancia publicada de Clerk sigue mostrando Development mode: esta prueba confirma el ingreso y las operaciones indicadas, no certifica la configuración de una instancia productiva. Continúan pendientes los documentos aprobados de Privacidad y Términos. No se revalidaron ni recalcularon los presupuestos históricos anteriores a la corrección NCM, ni se afirma precisión general del nomenclador para cualquier mercadería.
