# Implementation Plan: project-media-mosaic

## Overview

Se implementa el "Mosaico de Foco a la Deriva" en **vanilla JS/CSS sin paso de build**, coherente con
la arquitectura actual (`IntersectionObserver` de boot, sistema de idioma `data-es`/`data-en`, acento
`--proj-acc`). La estrategia de tareas separa la **lógica pura y testeable** (manifiesto, geometría de
layout, matemática de índice/wrap, reductor de estado, guarda de carga única) del **código de DOM**
(construcción de tiles, controlador, scheduler, puerta de visibilidad, cargador de medios), de modo que
las propiedades de correctitud se verifiquen con `fast-check` ejecutable por `node --test` sin build de
producción.

Cada archivo nuevo (`js/media-manifest.js`, `js/media-mosaic.js`) expone su lógica pura mediante una
guarda de export (`if (typeof module !== 'undefined' && module.exports) { ... }`) para que el mismo
archivo funcione como script de navegador y como módulo importable en pruebas de Node. La integración
final cablea `initMediaMosaic(panel)` junto a `initVis(panel)` en el boot de `ui.js` y `relabel()` en
`setLang()` de `bg-engine.js`.

Orden: datos/lógica pura con PBT → reequilibrio visual CSS → construcción de DOM e hidratación →
controlador/scheduler → puerta de visibilidad → cargador de medios → accesibilidad/reduced-motion →
sincronía de idioma/limpieza → markup de mejora progresiva → integración con el boot existente.

## Tasks

- [x] 1. Configurar tooling de pruebas dev-only y manifiesto de datos
  - [x] 1.1 Crear `package.json` dev-only y estructura `tests/`
    - Crear `package.json` (privado, sin runtime) con `fast-check` como `devDependency` y script `"test": "node --test"`
    - Crear carpeta `tests/` y un helper `tests/_helpers.js` para requerir los módulos del proyecto vía la guarda de export
    - Documentar que `node --test` es nativo de Node 18+ y no introduce build de producción
    - _Requirements: 5.1_

  - [x] 1.2 Crear `js/media-manifest.js` con `PROJECT_MEDIA` y `getManifest`
    - Definir `PROJECT_MEDIA` para los 6 proyectos (`gw`, `nltl`, `cosmos`, `physdeck`, `mineralia`, `mario`) con sus medios reales: índice 0 = `public/ph_{proj}.png`, luego `{proj}-02.png`, `{proj}-03.{gif|png}`, `{proj}-04.{mp4+poster|gif}` según los activos existentes
    - Cada `MediaItem` declara `type` ∈ {image, gif, video}, `src` no vacío, `poster` para vídeo, `captionEs`/`captionEn` y `focus` opcional
    - Implementar `getManifest(proj)` que devuelve la lista del proyecto o `[]` si no existe
    - Añadir guarda de export (`module.exports = { PROJECT_MEDIA, getManifest }`) sin romper el uso global en navegador
    - _Requirements: 5.1, 1.1_

  - [x]* 1.3 Escribir pruebas unitarias de `getManifest`
    - `[]` para proyecto inexistente; array correcto y ordenado para proyecto válido
    - Validar que todo `MediaItem` tiene `type` válido y `src` no vacío de ≤ 2048 caracteres
    - _Requirements: 5.1_

- [x] 2. Implementar plantillas de layout orgánico (datos puros + geometría)
  - [x] 2.1 Crear `js/media-mosaic.js` (sección de datos) con `MOSAIC_LAYOUTS`, `getLayout` y `MOSAIC_TIMING`
    - Definir `MOSAIC_LAYOUTS` para `n ∈ [2,6]` sobre rejilla densa 6×6, con celdas asimétricas (featured + medianas + panorámica) sin solapes y cubriendo `cols·rows`
    - Implementar `getLayout(n)`: para `1 ≤ n ≤ 6` devuelve la plantilla; para `7 ≤ n ≤ 12` genera `n` celdas deterministas sin solapes que cubren la rejilla (fallback determinista)
    - Congelar `MOSAIC_TIMING` (`DWELL` 3200, `FOCUS_TRANS` 520, `RESUME_DELAY` 900, `STAGGER` 70) como única fuente de verdad
    - Añadir guarda de export para las funciones/datos puros
    - _Requirements: 1.3, 1.4, 1.5_

  - [x]* 2.2 Escribir property test para `getLayout`
    - **Property 10: Layout válido (sin solapes, cubre)**
    - **Validates: Requirements 1.3, 1.4, 1.5**
    - Para `n` generado en [2,6]: `cells.length === n`, sin solapes y `Σ colSpan·rowSpan === cols·rows`; para `n` en [1,12]: `cells.length === n`; para `n` en [7,12]: además sin solapes y cobertura total

