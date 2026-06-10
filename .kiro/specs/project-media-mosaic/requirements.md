# Requirements Document

## Introduction

Esta funcionalidad, **"Mosaico de Foco a la Deriva" (Focus-Drift Mosaic)**, sustituye la imagen única
y estática de cada tarjeta de proyecto (`article.proj-panel > .proj-vis > img.proj-media`) por un
**mosaico orgánico y desordenado de medios mixtos** (imágenes, GIFs y vídeos) por proyecto. Todos los
medios conviven a la vez en una composición asimétrica de tamaños variados (no una rejilla uniforme, no
un carrusel con flechas). De forma autónoma, una pieza se vuelve la enfocada: se expande con una
transición suave, se mantiene un breve instante (*dwell*) y luego el foco deriva a la siguiente pieza,
recorriendo el mosaico en un ciclo continuo. Si el usuario pasa el cursor o enfoca con teclado sobre
una pieza, esa pieza pasa a ser la enfocada y el ciclo automático se pausa; al salir, tras una breve
gracia cancelable, el ciclo se reanuda. La funcionalidad además **reequilibra y agranda** el área
visual de forma consistente entre todas las tarjetas.

El enfoque es **vanilla JS/CSS con mejora progresiva**, sin framework ni paso de build, coherente con
la arquitectura actual (boot por `IntersectionObserver`, sistema de idioma `data-es`/`data-en`, acento
por proyecto `--proj-acc`). Se respeta `prefers-reduced-motion`, se pausa la actividad cuando el panel
está fuera de viewport o la pestaña oculta, y los archivos se declaran como placeholders en un
manifiesto de datos por proyecto.

Estos requisitos se derivan del documento de diseño aprobado (`design.md`) y están redactados para que
cada una de las 15 propiedades de correctitud del diseño pueda referenciar criterios concretos mediante
la anotación **Validates: Requirements X.Y**.

## Glossary

- **Mosaico**: el contenedor `.proj-mosaic` que reemplaza la imagen única dentro de `.proj-vis`,
  compuesto por una colección de Piezas de medios mixtos.
- **Pieza**: cada `button.mosaic-tile` del Mosaico, que contiene un medio (imagen, GIF o vídeo).
- **Pieza_Enfocada**: la única Pieza con la clase `.is-focus`, expandida visualmente; las demás llevan
  la clase `.is-ambient`.
- **Foco_a_la_Deriva**: el ciclo automático que expande la Pieza_Enfocada, la mantiene durante un
  intervalo (`DWELL`) y luego avanza el foco a la siguiente Pieza.
- **Controlador_de_Mosaico**: el módulo que hidrata el Mosaico y gestiona el estado, la máquina de
  estados y el renderizado (`initMediaMosaic` / `MosaicController`).
- **Programador_de_Foco**: el componente que temporiza la deriva automática y la reanudación con gracia
  (`FocusScheduler`).
- **Cargador_de_Medios**: el componente que carga perezosamente los medios, hace prefetch del siguiente
  y aplica la política de reproducción (`MediaLoader`).
- **Puerta_de_Visibilidad**: el componente que unifica `IntersectionObserver` (panel dentro/fuera de
  viewport) y la Page Visibility API (pestaña oculta) (`VisibilityGate`).
- **Manifiesto_de_Medios**: la estructura de datos declarativa `PROJECT_MEDIA` que asocia cada
  proyecto (`data-proj`) con su lista ordenada de medios.
- **Plantilla_de_Layout**: la geometría de rejilla densa por número de piezas (`MOSAIC_LAYOUTS` /
  `getLayout(n)`), expresada como celdas de CSS Grid.
- **Área_Visual**: el contenedor `.proj-vis` de cada panel de proyecto que aloja al Mosaico.
- **Modo**: el estado actual de la máquina de estados del Mosaico, uno de
  `AUTO`, `USER_FOCUS`, `RESUMING`, `PAUSED_OFFSCREEN`, `PAUSED_HIDDEN`, `STATIC_RM`.
- **DWELL**: tiempo, en milisegundos, que una Pieza permanece enfocada antes de derivar (3200 ms).
- **RESUME_DELAY**: tiempo de gracia, en milisegundos, tras la salida del usuario antes de reanudar el
  Modo `AUTO` (900 ms).
- **pinned**: condición activada por click/Enter que fija la Pieza_Enfocada e impide la reanudación
  automática hasta un nuevo click/Enter.

## Requirements

