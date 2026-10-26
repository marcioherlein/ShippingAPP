# Auditoría general de UX/UI — 23 de octubre de 2026

## Resultado y alcance

Auditoría de código, navegación, accesibilidad y revisión visual independiente de la aplicación, desde la landing hasta el resultado. Se corrigieron fallos de navegación/persistencia, validación y foco; se añadieron regresiones de navegador para los paneles de cuenta y los recorridos afectados. La matriz visual cubre 320, 390 y 1440 px según superficie. Chromium y WebKit cubren la regresión mantenida.

**No se declara aptitud productiva general:** los documentos legales aprobados siguen pendientes. Los enlaces ahora muestran una página estática que informa ese estado, en vez de devolver silenciosamente la SPA. No se inventaron responsable, contacto, jurisdicción, retención ni condiciones contractuales. Se solicitaron los textos o URLs aprobados al responsable de la app.

## Inventario punto por punto

| Superficie | Revisión y resultado |
| --- | --- |
| Landing: cabecera, marca, navegación, hero, ilustración, llamadas a la acción | Layout móvil/escritorio, entrada sin salto, acceso con teclado y enlace para saltar al contenido. Foco transferido al título del cotizador al entrar. |
| Landing: propuesta de valor, pasos, evidencia, cierre y footer | Jerarquía y contraste; destinos de navegación; enlaces legales disponibles con estado editorial pendiente explícito. |
| Cabecera del cotizador | Navegación contextual: Revisar producto abre la ficha aun desde resultado o edición de perfil; Resultado aparece sólo cuando existe. Acciones no apuntan a una confirmación desmontada. Selectores CSS de cuenta acotados a sus triggers para no alterar botones de paneles. |
| Nuevo caso y recuperación | Confirmación de descarte, limpieza de capacidad anterior y guardias contra resultados tardíos. Los enlaces de sección ya no disparan una reproducción del viaje anterior. Deep links legados de Explorar se restauran mediante identificadores estables. |
| Operación | Uso, tipo de importador y firma, selección con teclado y edición. Un importador desconocido se muestra por confirmar, sin atribuirlo a Persona. |
| Capacidad de compra | Modalidad, presupuesto, rango de unidades, validaciones y conservación al recargar; caso nuevo vuelve a valores iniciales sin confirmar la selección anterior. |
| Entrada de producto | Link, ficha manual y búsqueda; carga, selección, error del proveedor y alternativa manual. Explorar se mantiene como ruta legada oculta, sin agregar una opción redundante a la entrada pública. |
| Ficha manual | Nombre, función y material opcional; paso actual de tres, ayuda, foco contextual y errores asociados. |
| Oferta | Precio, moneda, unidad/lote, cantidad por lote, variante y vigencia del tramo. Mensajes de error visibles y `aria-invalid`; límite máximo compatible con mínimo. |
| Conversión de moneda | Tipo de cambio, fuente y fecha; fecha real de calendario y valores positivos. No se agrega una conversión por defecto. |
| Embalaje | Una unidad o caja; largo, ancho, alto y unidades por caja; volumen conocido como alternativa. Medidas positivas y cantidad entera; cálculo de m³ por unidad sin pedir ambas fuentes. |
| NCM | Pregunta precisa, opciones, No sé, límite y revisión manual; búsqueda por código, confirmación explícita y vuelta a ficha. Se conserva la suite contra catálogo completo del incidente Stanley. |
| Confirmación y procesamiento | Resumen de hechos, corrección, acción principal, estados de carga y conservación de datos. |
| Dashboard: resumen | Inversión total, costo puesto por unidad, cantidad y modalidad al inicio; cuatro métricas en dos columnas en móvil. Fecha y fuentes identifican la versión del cálculo sin afirmar que está guardada en la cuenta. |
| Dashboard: desglose y alternativas | Compra/importación/costo puesto, distribución de inversión, comparación de cantidades, optimización, fuentes/FX, requisitos pendientes y revisión del proveedor. Las cifras financieras no fueron redefinidas por esta auditoría. |
| Dashboard: guardar y editar | Acciones compactas y sticky en móvil; estados guardando/guardado/error; conservación de snapshot y vuelta a ficha. |
| Historial | Carga, vacío, error/reintento, lista, detalle y retorno; foco contextual, Escape, cierre externo, restauración del foco y blancos táctiles. |
| Seguimiento | Carga, vacío, error/reintento, lista y observaciones; mismos controles de foco y cierre, sin atrapar Tab en un panel no modal. |
| Preferencias de email | Diálogo nativo modal, ciclo de Tab, Escape y retorno al trigger; carga/reintento, zona horaria válida, bloqueo durante guardado, conservación tras fallo y reintento. |
| Acceso y recuperación de cuenta | Se mantiene la batería de acceso lento, carga fallida y restauración de operación. Las pruebas de UI no simulan una sesión real como evidencia de login productivo. |
| Accesibilidad y responsive | Teclado, foco visible, nombres accesibles, errores anunciados, contraste con axe, movimiento reducido, overflow y blancos táctiles. |

## Hallazgos corregidos