- [x] 3. Implementar lógica pura de índice/foco y reductor de estado
  - [x] 3.1 Implementar funciones puras de índice en `js/media-mosaic.js`
    - `normalizeIndex(i, n)`, `nextIndex(i, n)` (+1 mod n), `prevIndex(i, n)` (−1 mod n) con wrap
    - Garantizar `0 ≤ resultado < n` para cualquier entrada entera
    - Exportar vía la guarda de export
    - _Requirements: 2.2, 2.3, 3.2, 3.3_

  - [x]* 3.2 Escribir property test para índice/wrap
    - **Property 2: Índice en rango** y **Property 3: Wrap correcto**
    - **Validates: Requirements 2.2, 2.3, 3.2, 3.3**
    - Tras cualquier secuencia de `next`/`prev`/deriva, el índice permanece en `[0, n)`; `next` en `n−1` ⇒ `0`; `prev` en `0` ⇒ `n−1`

  - [x] 3.3 Implementar reductor puro de estado y cálculo de clases de foco
    - `reduce(state, action)` puro para acciones `{drift, hover, focus, key, click, mouseleave, blur, resume, offscreen, onscreen, hide, show, setRM}`, devolviendo `{focusIndex, mode, pinned, panelVisible, docVisible, reducedMotion}`
    - `computeFocusClasses(n, focusIndex)` ⇒ array de clases con exactamente un `is-focus` y el resto `is-ambient`
    - Política de modo: `mode === 'AUTO'` solo si `panelVisible ∧ docVisible ∧ ¬reducedMotion ∧ ¬pinned`; tick `auto` con `mode ≠ AUTO` es no-op
    - Exportar `reduce` y `computeFocusClasses`
    - _Requirements: 1.2, 2.4, 2.6, 3.1, 3.6, 6.2_

  - [x]* 3.4 Escribir property test para foco único
    - **Property 1: Exactamente un foco**
    - **Validates: Requirements 1.2**
    - Para cualquier `n ≥ 1` y `focusIndex` válido, `computeFocusClasses` produce exactamente un `is-focus`

  - [x]* 3.5 Escribir property test para deriva solo en AUTO
    - **Property 4: Deriva solo en AUTO**
    - **Validates: Requirements 2.4**
    - Un tick `source:'auto'` cambia `focusIndex` solo si `mode === 'AUTO'` en ese instante; en otro caso es no-op

  - [x]* 3.6 Escribir property test para pausa y reanudación cancelable
    - **Property 5: Hover/teclado pausa la deriva** y **Property 6: Reanudación con gracia, cancelable**
    - **Validates: Requirements 3.1, 3.4, 3.5, 3.6, 3.7**
    - Tras `hover`/`focus`/`key`/`click` el modo pasa a `USER_FOCUS` (o fijado) y no hay deriva; si reaparece `hover`/`focus` antes de `RESUME_DELAY`, la reanudación pendiente se cancela

- [x] 4. Checkpoint - lógica pura verificada
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Reequilibrio visual y rejilla del mosaico en CSS
  - [x] 5.1 Reequilibrar el área visual y definir la rejilla del mosaico en `css/source.css`
    - Cambiar `--vis-col` de `360px` a `440px` y `.proj-vis` de `aspect-ratio: 4/3` a `5/4` con `min-height: 260px`
    - Añadir `.proj-mosaic` (grid 6×6, `inset: 0`, `isolation: isolate`) y `.mosaic-tile` posicionada por custom properties `--col/--col-span/--row/--row-span`
    - Implementar la expansión de foco por compositor: `.is-focus` con `transform: scale()` + `z-index` + acento, `.is-ambient` atenuada; `focus-visible` con acento del proyecto (contraste ≥ 3:1); `object-position: var(--focus-pos, center)`
    - _Requirements: 4.1, 4.2, 4.3, 2.5, 7.6_

  - [x] 5.2 Añadir reglas responsive y de reduced-motion en `css/source.css`
    - Bajo 900px: `.proj-vis` con `aspect-ratio: 16/9`, mosaico como tira con `scroll-snap`, sin jitter ni transform de elevación
    - `@media (prefers-reduced-motion: reduce)`: desactivar barrido/escala/jitter y poner transiciones de foco a `0ms`
    - _Requirements: 4.5, 7.1_

