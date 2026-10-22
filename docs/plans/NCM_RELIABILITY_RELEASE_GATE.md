# Plan de confiabilidad NCM y bloqueo de release

Solicitud: fallo informado con «termo Stanley». Diagnóstico local del 22/10/2026; no constituye una reproducción con credenciales o respuestas del proveedor productivo.

## Evidencia reproducida

Se ejecutó `classifyFullNcm` con `public/data/ncm-index.json`, sin disponibilidad de IA, para verificar el fallback real:

| Entrada | Resultado actual |
|---|---|
| Termo Stanley | Sin clasificación; mezcla recipientes completos, partes y ampollas de vidrio; sin preguntas de desambiguación |
| Termo Stanley; acero inoxidable; para mantener el agua caliente y tomar mate | Sin clasificación; alternativas incluyen 7220.11.00 y lingotes 7218; sin preguntas de desambiguación |
| Termo Stanley; acero inoxidable; recipiente para bebidas; aislado por vacío | Candidato 9617.00.10 sin preguntas pendientes |

El tercer resultado muestra dependencia indebida de la redacción. No demuestra que una marca o cualquier botella térmica deba clasificarse automáticamente allí.

## Causas comprobadas y pendientes

- `worker/semanticConcepts.ts` reconoce «termo» como aislamiento, pero la familia `beverage_container` no incluye «termo» ni expresiones como «tomar mate» o «mantener el agua caliente». El atajo de identidad requiere ambos conceptos y no se activa para las entradas naturales reproducidas.
- El ranking textual puede elevar materias primas por coincidencias de «acero inoxidable», desplazando la función del artículo terminado. La shortlist condiciona al reranker: una IA que sólo reordena esa lista no puede recuperar un candidato excluido.
- Las alternativas débiles se convierten en opciones visibles de desambiguación, incluso sin preguntas relevantes. El bloqueo de aranceles de baja confianza es correcto, pero no hace útil ese recorrido.
- La UI transforma faltantes en campos genéricos (`classificationClarificationTarget`) y puede preguntar detalles técnicos genéricos en lugar de formular la distinción concreta que falta.
- Las pruebas existentes de termos usan descripciones explícitas y un catálogo reducido. No prueban el caso cotidiano contra todas las familias competidoras del catálogo completo.
- Pendiente: contrastar versión, payload y respuestas del recorrido productivo informado; verificar conservación de respuestas y cualquier transformación de hechos entre búsqueda, ficha y clasificador.

## Implementación por etapas