1. **P1 — Navegación a una sección inexistente:** Producto apuntaba a `#case-confirmation` cuando la confirmación ya no estaba montada. La acción abre la revisión y revela su destino después del render.
2. **P1 — Reproducción inesperada del caso por hash:** `popstate` de enlaces internos reproducía el mismo parámetro journey y podía reponer selecciones durante un reinicio. Se ignoran cambios de fragmento que no cambian journey; se conservan Back/Forward entre etapas.
3. **P1 — Recuperación legada dependiente de copy:** Explorar usaba textos de botón/recibo obsoletos. Se usan identificadores estables, manteniendo recuperación por textos anteriores cuando corresponde.
4. **P1 — Paneles sin gestión de foco:** historial y seguimiento perdían contexto al abrir/cerrar o cambiar detalle. Ahora son paneles no modales con foco, Escape/cierre externo y restauración.
5. **P1 — Modalidad de preferencias incompleta:** un div anunciaba modalidad sin hacer inerte el fondo. Ahora usa dialog nativo y ciclo explícito de teclado en sus extremos.
6. **P1 — Guardado de preferencias y validación:** zona horaria arbitraria y edición concurrente durante guardado. Se valida antes de solicitar y se conserva la edición ante error.
7. **P2 — Errores de formulario silenciosos:** valores inválidos desactivaban Continuar sin explicar por qué. Mensajes específicos, ayuda asociada y campos inválidos anunciados.
8. **P2 — Pregunta/CTA recortados en móvil:** se revela la tarjeta actual y se reducen textos duplicados, conservando una pregunta a la vez.
9. **P2 — Resumen financiero relegado:** el costo por unidad no estaba en las métricas iniciales y las acciones ocupaban demasiada altura móvil. Se reorganizó el resumen y las acciones sin cambiar cálculos.
10. **P2 — Información ambigua:** se eliminó la afirmación de versión guardada antes de guardar; un perfil desconocido no se presenta como Persona.
11. **P1 — Contraste en la oferta avanzada:** las etiquetas heredaban un color claro pensado para otro fondo. Se usa el token semántico de texto secundario y se extienden los recorridos de navegador para auditar esta pantalla, incluidos tramos adicionales y temas claro/oscuro, con axe. La regresión reprodujo contraste 1,03:1 antes del cambio.
12. **P2 — Acción de perfil fuera de pantalla a 320 px:** al cambiar la pregunta se revela la tarjeta activa, respetando restauración y movimiento reducido; la regresión confirma la acción siguiente completamente visible después de las tres respuestas No sé.
13. **P1 pendiente editorial — Legales inexistentes:** páginas de estado reales evitan el fallback engañoso. Sólo el operador puede aportar el contenido aprobado para cerrar este punto.

## Evidencia y límites

Artefactos de la tarea: `/workspace/shipping-review/general-ux-ui-2026-10-23/`. El agente visual conserva baseline, retomas y reporte con capturas y mediciones. El número de capturas no equivale a revisión individual de cada imagen; su reporte distingue inspección visual de verificaciones DOM.

La batería automatizada de navegador utiliza fixtures para búsqueda, proveedor, guardado y cuenta. Las pruebas verifican componentes y flujos reales, pero no acreditan login real, pagos, entrega de emails ni disponibilidad futura de proveedores. Los escenarios NCM mantienen el clasificador real con catálogo completo en su batería específica. No se afirma precisión arancelaria general ni revisión independiente por especialista.

Validación final y revisión exacta se registran en CI y en la PR: suite completa de Vitest, TypeScript/Vite y presupuestos de bundle, 109 casos de navegador Chromium/WebKit, migraciones/schema, assets NCM/SIM y runtime. No existe script de lint en el repositorio; se ejecutan type checking y `git diff --check`. El resultado final de estos controles debe aprobar antes de fusionar.


## Ampliación de aceptación real

El 25 de octubre se completaron ingreso, consulta de historial, preferencias sin cambios y guardado/reapertura de un presupuesto con la cuenta indicada por el usuario y APIs reales. El registro de prueba fue eliminado y la sesión se cerró. La aceptación descubrió y corrigió recuperación de categoría no visible al recargar, respuestas de eliminación sin cuerpo y foco después de eliminar. Evidencia, alcance y límites: [Aceptación real](REAL_ACCOUNT_ACCEPTANCE_2026_10_25.md). No se desplegó la PR por esta prueba.

## Corrección de la entrada y despliegue solicitado

Tras la instrucción explícita de desplegar, la PR #213 se fusionó y el despliegue de producción 40217266820 finalizó correctamente. Los pendientes editoriales y de configuración de Clerk indicados arriba siguen abiertos.

La captura enviada por el usuario también mostró una jerarquía inicial deficiente: un resumen sin datos ocupaba una columna completa y prolongaba la página. La corrección posterior centra el inicio y las preguntas de perfil en una columna, muestra el resumen desde la etapa de compra y elimina la barra al 0 % y el encabezado de borrador sólo en la decisión inicial. Las dos opciones tienen acciones explícitas. Se conserva la navegación y el progreso del formulario.

La revisión focal compara inicio y primera pregunta a 320, 390 y 1440 px. Las regresiones de navegador comprueban ambas opciones completas dentro de 844 px de alto, ausencia del resumen vacío, progreso visible al elegir y recuperación del resumen al completar el perfil. Capturas y mediciones: `/workspace/shipping-review/entry-focus-2026-10-25/`.