- [x] 6. Construir el DOM del mosaico e hidratación idempotente
  - [x] 6.1 Implementar `buildMosaic(vis, items, layout)` y el plan puro de tiles
    - Implementar función pura `planMosaic(items, layout)` ⇒ descriptores de tile `{idx, type, src, cell, classes}` (determinista, base de la idempotencia)
    - `buildMosaic` construye un `<button class="mosaic-tile">` por medio en orden, inyecta custom props de celda, el `.mosaic-readout`, `.mosaic-modedot` y la región `aria-live`; el medio del índice 0 carga con `src`, los ambientales con `data-src`
    - Omitir medios sin `src` (registrar `console.warn`) y construir con los válidos restantes
    - _Requirements: 1.1, 1.2, 8.6, 5.2_

  - [x] 6.2 Implementar `initMediaMosaic(panel)` idempotente
    - Resolver `getManifest(proj)` + `getLayout(items.length)`, construir el mosaico, fijar `setFocus(0)` y devolver un `MosaicController`
    - Devolver `null` y conservar el medio único de respaldo si el manifiesto está vacío
    - Usar guarda (`dataset.hydrated`) para que invocaciones repetidas no dupliquen tiles, timers ni listeners
    - _Requirements: 1.6, 8.2, 8.5, 2.7_

  - [x]* 6.3 Escribir property test para idempotencia de hidratación
    - **Property 11: Idempotencia de hidratación**
    - **Validates: Requirements 8.2**
    - `planMosaic` es determinista para los mismos `(items, layout)`; aplicar el plan k≥1 veces produce el mismo conjunto de descriptores y la guarda evita duplicados

- [x] 7. Implementar el controlador y el programador de foco
  - [x] 7.1 Implementar `MosaicController` (render + interacción)
    - Implementar `setFocus/getFocus/next/prev/pause/resume/getMode` cableando `reduce` al DOM: clases `is-focus`/`is-ambient`, `aria-pressed`, `.mosaic-readout`, y `object-position` (o `50% 50%` si falta `focus`) dentro de 200 ms
    - La pieza enfocada se expande sin cambiar su celda ni las coordenadas de las demás (sin reflow)
    - _Requirements: 2.5, 4.4, 4.6, 7.4, 3.1_

  - [x] 7.2 Implementar `createFocusScheduler` (deriva con dwell y reanudación)
    - Un único `setTimeout` re-encadenado por mosaico (no `setInterval`); `start` no-op si reducedMotion o `|items| === 1`
    - `pause()` cancela el timer; `resumeAfter(ms)` programa la vuelta a `AUTO` y es cancelable; avanzar `focusIndex` +1 mod N cada `DWELL`
    - _Requirements: 2.1, 2.6, 2.7, 3.4, 3.7, 6.4_

  - [x]* 7.3 Escribir pruebas unitarias del scheduler con reloj inyectable
    - Verificar avance tras `DWELL`, pausa en hover y reanudación tras `RESUME_DELAY`, y que existe a lo sumo un timer activo
    - **Property 6: Reanudación con gracia, cancelable** (vertiente temporal)
    - **Validates: Requirements 2.1, 3.4, 3.5, 6.4**

- [x] 8. Implementar la puerta de visibilidad y la pausa de rendimiento
  - [x] 8.1 Implementar `createVisibilityGate` e integrar pausa/reanudación
    - Unificar `IntersectionObserver` (panel) + Page Visibility API (`visibilitychange`); emitir `onChange(panelVisible ∧ docVisible)`
    - Al perder visibilidad: modo `PAUSED_OFFSCREEN`/`PAUSED_HIDDEN`, pausar el scheduler y pausar todo medio en reproducción; al restaurarse (con `¬RM ∧ ¬pinned`): volver a `AUTO` y reanudar desde el foco actual
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 5.10_

  - [x]* 8.2 Escribir property test para pausa fuera de viewport / pestaña oculta
    - **Property 8: Pausa fuera de viewport / pestaña oculta**
    - **Validates: Requirements 6.1, 6.5, 6.6**
    - Con `¬panelVisible` o `¬docVisible` (vía reductor), ningún medio reproduce y no hay timers de deriva activos