1. **Trazabilidad y regresión antes de corregir.** Capturar, con protección de datos, versión de catálogo/modelo, hechos recibidos, procedencia de cada hecho, familias recuperadas, motivos de descarte y pregunta pendiente. Crear casos fallidos con las entradas anteriores y el catálogo completo. Reproducir búsqueda, descripción manual y link a través del endpoint y del navegador; no limitarse al clasificador aislado.
2. **Identidad y evidencia estructurada.** Normalizar español, inglés y lenguaje cotidiano hacia función, clase de objeto, material, construcción, mecanismo y artículo completo/parte. Separar hechos declarados, observados e inferidos. Stanley es una marca, no una regla arancelaria. «Doble pared» o «térmico» no deben probar por sí solos aislamiento al vacío.
3. **Recuperación por jerarquía y compatibilidad.** Recuperar primero familias/partidas por identidad y función; discriminar después subpartidas y aperturas con sus condiciones legales. Incorporar sinónimos conceptuales y contexto jerárquico oficial. La identidad de recipiente terminado debe evitar que el material lo convierta en lingote. Aplicar exclusiones por evidencia explícita, sin convertir la ausencia de información en una negación. Mantener incertidumbre cuando todavía no se sabe si es artículo completo o parte.
4. **Preguntas que resuelven diferencias reales.** Generarlas desde los candidatos compatibles y sus requisitos pendientes, con respuestas estructuradas y opción «No sé». Ejemplo, sólo si falta: «¿La ficha indica aislamiento por vacío?». Si ya está respondido, no repetir. Separar dudas arancelarias de precio, presupuesto, origen y medidas. Tras dos rondas sin nueva evidencia útil, ofrecer revisión asistida; no un bucle ni opciones arbitrarias.
5. **Decisión verificable.** Un código debe existir en el catálogo y ser compatible con hechos, requisitos y notas aplicables. La IA puede interpretar y ayudar a comparar evidencia; su confianza declarada o el mayor score no bastan para confirmar. Diferenciar propuesta, información pendiente y revisión humana. Sin clasificación suficiente, no presentar impuestos ni costo total como validados. Documentar la base y los límites de cualquier resultado orientativo.
6. **UX de clasificación.** Mostrar qué entendió la app, la única duda actual y por qué importa, en español común. Una pregunta por pantalla y siguiente acción visible. No pedir al usuario que elija entre descripciones de lingotes para resolver un termo. Conservar respuestas al volver, recargar o autenticar. Mostrar fundamento y fuentes en el resultado final; ofrecer corrección sin perder la ficha.
7. **Evaluación y auditoría.** Validar con un conjunto independiente revisado por especialista aduanero, no sólo ejemplos elegidos por el desarrollador. Incluir productos completos, repuestos, recipientes sin vacío, termos eléctricos, termos de vidrio y acero, variantes de marca/modelo y contradicciones. Medir recuperación de familia correcta, exactitud de códigos confirmados, abstenciones, preguntas redundantes, rondas y latencia. Separar entrenamiento/ajuste de evaluación.
8. **Release condicionado.** Primero staging con servicios configurados, luego auditoría visual en móvil/desktop de búsqueda, descripción y link hasta dashboard. Publicar sólo después de los criterios siguientes. Los cambios visuales/de performance de la PR #212 no subsanan este bloqueo; no fusionarla como declaración de aptitud productiva del clasificador.

## Criterios de aceptación y go/no-go

- Todas las variantes equivalentes del termo convergen en la misma familia compatible; no aparecen materias primas como alternativas para un artículo terminado identificado.
- Un termo completo y aislado por vacío, con hechos suficientes, llega al candidato del catálogo correspondiente; validar el código de ocho dígitos y requisitos con especialista. No inferirlos únicamente desde Stanley o doble pared.
- Una botella sin aislamiento, una parte y un calentador eléctrico no se promueven como el termo completo del caso positivo.
- Sin evidencia suficiente, la app formula una pregunta pertinente o se abstiene con una salida útil. Nunca rellena propiedades ni exige cambiar la redacción para acertar.
- Cero repeticiones de hechos ya contestados en la batería de recorridos; tope de dos rondas sin progreso antes de revisión asistida.
- Cero promociones incompatibles con los hechos en la batería crítica. Un caso crítico fallido bloquea release aunque el promedio sea alto.
- Propuesta inicial para el conjunto independiente: al menos 95% de recuperación de familia correcta en top 5 y 99% de precisión entre códigos promovidos. Son metas de aprobación, no resultados medidos. Revisarlas con el especialista; publicar también cobertura y abstenciones para evitar mejorar precisión ocultando todos los casos.
- Pruebas con IA disponible, caída, respuesta vacía, timeout y respuesta contradictoria; sin perder datos ni mostrar como válidos aranceles inseguros.
- Integración contra catálogo completo, regresión financiera y endpoints; pruebas de navegador de los tres ingresos en ambas resoluciones hasta dashboard; revisión visual independiente.
- Un informe de evidencia y limitaciones debe acompañar el go/no-go. Pasar muchos tests o verse bien no equivale a confiabilidad arancelaria.

## Orden de trabajo

Primero regresión y trazabilidad; después identidad/recuperación; luego preguntas y estados de confianza; finalmente UX, evaluación independiente y gate de release. No resolverlo agregando una excepción «Stanley → código» ni cambiando sólo el modelo.
