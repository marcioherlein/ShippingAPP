# Página personal y rediseño del cotizador — 3 de noviembre de 2026

## Problema y experiencia resultante

El historial estaba escondido dentro de un desplegable de cuenta. El formulario compartía una columna azul larga con el resumen de la operación, sin una jerarquía útil para empezar, retomar o comparar cálculos.

Ahora `#mi-panel` es una página personal con acceso a cuenta, cálculos anteriores, búsqueda por nombre entre los registros cargados, paginación y acciones para abrir o eliminar. Una cuenta verificada abre su panel por defecto si no está retomando trabajo. El presupuesto completo vuelve al comparador con sus datos y tarifas históricos; los registros antiguos incompletos muestran un detalle de lectura y la opción de iniciar otro cálculo.

El panel ofrece un nuevo cálculo y permite retomar el actual. Abrir otro presupuesto o empezar de nuevo protege el trabajo en curso con una confirmación. La navegación mantiene una única instancia del cotizador; los borradores y las operaciones interrumpidas por login siguen usando el mecanismo existente.

La estética sigue la referencia crema/oliva: superficies planas, bordes finos, navegación horizontal y tipografía más contenida. El resumen de operación es compacto y plegable, y la ficha usa progreso horizontal. El resultado prioriza inversión total, costo por unidad y comparación de la misma carga por courier, aéreo y LCL. Cada modalidad muestra mercadería, flete, impuestos, destino, plazos orientativos y restricciones. Se conservan las advertencias por baterías, las modalidades sin tarifa y la tabla visible de optimización con MOQ/lotes/tramos.

## Cuenta, privacidad y recuperación

- `ClerkShell` expone la identidad y la verificación sin trasladar claves al panel. Sólo se consulta el historial cuando `/api/me` confirmó la cuenta.
- El historial se desmonta al cambiar de usuario. Se ignoran respuestas tardías de las consultas anteriores.
- Los borradores de cuenta tienen propietario en la sesión del navegador. Logout, cambio de cuenta y recuperación de un propietario diferente limpian el árbol del cotizador, los datos privados y los diálogos pendientes de reemplazo. El paso anónimo → autenticado conserva el trabajo para retomar una operación protegida.
- El login del encabezado lleva al panel. El login pedido dentro de un paso protegido conserva el cotizador y su retorno.
- Los hashes de secciones y de Clerk no se interpretan como cambios de página. El enlace limpio `#cotizador` monta la aplicación sin depender de almacenamiento previo.
- No se cambió el backend de ownership, el motor NCM ni las credenciales de Clerk.

## Evidencia de validación

- Suite completa de unitarios/integración: **195 archivos, 1.262 pruebas aprobadas**.
- TypeScript/build, reconciliación canónica NCM/SIM, presupuesto de bundle y `git diff --check`: aprobados. El repositorio no dispone de script lint.
- Bundle de Worker: dry run aprobado. Los archivos generados no se incluyen en el commit.
- La batería focal inicial pasó 22 casos Chromium/WebKit; después se ajustaron el encabezado de 320 px, el contraste heredado y la compacidad móvil. La batería final completa y el despliegue se exigen en CI sobre el head exacto y se registran en la PR asociada.
- Nuevas pruebas de cuenta cubren verificación, errores/reintento, búsqueda, apertura diferida del snapshot, snapshots antiguos, paginación, eliminación/foco, conservación del borrador y cambios de usuario. Browser agrega el recorrido real de componentes hasta el comparador en 320, 390 y 1440 px, con comprobaciones de contraste y límites de la página.
- Revisión independiente: diez capturas Chromium/WebKit inspeccionadas individualmente. Detectó compresión del encabezado estrecho y estilos heredados, corregidos antes del release. Las capturas finales se conservan en los artefactos browser de CI.

Los harnesses de cuenta usan componentes de producción y el motor de costos real con respuestas API deterministas. No acreditan un login real de Clerk ni una oferta comercial vigente. El workflow de producción mantiene los gates autenticados existentes, incluido el smoke final de intake.

## Límites pendientes

La configuración productiva de Clerk y los textos legales aprobados siguen requiriendo datos del operador ya documentados. No se cambió de instancia ni se inventaron credenciales. El plan NCM continúa requiriendo corpus independiente y revisión aduanera experta; este rediseño no amplía las garantías de clasificación ni de costos.