### Requirement 1: Mosaico orgánico de medios mixtos (no carrusel)

**User Story:** Como visitante del portafolio, quiero ver varios medios de un proyecto a la vez en una
composición orgánica y asimétrica, para apreciar el proyecto sin manipular un carrusel.

#### Acceptance Criteria

1. WHEN el Controlador_de_Mosaico hidrata un panel que tiene entre 1 y 12 medios declarados en el Manifiesto_de_Medios, THE Controlador_de_Mosaico SHALL construir un Mosaico con exactamente una Pieza por cada medio declarado, en el mismo orden en que los medios aparecen en el Manifiesto_de_Medios.
2. WHILE el Mosaico está hidratado, THE Controlador_de_Mosaico SHALL mantener exactamente una Pieza con la clase `.is-focus` —inicialmente la Pieza correspondiente al primer medio declarado en el Manifiesto_de_Medios— y todas las Piezas restantes con la clase `.is-ambient`.
3. WHEN la Plantilla_de_Layout se solicita para un número de piezas n con 2 ≤ n ≤ 6, THE Plantilla_de_Layout SHALL devolver exactamente n celdas que no se solapan y que cubren por completo la rejilla densa de cols×rows, de modo que la suma de colSpan·rowSpan de todas las celdas sea igual a cols·rows.
4. WHEN la Plantilla_de_Layout se solicita para un número de piezas n con 1 ≤ n ≤ 12, THE Plantilla_de_Layout SHALL devolver exactamente n celdas.
5. IF la Plantilla_de_Layout se solicita para un número de piezas n con 7 ≤ n ≤ 12 (mayor que la plantilla más grande disponible), THEN THE Plantilla_de_Layout SHALL devolver exactamente n celdas deterministas que no se solapan y que cubren por completo la rejilla densa de cols×rows, de modo que la suma de colSpan·rowSpan de todas las celdas sea igual a cols·rows.
6. IF el Controlador_de_Mosaico hidrata un panel cuyo Manifiesto_de_Medios no declara ningún medio, THEN THE Controlador_de_Mosaico SHALL no construir ningún Mosaico y conservar el medio único de respaldo del panel sin modificarlo.
7. IF un medio declarado no puede cargarse, THEN THE Controlador_de_Mosaico SHALL mostrar el contenido de respaldo (póster o marcador) en la Pieza afectada y mantener sin alterar el número de Piezas y el layout del Mosaico.

### Requirement 2: Ciclo automático de Foco a la Deriva

**User Story:** Como visitante, quiero que el foco recorra los medios de un proyecto automáticamente,
para descubrir todo el contenido sin tener que interactuar.

#### Acceptance Criteria

1. WHILE el Modo es `AUTO`, THE Programador_de_Foco SHALL avanzar la Pieza_Enfocada a la siguiente Pieza (índice +1) cada vez que transcurren DWELL milisegundos (3200 ms ± 200 ms), midiendo el intervalo desde el instante en que la Pieza pasó a estar enfocada.
2. WHEN el Foco_a_la_Deriva avanza desde la última Pieza (índice |items|−1), THE Controlador_de_Mosaico SHALL establecer la Pieza_Enfocada en el índice 0.
3. THE Controlador_de_Mosaico SHALL mantener el índice de la Pieza_Enfocada dentro del rango 0 ≤ índice < |items| en todo momento.
4. IF un tick de deriva con origen `auto` se dispara cuando el Modo no es `AUTO`, THEN THE Controlador_de_Mosaico SHALL ignorar ese tick y conservar la Pieza_Enfocada actual.
5. WHEN una Pieza pasa a ser la Pieza_Enfocada, THE Controlador_de_Mosaico SHALL expandirla manteniendo sin cambios su celda en la rejilla y las coordenadas de rejilla de todas las demás Piezas (sin reflow).
6. WHILE el Modo permanece `AUTO` durante |items| avances consecutivos del Foco_a_la_Deriva, THE Controlador_de_Mosaico SHALL hacer que cada Pieza sea la Pieza_Enfocada exactamente una vez antes de que se repita cualquiera de ellas.
7. IF |items| es igual a 1, THEN THE Controlador_de_Mosaico SHALL mantener la Pieza_Enfocada en el índice 0 y no programar ningún avance del Foco_a_la_Deriva.

### Requirement 3: Control manual por hover y teclado con reanudación cancelable

