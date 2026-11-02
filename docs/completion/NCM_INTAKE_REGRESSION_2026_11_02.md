# Cierre de regresión del smoke NCM — 2 de noviembre de 2026

## Estado verificado al retomar

`main` seguía en `c5d845bb5457376b1f73db5a1c83b2dad162d4b6`, con PR #216 fusionada. CI 40552476879 finalizó correctamente. Deploy Production 40552476746 publicó el Worker y falló en `Production intake smoke test`; por tanto la versión estaba publicada, pero su aceptación final no estaba completa.

## Reproducción y corrección

Se ejecutaron las **20 fixtures reales** de clasificación de `scripts/smoke-production-intake.mjs` contra las 10.504 posiciones del catálogo canónico reconciliado con padres SIM y un proveedor AI que falla. La prueba recorre todos los casos antes de afirmar resultados.

El baseline obtuvo 12 candidatos sin AI y ocho casos pendientes, cada uno con dos intentos AI: pádel, batería de litio, mancuernas, mochila, auriculares, parlante, cafetera y termotanque. La conjunción de términos españoles e ingleses no describía variantes equivalentes del artículo. Separar la identidad principal de la descripción había expuesto ese defecto.

La corrección conserva `principalProductText`; no restaura el texto global ni cambia `.every` por `.some` globalmente. Las reglas afectadas usan alias del artículo principal y evidencia técnica cuando la apertura la requiere. Los accesorios y datos contradictorios no activan el shortcut del artículo completo. Las posiciones y tarifas se leen del catálogo existente.

Pádel exige el deporte y el sustantivo paleta/raqueta/racket/racquet/paddle. Una funda o grip vendido por separado no es una paleta; una paleta con funda o grip incluidos conserva su identidad. Las pruebas cubren plurales, español/inglés, accesorios, tenis, tenis de mesa y descripción vaga, además de las otras familias reparadas.

**Corrección de evidencia de la fixture:** el parlante Bluetooth de 10 W no declaraba si había uno o varios altavoces en su caja. Se agregó explícitamente “un solo altavoz montado en su caja” al caso positivo del smoke y se fijó su expectativa 8518.21.00. El caso original ambiguo y los casos sin caja/múltiples altavoces se conservan como negativos del shortcut. No se deduce la construcción a partir de la potencia ni se omite el gate.

El timeout de producción sigue siendo 15 segundos y todos los gates siguen activos.

## Planes anteriores y límites que siguen aplicando

- La PR #216 ya implementó MOQ/lotes/tramos, mínimo viable, optimización visible y comparación courier/aéreo/LCL; esta corrección no vuelve a implementarlos ni rediseña la UI.
- Los antiguos lotes de UX con chat obligatorio o referencia obligatoria de una unidad fueron superados por el cotizador de una pregunta y el mínimo viable. No corresponde reabrirlos como requisitos actuales.
- Rendimiento ya dispone de chunks diferidos, presupuesto de bundle, fuentes locales, coalescing de GET y consultas de watchlist/digest sin N+1. Las pruebas de índices y conteo de consultas no acreditan latencia p95 productiva ni ausencia universal de N+1.
- [Arquitectura NCM](../plans/NCM_CLASSIFICATION_ARCHITECTURE.md) continúa vigente: corpus independiente por familias, notas normativas, métricas de abstención/falsos positivos y revisión aduanera experta. Pasar estas fixtures no demuestra precisión universal.
- Las páginas legales del repositorio aún informan documentos pendientes. Requieren texto/identidad aprobados por el operador.
- `/api/public-auth-config` en el dominio final sigue informando una clave pública de desarrollo (sólo se registró la categoría, sin copiar su valor). La consulta de variables de Actions devolvió HTTP 403 para esta integración. No se cambió Clerk a ciegas: el corte productivo requiere las tres credenciales de la misma instancia y validación de login real.
- Facturación, activación de emails y alertas Pro conservan sus propios requisitos y no son necesarios para reparar esta regresión.

## Validación de esta revisión

Resultados finales y ejecución productiva: se completan con la PR y los workflows del commit exacto. El baseline local pasó 192 archivos y 1.195 pruebas. No hay script de lint; se usan TypeScript/build y `git diff --check` sin afirmar un lint inexistente.

### Matriz offline completa

