# NCM y panel de compra: correcciones y alcance

## Problemas reproducidos

- «Monopatin electrico» no recuperaba una posición existente; una ficha bilingüe podía terminar tarifada como la batería integrada. Las pruebas previas de producción cubrían seis casos de termos, no exactitud general del nomenclador.
- El panel comparaba una unidad aunque el proveedor exigiera MOQ 2 o lotes completos.
- Las cantidades alternativas no tenían una tabla visible y el panel sólo mostraba el modo de menor costo, sin comparar tres transportes ni explicar sus tiempos y restricciones.
- La recuperación pedía nuevamente usos ya informados y el selector manual vacío listaba posiciones arbitrarias.

## Cambios

La clasificación separa artículo principal y componentes, exige evidencia de propulsión y química, y pide sólo los discriminantes faltantes. La rama validada de monopatín completo eléctrico para transporte personal puede proponer 8711.60.00 desde el catálogo canónico completo. Otras configuraciones se mantienen pendientes, sin aranceles inventados. Ver [arquitectura y límites](../plans/NCM_CLASSIFICATION_ARCHITECTURE.md).

El mínimo de compra respeta MOQ, múltiplos de lote y tramos de precio confirmados, incluso si hay huecos entre tramos. Se conserva la unidad antigua sólo como compatibilidad de snapshots; la nueva presentación usa el mínimo real o modelado y señala MOQ no confirmado. Las cantidades evaluadas conservan los precios de sus tramos. No se permiten elecciones que superen el presupuesto indicado.

La tabla visible compara cantidad, modalidad, flete, desembolso total y costo puesto por unidad. El ahorro se calcula respecto del mínimo; no se promete un óptimo global ni rentabilidad. La elección de una alternativa exige un clic explícito y recalcula todos los costos.

Courier comercial, aéreo y LCL se comparan para la misma cantidad, con el motor de costos existente. Los modos sin tarifa muestran su motivo, sin presentar cero como un precio. Baterías mencionadas en nombre, descripción, uso, material o categoría activan revisión de aceptación y recargos; no se presenta el costo estándar como cotización de mercancía peligrosa.

## Tiempos y limitaciones del transporte

Los rangos nuevos son **supuestos internos orientativos de planificación**, separados de las tarifas del workbook; no provienen de cotizaciones, APIs de operadores ni reservas:

- Courier: 5–10 días hábiles.
- Aéreo: 7–15 días hábiles.
- LCL: Asia 35–65 días corridos; Europa 25–45; Américas/Caribe 15–40; otras regiones 30–70.

Los plazos excluyen preparación/fabricación, aduana y entrega local. Ruta, salidas, recargos y aceptación se confirman con el operador. Sin origen reconocido no se inventa un plazo. La tabla courier llega a 50 kg facturables del envío modelado: **es un límite de cobertura de precios, no una afirmación del límite legal por bulto o régimen**. La interfaz explica peso volumétrico, mínimo aéreo y redondeo/mínimo W/M de LCL.

Los presupuestos guardados sin el nuevo detalle conservan su fotografía original y ofrecen recalcular; no se reconstruye una comparación actual con datos incompletos.

## Verificación

La aceptación incluye el clasificador real con 10.504 posiciones y etiquetas canónicas SIM, escenarios adversariales de IA, gate del endpoint ampliado a 11 consultas, pruebas financieras de MOQ/lotes/precios/presupuesto y recorridos de navegador Chromium/WebKit a 320, 390 y 1440 px. La prueba de dashboard usa componentes y motor reales con datos comerciales declarados como fixture; no acredita una tarifa cotizada. La retoma de NCM usa clasificador real sin IA, y fixtures de ingestión/cuenta explícitos; no vuelve a autenticar una cuenta real.

Resultados exactos, revisión visual y versión desplegada se registran en la PR y los artefactos de la tarea. No hay script de lint; TypeScript, build, presupuestos de bundle y diff check forman parte de la validación. Estas pruebas verifican los casos cubiertos, no garantizan precisión arancelaria general ni un dictamen de clasificación.