**User Story:** Como visitante, quiero tomar el control del foco al pasar el cursor o usar el teclado,
para detenerme en el medio que me interesa y que el ciclo se reanude solo cuando me retiro.

#### Acceptance Criteria

1. WHEN un usuario sitúa el cursor sobre una Pieza o la enfoca con el teclado, THE Controlador_de_Mosaico SHALL establecer esa Pieza como Pieza_Enfocada, cambiar el Modo a `USER_FOCUS` y pausar el Programador_de_Foco.
2. WHEN un usuario pulsa la tecla ArrowRight mientras una Pieza del Mosaico tiene el foco de teclado, THE Controlador_de_Mosaico SHALL avanzar la Pieza_Enfocada en +1 con wrap (desde |items|−1 a 0), trasladar el foco de teclado a la nueva Pieza_Enfocada y mantener el Modo en `USER_FOCUS`.
3. WHEN un usuario pulsa la tecla ArrowLeft mientras una Pieza del Mosaico tiene el foco de teclado, THE Controlador_de_Mosaico SHALL retroceder la Pieza_Enfocada en −1 con wrap (desde 0 a |items|−1), trasladar el foco de teclado a la nueva Pieza_Enfocada y mantener el Modo en `USER_FOCUS`.
4. WHEN el cursor sale del Mosaico o una Pieza del Mosaico pierde el foco de teclado sin que ninguna otra Pieza lo reciba, y siempre que ¬pinned, THE Programador_de_Foco SHALL programar la reanudación del Modo `AUTO` para que ocurra tras RESUME_DELAY milisegundos (900 ms).
5. IF un evento de hover o de foco sobre una Pieza del Mosaico reaparece antes de transcurrir RESUME_DELAY (900 ms), THEN THE Programador_de_Foco SHALL cancelar la reanudación pendiente y conservar el Modo `USER_FOCUS`.
6. WHEN un usuario hace click o pulsa Enter o Space sobre una Pieza, THE Controlador_de_Mosaico SHALL fijar (pinned) esa Pieza como Pieza_Enfocada, mantener el Modo en `USER_FOCUS`, cancelar cualquier reanudación pendiente e ignorar la reanudación automática hasta un nuevo click, Enter o Space sobre una Pieza.
7. WHILE las condiciones panelVisible, docVisible, ¬reducedMotion y ¬pinned se cumplen, WHEN transcurren RESUME_DELAY milisegundos (900 ms) tras la salida del usuario, THE Controlador_de_Mosaico SHALL restablecer el Modo `AUTO` y reanudar el Foco_a_la_Deriva desde la Pieza_Enfocada actual.

### Requirement 4: Reequilibrio y agrandamiento consistente del área visual

**User Story:** Como visitante, quiero que el área visual de todas las tarjetas tenga un tamaño
consistente y generoso, para que ningún proyecto se vea desproporcionadamente pequeño o grande.

#### Acceptance Criteria

1. WHILE el viewport tiene un ancho de al menos 900px, THE Área_Visual SHALL presentar una proporción (aspect-ratio) de 5/4 con una altura mínima de 260px de forma idéntica en todas las tarjetas de proyecto.
2. THE Mosaico SHALL ocupar por completo el Área_Visual (inset 0), sin márgenes visibles ni recorte en ninguno de sus cuatro bordes, en cada panel de proyecto.
3. WHILE el viewport tiene un ancho de al menos 900px, THE columna visual de `.proj-body` SHALL usar la misma anchura (token `--vis-col`, 440px) en todas las tarjetas de proyecto.
4. WHEN una Pieza pasa a ser la Pieza_Enfocada, THE Controlador_de_Mosaico SHALL aplicar, dentro de los 200 ms siguientes, el `object-position` de interés declarado en el Manifiesto_de_Medios para reencuadrar el medio dentro del Área_Visual.
5. WHILE el viewport tiene un ancho menor que 900px, THE Área_Visual SHALL presentar una proporción (aspect-ratio) de 16/9 de forma idéntica en todas las tarjetas de proyecto.
6. IF el Manifiesto_de_Medios no declara `object-position` para el medio de la Pieza_Enfocada, THEN THE Controlador_de_Mosaico SHALL aplicar un encuadre centrado (`50% 50%`).

### Requirement 5: Manejo de medios mixtos con carga perezosa y manifiesto

**User Story:** Como visitante, quiero ver imágenes, GIFs y vídeos del proyecto cargados de forma
eficiente, para una experiencia fluida sin esperas ni consumo innecesario de datos.