- [x] 9. Implementar el cargador de medios (lazy, vídeo, reproducción)
  - [x] 9.1 Implementar `MediaLoader.ensureLoaded` y prefetch con fallback de error
    - `ensureLoaded(tile, item)` idempotente vía `dataset.loaded`; inyecta `<img loading="lazy">` o `<video muted playsinline loop preload="none">` con `poster` (o fondo HUD con acento si falta)
    - Cargar el índice 0 al hidratar y diferir ambientales; al cambiar foco, asegurar carga del enfocado y prefetch del siguiente dentro de 200 ms
    - Ante error de red/decodificación/404 o timeout de 10 s: marcar `.media-error`, mantener la pieza enfocable, no reintentar y permitir que la deriva continúe
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.8, 5.9, 1.7_

  - [x] 9.2 Implementar `applyPlayback` (política de un único medio en reproducción)
    - Reproducir el medio (vídeo/GIF) solo si está enfocado y `panelVisible ∧ docVisible ∧ ¬reducedMotion`; pausar todos los demás
    - Diferir el `src` de GIF hasta el enfoque; pausar el medio activo dentro de 200 ms si deja de cumplirse alguna condición
    - _Requirements: 5.6, 5.7, 5.10, 6.6_

  - [x]* 9.3 Escribir property test para carga única
    - **Property 12: Carga única**
    - **Validates: Requirements 5.4**
    - Para cualquier secuencia de enfoques, `ensureLoaded` carga el medio de cada tile a lo sumo una vez (guarda `dataset.loaded`)

  - [x]* 9.4 Escribir property test para reproducción de un único medio
    - **Property 7: Un único medio en reproducción**
    - **Validates: Requirements 5.6, 5.7**
    - En todo estado alcanzable, a lo sumo un medio reproduce y solo puede ser el de `focusIndex`, y solo si `enfocado ∧ panelVisible ∧ docVisible ∧ ¬reducedMotion`

- [x] 10. Checkpoint - controlador, visibilidad y medios verificados
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implementar accesibilidad y reduced-motion
  - [x] 11.1 Implementar teclado, ARIA y anuncios en vivo
    - Manejar `ArrowRight`/`ArrowLeft` (avance/retroceso con wrap + traslado del foco de teclado) y `Enter`/`Space`/click (fijar `pinned`)
    - Mantener `aria-pressed` (true en la enfocada, false en el resto); anunciar por `aria-live="polite"` «{posición} de {total}» + tipo dentro de 500 ms
    - Garantizar `alt`/`aria-label` no vacío derivado del caption del idioma activo o, en su ausencia, `"{proj} · {NN}"` (NN basado en 1, dos dígitos)
    - _Requirements: 3.2, 3.3, 3.6, 7.3, 7.4, 7.5, 7.7_

  - [x] 11.2 Implementar el gating de `prefers-reduced-motion`
    - Estado `STATIC_RM`: sin deriva automática, sin autoplay, sin barrido/escala, cambios de foco instantáneos (0 ms)
    - Permitir control manual por hover/teclado manteniendo los medios sin reproducción automática; reaccionar a cambios de la media query
    - _Requirements: 7.1, 7.2_

  - [x]* 11.3 Escribir property test para reduced-motion
    - **Property 9: Reduced-motion**
    - **Validates: Requirements 7.1, 7.2**
    - Con `reducedMotion = true` (vía reductor), no hay deriva ni autoplay; las acciones de hover/teclado siguen cambiando el foco

