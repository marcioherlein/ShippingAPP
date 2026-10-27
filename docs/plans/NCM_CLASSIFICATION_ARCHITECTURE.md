# Clasificación NCM: arquitectura, alcance y aceptación

## Problema comprobado

El catálogo completo ya estaba disponible. El problema no era instalar un chatbot ni agregar más códigos: la identidad comercial, los componentes incluidos y el vocabulario arancelario se mezclaban antes de recuperar candidatos.

En la base anterior, `monopatin electrico` no recuperaba posiciones ni preguntas específicas. Con descripción de batería integrada aparecían desperdicios electrónicos como alternativas. Un caso bilingüe de vehículo completo (`Electric scooter with lithium battery` más descripción española con batería de litio integrada) podía activar el shortcut de acumulador 8507.60.00 con tarifa, confundiendo una parte con el artículo importado. Además, `sin motor` activaba el concepto eléctrico por contener la palabra motor.

La reproducción comparó el índice de origen y el catálogo canónico reconciliado usado en producción. Ambos contienen 8711.60.00. Las pruebas del nuevo recorrido usan las 10.504 posiciones y las etiquetas reconciliadas con el SIM; no una shortlist sintética con respuestas esperadas del modelo.

## Corrección incluida

1. **Identidad principal separada de componentes.** `src/lib/productIdentity.ts` distingue artículo completo, componente vendido por separado y vehículo compatible mencionado después de “para/for”. Una batería o cargador incluido no reemplaza la identidad de una bicicleta, taladro, aspiradora o monopatín. Esta separación mejora hechos y recuperación; no incorpora clasificación automática de todas esas familias.
2. **Hechos explícitos para movilidad.** El concepto de monopatín/patinete reconoce variantes españolas e inglesas, incluidas formas plurales. Se distingue propulsión eléctrica, ausencia explícita de motor y uso pendiente. No se deduce propulsión a partir del cargador incluido, ni se inventan ruedas o potencia desde el nombre.
3. **Preguntas que cambian la familia.** Si falta el uso o la propulsión, se pide ese dato sin presentar posiciones arbitrarias. La respuesta “No sé” no se transforma en una afirmación técnica.
4. **Candidato acotado y validado.** El vehículo completo, explícitamente eléctrico y para transporte personal adulto, puede resolver el candidato 8711.60.00 existente en el catálogo sin depender del modelo. Juguetes, movilidad para discapacidad, repuestos y vehículos sin motor no heredan ese candidato. Esto es una regla de screening con características declaradas, no un dictamen para cualquier scooter.
5. **Química de baterías sin inventar.** Una batería genérica o el formato 18650 no demuestra tecnología de ion de litio. Se pregunta la tecnología cuando falta y se bloquea la promoción de 8507.60.00 sin evidencia compatible. Plomo, alcalinas, litio primario no recargable y negaciones explícitas no se convierten en un acumulador de ion de litio. Un cargador o batería independiente conserva su identidad; no hereda la del vehículo.
6. **Cierre seguro de precios.** Cuando falta un discriminante, código y tarifa siguen nulos. Las configuraciones reconocidas de monopatín fuera de la rama validada tampoco pasan al modelo: no se seleccionan posiciones de camión, juguete o vehículo manual por coincidencia léxica. El desacuerdo o la ausencia de información no se convierten en certeza.

## Casos comprobados y evidencia

`worker/ncmMobilityFullCatalog.test.ts` contiene 41 casos contra el catálogo canónico completo. Cubren:

- Nombre corto: `monopatin electrico`, acentos, `electric scooter`, plurales, `scooter eléctrico` y `patinete eléctrico`.
- Descripción completa en español y bilingüe, con batería y cargador integrados: candidato de vehículo, no de sus componentes.
- Uso adulto explícito y la frase negativa “no es un juguete infantil”.
- Monopatín sin motor, a patada o `without a motor`: nunca se promueve como vehículo eléctrico.
- Cargador eléctrico incluido sin propulsión confirmada: pregunta por propulsión.
- Baterías, cargadores, ruedas y motores para el vehículo, incluidos nombres plurales: no recuperan el vehículo completo.
- Juguete infantil, movilidad reducida y datos contradictorios: no reciben automáticamente 8711.60.00. Para monopatines reconocidos sin motor, infantiles o con propulsión contradictoria, ni siquiera una expansión adversarial que propone un volquete de 85 t puede promover otra posición: no hay inferencias, código, tarifa ni alternativas arbitrarias.
- Batería genérica/18650: pregunta por tecnología; sin código ni tarifa.
- Plomo, alcalina, negación de litio y litio metálico primario: no se promueven a acumulador de ion de litio, incluso con expansión/ranking de AI adversarial.
- Ion de litio explícito con exclusión de plomo: se conserva el hecho positivo, sin confundir “lead-free” con composición de plomo.