#### Acceptance Criteria

1. THE Manifiesto_de_Medios SHALL asociar cada proyecto (`data-proj`) con una lista ordenada de entre 1 y 12 medios, donde cada medio declara un `type` perteneciente a {image, gif, video} y un `src` no vacío de a lo sumo 2048 caracteres.
2. WHEN el Controlador_de_Mosaico hidrata un Mosaico, THE Cargador_de_Medios SHALL cargar el medio de la Pieza_Enfocada inicial (índice 0) y diferir las Piezas ambientales mediante `data-src` y `loading="lazy"`.
3. WHEN una Pieza pasa a ser la Pieza_Enfocada, THE Cargador_de_Medios SHALL asegurar la carga de su medio e iniciar el prefetch del medio de la Pieza siguiente dentro de los 200 ms posteriores al cambio de foco.
4. THE Cargador_de_Medios SHALL cargar el medio de cada Pieza a lo sumo una vez, usando `dataset.loaded` como guarda de idempotencia.
5. WHERE el `type` de un medio es `video`, THE Cargador_de_Medios SHALL inyectar un elemento `<video>` con los atributos `muted`, `playsinline`, `loop` y `preload="none"`, mostrando el `poster` declarado mientras la Pieza no esté enfocada.
6. WHEN la Pieza_Enfocada tiene `type` `video` o `gif` y se cumplen simultáneamente panelVisible=true, docVisible=true y reducedMotion=false, THE Cargador_de_Medios SHALL reproducir su medio y pausar el medio de todas las demás Piezas.
7. THE Controlador_de_Mosaico SHALL mantener a lo sumo un medio (vídeo o GIF) en reproducción en cada instante, y ese medio SHALL ser únicamente el de la Pieza_Enfocada.
8. IF un medio no puede cargarse por un error de red, un error de decodificación, una respuesta 404, o no completa su carga en 10 segundos, THEN THE Cargador_de_Medios SHALL marcar la Pieza con la clase `.media-error` como indicación de error, conservarla enfocable, no reintentar la carga, y permitir que el Foco_a_la_Deriva continúe.
9. WHERE el Manifiesto_de_Medios no declara `poster` para un medio de `type` `video`, THE Cargador_de_Medios SHALL mostrar un fondo HUD con el acento del proyecto en lugar del póster.
10. IF un medio de la Pieza_Enfocada está en reproducción y deja de cumplirse alguna de las condiciones panelVisible=true, docVisible=true o reducedMotion=false, THEN THE Cargador_de_Medios SHALL pausar dicho medio dentro de los 200 ms posteriores al cambio de condición.

### Requirement 6: Rendimiento mediante pausa fuera de viewport y pestaña oculta

**User Story:** Como visitante, quiero que las animaciones y vídeos se detengan cuando no estoy viendo
la tarjeta o la pestaña, para ahorrar batería, CPU y datos.

#### Acceptance Criteria

1. IF el panel sale del viewport (¬panelVisible), THEN THE Controlador_de_Mosaico SHALL cambiar el Modo a `PAUSED_OFFSCREEN` y pausar el Programador_de_Foco.
2. WHILE se cumplen panelVisible, docVisible, ¬reducedMotion y ¬pinned, THE Controlador_de_Mosaico SHALL mantener el Modo `AUTO` con el Foco_a_la_Deriva activo.
3. WHILE se cumplen ¬reducedMotion y ¬pinned, WHEN se restauran a la vez panelVisible y docVisible estando el Modo en `PAUSED_OFFSCREEN` o `PAUSED_HIDDEN`, THE Controlador_de_Mosaico SHALL restablecer el Modo `AUTO` y reanudar el Foco_a_la_Deriva desde la Pieza_Enfocada actual.
4. THE Programador_de_Foco SHALL mantener como máximo un temporizador de deriva activo por Mosaico, re-encadenando un único `setTimeout` tras cada transición.
5. IF el documento está oculto (¬docVisible), THEN THE Controlador_de_Mosaico SHALL cambiar el Modo a `PAUSED_HIDDEN` y pausar el Programador_de_Foco.
6. WHEN el Modo cambia a `PAUSED_OFFSCREEN` o `PAUSED_HIDDEN`, THE Controlador_de_Mosaico SHALL pausar todo medio (vídeo o GIF) que estuviera en reproducción dentro del Mosaico, dejándolo en estado pausado (`paused === true`).