- [x] 12. Implementar sincronía de idioma y limpieza
  - [x] 12.1 Implementar `relabel()`
    - Actualizar cada caption y `aria-label` para coincidir con `documentElement.dataset.lang` (`es`/`en`), insertando texto vía `textContent`/atributos (sin `innerHTML` con datos no confiables)
    - _Requirements: 8.3_

  - [x] 12.2 Implementar `destroy()`
    - Liberar todos los timers, `IntersectionObserver`s y listeners de `document`/`visibilitychange` del panel, dejando cero activos y sin modificar el DOM posteriormente
    - _Requirements: 8.4_

  - [x]* 12.3 Escribir pruebas unitarias para `relabel` y `destroy`
    - **Property 15: Sincronía de idioma** y **Property 13: Sin fugas tras destroy**
    - **Validates: Requirements 8.3, 8.4**
    - Tras `relabel()` los captions/aria coinciden con el idioma activo; tras `destroy()` no quedan timers, observers ni listeners (recuento = 0)

- [x] 13. Implementar el markup de mejora progresiva en `index.html`
  - [x] 13.1 Reemplazar la imagen única por el mosaico declarativo y añadir los scripts
    - Para los 6 proyectos (`gw`, `nltl`, `cosmos`, `physdeck`, `mineralia`, `mario`), sustituir `<img class="proj-media">` dentro de `.proj-vis` por `.proj-mosaic[data-mosaic][data-count]` con un `button.mosaic-tile` por medio (índice 0 con `is-focus`), `.mosaic-readout`, `.mosaic-modedot` y `<p class="mosaic-live sr-only" aria-live="polite">`
    - Añadir `<script defer src="js/media-manifest.js">` y `<script defer src="js/media-mosaic.js">` antes de `js/ui.js`
    - _Requirements: 8.1, 7.3_

  - [x]* 13.2 Escribir test de mejora progresiva sobre el markup
    - **Property 14: Mejora progresiva**
    - **Validates: Requirements 8.1**
    - Verificar (parseando el markup estático) que cada medio del manifiesto está dentro de un `button` nativo, en orden del documento y operable sin JS

- [x] 14. Integrar con el boot existente y el cambio de idioma
  - [x] 14.1 Cablear `initMediaMosaic(panel)` en el boot de `js/ui.js`
    - En el `IntersectionObserver` de boot, añadir la llamada `initMediaMosaic(panel)` junto a `initVis(panel)` tras `classList.add('booted')`, guardando el controller devuelto para reuso
    - _Requirements: 8.2, 2.1_

  - [x] 14.2 Cablear `relabel()` en `setLang()` de `js/bg-engine.js`
    - Tras actualizar `documentElement.dataset.lang`, invocar `relabel()` en los controladores de mosaico de los paneles booteados
    - _Requirements: 8.3_

  - [x]* 14.3 Escribir test de integración del cableado
    - Verificar end-to-end (con DOM mínimo y reloj inyectable) que: boot ⇒ hidratado + item 0 cargado + `mode === 'AUTO'` si visible y `¬RM`; cambio de idioma ⇒ captions/aria actualizados
    - _Requirements: 8.2, 8.3, 2.1_

- [x] 15. Checkpoint final - integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia cláusulas de requisitos granulares para trazabilidad.
- Las 15 propiedades de correctitud del diseño se cubren con PBT (`fast-check` + `node --test`),
  apuntando a la lógica pura extraída (geometría de layout, índice/wrap, reductor de estado, guardas
  de carga e idempotencia) para evitar dependencias de DOM en el grueso de las pruebas.
- `fast-check` y `node --test` son solo de desarrollo; no añaden build de producción.
- Los checkpoints (4, 10, 15) aseguran validación incremental.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "5.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "3.1", "5.2", "13.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "13.2"] },
    { "id": 3, "tasks": ["3.4", "3.5", "3.6", "6.1"] },
    { "id": 4, "tasks": ["6.2"] },
    { "id": 5, "tasks": ["6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["7.3", "8.1"] },
    { "id": 8, "tasks": ["8.2", "9.1"] },
    { "id": 9, "tasks": ["9.3", "9.2"] },
    { "id": 10, "tasks": ["9.4", "11.1"] },
    { "id": 11, "tasks": ["11.2"] },
    { "id": 12, "tasks": ["11.3", "12.1"] },
    { "id": 13, "tasks": ["12.2"] },
    { "id": 14, "tasks": ["12.3", "14.1", "14.2"] },
    { "id": 15, "tasks": ["14.3"] }
  ]
}
```