La validación focal inicial pasó 100 pruebas de siete archivos. La validación focal final pasó **116 pruebas de siete archivos**, incluidos los 41 casos de movilidad/química y el test del gate. La suite completa intermedia pasó 192 archivos y 1.186 pruebas, antes de los últimos contraejemplos y el cierre preventivo de configuraciones de movilidad no soportadas. Los números finales del árbol completo deben tomarse de CI después de congelar todos los cambios de esta entrega, incluidos los de interfaz y cálculo.

El gate de producción mantiene **11 consultas** por ejecución: seis de termos y cinco de movilidad/componentes. El caso de batería genérica exige una pregunta de química y ausencia de tarifa. `scripts/ncm-production-gate.test.ts` ejecuta el gate contra el endpoint del Worker y el catálogo canónico completo con AI indisponible. Eso verifica independencia del modelo en los recorridos declarados; no constituye una prueba del proveedor de inferencia real. La ejecución remota del gate y su resultado se registran en el despliegue, no se presuponen desde este documento.

## Lo que todavía requiere trabajo general

La mejora cubre familias y contraejemplos concretos; no demuestra clasificación general de cualquier producto. Los monopatines reconocidos fuera del caso eléctrico de transporte personal validado permanecen pendientes de revisión y no se fuerzan a 8716, 9503 u otra posición mediante AI. La prueba adversarial anterior al cierre preventivo sí consiguió promover 8704.10.10 (volquete de 85 t) para un monopatín sin motor; después del cierre devuelve código/tarifa nulos sin llamar al modelo. El resto del buscador sigue dependiendo en parte de overlap léxico, expansión de términos y calibración por umbrales. No se incorporaron automáticamente las reglas generales interpretativas, todas las notas legales ni criterios históricos vinculantes. Tampoco se certifican las tarifas como vigentes al día de cada operación: se conserva la fecha y procedencia de cada snapshot.

Los monopatines sin motor, juguetes, vehículos de movilidad especial y repuestos pueden necesitar otras familias y hechos. Las baterías de otra tecnología pueden seguir necesitando composición, formato o parámetros adicionales; confirmar “no es litio” no elige por sí solo una posición alternativa. La ausencia de un candidato correcto se muestra como pendiente y no se resuelve eligiendo la opción de mayor score.

## Qué integrar para ampliar cobertura con confianza

### 1. Contrato de hechos y reglas verificables

Extender el contrato común para identidad principal, artículo completo/repuesto, componentes integrados, mecanismo, función y atributos jurídicamente discriminantes. Cada hecho debe indicar si fue declarado, extraído de ficha o inferido. El código sugerido por un proveedor no es evidencia suficiente. Añadir familias por un patrón funcional con casos positivos y negativos, no por SKU o marca.

Aceptación: ningún componente incluido debe desplazar la identidad principal; las negaciones y contradicciones deben producir el comportamiento esperado en un corpus independiente.

### 2. Recuperación jerárquica y corpus normativo versionado

Separar búsqueda de capítulo/partida, selección de subpartida y apertura SIM. Incorporar fuentes normativas accesibles con los permisos o licencias correspondientes: reglas interpretativas, notas legales, notas explicativas y criterios aplicables. Cada resultado debe enlazar el texto y versión que justifican la decisión.

Se puede añadir búsqueda híbrida —léxica y embeddings— sobre ese corpus, por ejemplo con Cloudflare Vectorize y un modelo de embeddings. La infraestructura actual ya tiene Workers AI y catálogo NCM/SIM; no se instaló un servicio nuevo en esta corrección. Vectorizar etiquetas solamente no soluciona la identidad de componentes ni reemplaza las reglas legales.

Aceptación: medir recall de la familia/posición correcta en la shortlist sobre el catálogo real, por separado de la exactitud del resultado final. Si el código correcto no entra, cambiar de modelo de reranking no puede recuperarlo.

### 3. Selección de preguntas por discriminantes

Obtener preguntas a partir de diferencias reales entre candidatos compatibles. Pedir una cosa por vez, explicar dónde encontrar el dato y evitar repetir respuestas ya aportadas. Ante “No sé”, ofrecer guardar el caso como pendiente y señalar el documento necesario. Las alternativas arancelarias crudas no deben trasladar al usuario la tarea del clasificador.

Aceptación: una respuesta relevante debe reducir el conjunto de candidatos o cerrar una incertidumbre concreta. El sistema debe detectar que no puede avanzar y evitar bucles de preguntas.

### 4. Evaluación independiente y operación

Mantener un corpus de casos reales revisado por un especialista aduanero, separado de los ejemplos usados para programar reglas. Incluir español, inglés, descripciones mixtas, productos completos, repuestos, negaciones, datos faltantes, fuentes contradictorias y AI caído/lento/adversarial. Medir exactitud, recall@K, abstenciones correctas, falsos positivos con tarifa, utilidad/número de preguntas y latencia.

Una API especializada puede aportar nomenclatura o criterios si su cobertura, actualización, soporte y evidencia se validan con ese corpus. No hay un plugin que garantice por instalación una clasificación correcta. Los casos con efectos legales y evidencia insuficiente requieren revisión profesional; la aplicación debe hacer visible esa derivación sin inventar una certeza.