| Caso | Baseline | Corregido | Llamadas AI finales |
|---|---|---|---:|
| paleta-padel | pendiente (2 AI) | 9506.59.00 | 0 |
| cargador-usbc | 8504.40.90 | 8504.40.90 | 0 |
| bateria-litio | pendiente (2 AI) | 8507.60.00 | 0 |
| raqueta-tenis | 9506.51.00 | 9506.51.00 | 0 |
| mesa-ping-pong | 9506.40.00 | 9506.40.00 | 0 |
| mancuernas | pendiente (2 AI) | 9506.91.00 | 0 |
| mochila | pendiente (2 AI) | 4202.92.00 | 0 |
| botella-termica | 9617.00.10 | 9617.00.10 | 0 |
| auriculares-bluetooth | pendiente (2 AI) | 8518.30.00 | 0 |
| parlante-bluetooth | pendiente (2 AI) | 8518.21.00 | 0 |
| teclado | 8471.60.52 | 8471.60.52 | 0 |
| mouse | 8471.60.53 | 8471.60.53 | 0 |
| lampara-led | 9405.42.00 | 9405.42.00 | 0 |
| cafetera | pendiente (2 AI) | 8516.71.00 | 0 |
| termotanque | pendiente (2 AI) | 8516.10.00 | 0 |
| notebook | 8471.30.19 | 8471.30.19 | 0 |
| panel-solar | 8541.43.00 | 8541.43.00 | 0 |
| camara-ip | 8525.89.19 | 8525.89.19 | 0 |
| zapatillas | 6404.11.00 | 6404.11.00 | 0 |
| gafas-sol | 9004.10.00 | 9004.10.00 | 0 |

Mediciones locales del clasificador aislado: no incluyen red, auth ni Durable Object y no prometen latencia productiva. Los negativos también cubren contradicciones en `functionText`. Revisión independiente: sin hallazgos críticos abiertos dentro de los alias modificados; 90/90 pruebas focales aprobadas.

### Comprobaciones antes de la PR

- Suite completa: **193 archivos, 1.244 pruebas aprobadas**. La primera ejecución detectó que el test de AI inventada usaba una paleta ahora determinística; se cambió por una raqueta ambigua y se exige que efectivamente ejecute dos inferencias, preservando el rechazo de códigos no oficiales.
- TypeScript/build y presupuestos de bundle: aprobados.
- Assets NCM/SIM y bundle Worker dry run: aprobados.
- Revisión visual independiente de cinco capturas Chromium: dashboard de termo 390 px, dashboard desde enlace 1440 px, monopatín MOQ 2 a 320 px y pasos de pregunta/respuesta. Sin defectos críticos observados; son fixtures locales, no login real ni tarifas cotizadas. La longitud del dashboard móvil y el copy anterior «1 unidades» quedan como observaciones menores fuera de esta corrección de clasificación.
- La matriz completa de navegador y el deploy autenticado deben verificarse en los workflows del head exacto antes de declarar el cierre productivo. La evidencia final se registra en la PR y el informe de release de la tarea.

### Corrección de foco encontrada durante la batería WebKit

La ejecución local WebKit con servidor estable pasó 58/59; el caso de teclado fallaba al llegar a Empresa o Sí. Se reprodujo 3/5 veces. Una espera de frames en el helper no lo resolvió y se descartó: se conserva su navegación original por Tab sin pausas artificiales. Una sonda registró el foco en BODY después de que el mismo botón Continuar se deshabilitara al cambiar la pregunta; los siguientes Tabs no alcanzaban el radio visible con tabindex 0.

El efecto de navegación ahora enfoca la etiqueta de la pregunta visible, fuera del botón que acaba de deshabilitarse, antes del scroll instantáneo existente. No modifica respuestas ni requiere clic adicional. El test de teclado exige además foco en las preguntas Empresa y Firma. La nueva revisión debe validarse completa en CI; no se reutiliza el resultado del head anterior para fusionar.

La corrección pasó 10/10 repeticiones WebKit del test original. Con las nuevas aserciones explícitas pasó 6/6 repeticiones (tres WebKit y tres Chromium). Suite completa posterior: 193 archivos y 1.244 pruebas aprobadas; build/TypeScript y diff check aprobados. Revisión independiente del efecto: sin hallazgos críticos de accesibilidad/restauración. El efecto depende de navegación, no de las respuestas, por lo que no roba foco al seleccionar opciones.