### Requirement 7: Accesibilidad (reduced-motion, teclado, ARIA, foco visible)

**User Story:** Como usuario con necesidades de accesibilidad, quiero controlar el mosaico con teclado y
que respete mis preferencias de movimiento, para usar el portafolio de forma cómoda y comprensible.

#### Acceptance Criteria

1. WHILE `prefers-reduced-motion` tiene el valor `reduce`, THE Controlador_de_Mosaico SHALL presentar todas las Piezas en estado estático (póster), sin iniciar el Foco_a_la_Deriva, sin autoplay de vídeos o GIFs, sin animación de barrido o escala, y aplicando cualquier cambio de Pieza_Enfocada de forma instantánea (sin transición, con duración 0 ms).
2. WHERE `prefers-reduced-motion` tiene el valor `reduce`, THE Controlador_de_Mosaico SHALL permitir el control manual de la Pieza_Enfocada mediante hover y teclado, manteniendo los medios sin reproducción automática.
3. THE Controlador_de_Mosaico SHALL representar cada Pieza como un elemento `<button>` nativo, alcanzable mediante la tecla Tab en el orden del DOM y operable tanto con Enter como con la barra espaciadora (Space).
4. WHEN una Pieza pasa a ser la Pieza_Enfocada, THE Controlador_de_Mosaico SHALL establecer `aria-pressed="true"` en esa Pieza y `aria-pressed="false"` en todas las demás Piezas.
5. WHEN la Pieza_Enfocada cambia, THE Controlador_de_Mosaico SHALL anunciar, dentro de los 500 ms siguientes y a través de una región `aria-live="polite"` presente en el DOM, la posición de la Pieza_Enfocada en el formato «{posición} de {total}» (posición basada en 1) junto con el tipo del medio enfocado (image, gif o video).
6. WHEN una Pieza recibe el foco de teclado, THE Controlador_de_Mosaico SHALL mostrar un indicador `focus-visible` con el acento del proyecto que presente una relación de contraste de al menos 3:1 respecto a los colores adyacentes y que permanezca visible de forma continua mientras la Pieza conserve el foco de teclado.
7. THE Controlador_de_Mosaico SHALL proporcionar para cada medio un texto alternativo (`alt` o `aria-label`) no vacío, derivado del caption del idioma activo o, en su ausencia, de un texto genérico con el formato `"{proj} · {NN}"`, donde {NN} es el índice de la Pieza basado en 1 y rellenado a dos dígitos (por ejemplo `"01"`).

### Requirement 8: Mejora progresiva, sincronía de idioma, hidratación idempotente y limpieza

**User Story:** Como visitante, quiero que el contenido funcione sin JavaScript, en mi idioma, y sin
fugas de recursos, para una experiencia robusta y respetuosa con el rendimiento.

#### Acceptance Criteria

1. WHERE JavaScript está desactivado o la hidratación falla, THE Mosaico SHALL presentar cada medio del Manifiesto_de_Medios dentro de un botón nativo, visible sin JS, alcanzable con Tab en el orden del documento y operable con Enter.
2. WHEN el Controlador_de_Mosaico hidrata el mismo panel una o más veces (k ≥ 1), THE Controlador_de_Mosaico SHALL producir un DOM idéntico al de la primera hidratación, con exactamente una Pieza por medio válido y sin incrementar el número de temporizadores ni de listeners.
3. WHEN se invoca `relabel()` tras un cambio de idioma al valor `es` o `en`, THE Controlador_de_Mosaico SHALL actualizar cada caption y cada `aria-label` para que coincidan con el valor de `documentElement.dataset.lang`.
4. WHEN se invoca `destroy()` sobre un Mosaico, THE Controlador_de_Mosaico SHALL liberar todos los temporizadores, los IntersectionObservers y los listeners de `document` y `visibilitychange` asociados al panel, dejando cero temporizadores, observers y listeners activos y sin modificar posteriormente el DOM.
5. IF un proyecto no tiene medios en el Manifiesto_de_Medios, THEN THE Controlador_de_Mosaico SHALL devolver `null` y conservar el markup base intacto, sin crear ninguna Pieza ni modificar el DOM.
6. IF un medio del Manifiesto_de_Medios carece de `src` o lo tiene vacío, THEN THE Controlador_de_Mosaico SHALL omitir ese medio sin crear su Pieza, registrar una advertencia y construir el Mosaico con los medios válidos restantes, manteniendo activo el Foco_a_la_Deriva.
