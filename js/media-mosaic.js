'use strict';
/* =============================================================
   media-mosaic.js — Mosaico de Foco a la Deriva (Focus-Drift Mosaic)
   Javier Portfolio
   -------------------------------------------------------------
   SECCION DE DATOS (tarea 2.1): geometria pura del mosaico.
   - MOSAIC_LAYOUTS : plantillas organicas por numero de piezas (2..6)
                      sobre una rejilla densa 6x6 (celdas asimetricas,
                      sin solapes, cubriendo cols*rows = 36).
   - getLayout(n)   : plantilla para 1<=n<=6 ; fallback determinista
                      (particion guillotina) para n>=7.
   - MOSAIC_TIMING  : constantes de tiempo congeladas (unica fuente
                      de verdad de la temporizacion).
   Datos puros, sin DOM. Funciona como global de navegador y como
   modulo CommonJS para pruebas en Node (guarda de export al final).
   El resto del modulo (indice, reductor, buildMosaic, controlador,
   scheduler, loader...) se anade en tareas posteriores.
   ============================================================= */

/**
 * Una celda de plantilla: rectangulo en una rejilla densa (cols x rows),
 * expresada con lineas de rejilla 1-based.
 * @typedef {Object} MosaicCell
 * @property {number} col            - linea de inicio de columna (1-based)
 * @property {number} colSpan        - numero de columnas que ocupa
 * @property {number} row            - linea de inicio de fila (1-based)
 * @property {number} rowSpan        - numero de filas que ocupa
 * @property {boolean} [featured]    - true para la(s) pieza(s) de mayor area
 *
 * @typedef {Object} MosaicLayout
 * @property {number} cols           - columnas de la rejilla densa (p. ej. 6)
 * @property {number} rows           - filas de la rejilla densa (p. ej. 6)
 * @property {MosaicCell[]} cells    - una celda por pieza (cells.length === n)
 *
 * @typedef {Object.<number, MosaicLayout>} LayoutTable  // clave = numero de piezas (2..6)
 */

/** Dimensiones de la rejilla densa base. Area = COLS * ROWS = 36. */
const MOSAIC_COLS = 6;
const MOSAIC_ROWS = 6;

/**
 * Congela en profundidad un layout (objeto + cells) para protegerlo como
 * unica fuente de verdad de la geometria. Idempotente y seguro.
 * @template T
 * @param {T} layout
 * @returns {T}
 */
function freezeLayout(layout) {
  if (layout && Array.isArray(layout.cells)) {
    layout.cells.forEach(function (c) { Object.freeze(c); });
    Object.freeze(layout.cells);
  }
  return Object.freeze(layout);
}

/**
 * Plantillas de composicion organica por numero de piezas (2..6).
 * Cada plantilla teselа perfectamente la rejilla 6x6 (suma de
 * colSpan*rowSpan === 36) sin solapes ni huecos, mezclando una pieza
 * "featured" (area grande), piezas medianas y alguna estrecha/panoramica.
 * @type {LayoutTable}
 */
const MOSAIC_LAYOUTS = {
  // n=2 : columna grande (featured) + columna estrecha vertical.  24 + 12 = 36
  2: {
    cols: MOSAIC_COLS, rows: MOSAIC_ROWS,
    cells: [
      { col: 1, colSpan: 4, row: 1, rowSpan: 6, featured: true }, // 24
      { col: 5, colSpan: 2, row: 1, rowSpan: 6 }                  // 12
    ]
  },

  // n=3 : featured + panoramica vertical derecha + panoramica horizontal inferior. 16 + 12 + 8 = 36
  3: {
    cols: MOSAIC_COLS, rows: MOSAIC_ROWS,
    cells: [
      { col: 1, colSpan: 4, row: 1, rowSpan: 4, featured: true }, // 16
      { col: 5, colSpan: 2, row: 1, rowSpan: 6 },                 // 12
      { col: 1, colSpan: 4, row: 5, rowSpan: 2 }                  //  8
    ]
  },

  // n=4 : featured + dos medianas a la derecha + panoramica inferior. 16 + 6 + 6 + 8 = 36
  4: {
    cols: MOSAIC_COLS, rows: MOSAIC_ROWS,
    cells: [
      { col: 1, colSpan: 4, row: 1, rowSpan: 4, featured: true }, // 16
      { col: 5, colSpan: 2, row: 1, rowSpan: 3 },                 //  6
      { col: 5, colSpan: 2, row: 4, rowSpan: 3 },                 //  6
      { col: 1, colSpan: 4, row: 5, rowSpan: 2 }                  //  8
    ]
  },

  // n=5 : featured + tres cuadradas a la derecha + panoramica inferior. 16 + 4 + 4 + 4 + 8 = 36
  5: {
    cols: MOSAIC_COLS, rows: MOSAIC_ROWS,
    cells: [
      { col: 1, colSpan: 4, row: 1, rowSpan: 4, featured: true }, // 16
      { col: 5, colSpan: 2, row: 1, rowSpan: 2 },                 //  4
      { col: 5, colSpan: 2, row: 3, rowSpan: 2 },                 //  4
      { col: 5, colSpan: 2, row: 5, rowSpan: 2 },                 //  4
      { col: 1, colSpan: 4, row: 5, rowSpan: 2 }                  //  8
    ]
  },

  // n=6 : featured + banda superior + mediana + estrecha + cuadrada + panoramica. 12+6+4+2+4+8 = 36
  6: {
    cols: MOSAIC_COLS, rows: MOSAIC_ROWS,
    cells: [
      { col: 1, colSpan: 3, row: 1, rowSpan: 4, featured: true }, // 12
      { col: 4, colSpan: 3, row: 1, rowSpan: 2 },                 //  6
      { col: 4, colSpan: 2, row: 3, rowSpan: 2 },                 //  4
      { col: 6, colSpan: 1, row: 3, rowSpan: 2 },                 //  2 (estrecha)
      { col: 1, colSpan: 2, row: 5, rowSpan: 2 },                 //  4
      { col: 3, colSpan: 4, row: 5, rowSpan: 2 }                  //  8 (panoramica)
    ]
  }
};
Object.keys(MOSAIC_LAYOUTS).forEach(function (k) { freezeLayout(MOSAIC_LAYOUTS[k]); });
Object.freeze(MOSAIC_LAYOUTS);

/**
 * Layout de una sola pieza: cubre toda la rejilla densa.
 * @returns {MosaicLayout}
 */
function singleCellLayout() {
  return freezeLayout({
    cols: MOSAIC_COLS, rows: MOSAIC_ROWS,
    cells: [{ col: 1, colSpan: MOSAIC_COLS, row: 1, rowSpan: MOSAIC_ROWS, featured: true }]
  });
}

/**
 * Genera de forma determinista un layout de exactamente `n` celdas que
 * teselan la rejilla densa 6x6 sin solapes ni huecos (suma de areas === 36).
 *
 * Algoritmo: particion guillotina. Se parte del rectangulo completo y, hasta
 * alcanzar `n` rectangulos, se divide repetidamente el de mayor area (con
 * desempate determinista por fila y luego columna) por su lado mas largo.
 * Las divisiones guillotina garantizan por construccion cobertura total y
 * ausencia de solapes con spans enteros. Para n<=36 siempre hay un rectangulo
 * divisible, de modo que el resultado tiene exactamente `n` celdas.
 *
 * @param {number} n - numero de celdas deseado (>=2, tipicamente 7..12)
 * @returns {MosaicLayout}
 */
function generateFallbackLayout(n) {
  const cells = [{ col: 1, colSpan: MOSAIC_COLS, row: 1, rowSpan: MOSAIC_ROWS }];

  while (cells.length < n) {
    // Seleccionar el rectangulo de mayor area; desempate: fila menor, luego columna menor.
    let pick = 0;
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i];
      const b = cells[pick];
      const areaA = a.colSpan * a.rowSpan;
      const areaB = b.colSpan * b.rowSpan;
      if (areaA > areaB ||
          (areaA === areaB && (a.row < b.row || (a.row === b.row && a.col < b.col)))) {
        pick = i;
      }
    }

    const r = cells[pick];
    let first;
    let second;

    if (r.colSpan >= r.rowSpan && r.colSpan >= 2) {
      // Division vertical (corta columnas) por la mitad.
      const left = Math.floor(r.colSpan / 2);
      first = { col: r.col, colSpan: left, row: r.row, rowSpan: r.rowSpan };
      second = { col: r.col + left, colSpan: r.colSpan - left, row: r.row, rowSpan: r.rowSpan };
    } else if (r.rowSpan >= 2) {
      // Division horizontal (corta filas) por la mitad.
      const top = Math.floor(r.rowSpan / 2);
      first = { col: r.col, colSpan: r.colSpan, row: r.row, rowSpan: top };
      second = { col: r.col, colSpan: r.colSpan, row: r.row + top, rowSpan: r.rowSpan - top };
    } else {
      // Rectangulo 1x1 indivisible: imposible para n<=36. Guarda anti-bucle.
      break;
    }

    cells.splice(pick, 1, first, second);
  }

  // Marcar la celda de mayor area como "featured" (primer maximo, determinista).
  let featuredIdx = 0;
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].colSpan * cells[i].rowSpan > cells[featuredIdx].colSpan * cells[featuredIdx].rowSpan) {
      featuredIdx = i;
    }
  }
  if (cells[featuredIdx]) { cells[featuredIdx].featured = true; }

  return freezeLayout({ cols: MOSAIC_COLS, rows: MOSAIC_ROWS, cells: cells });
}

/**
 * Devuelve la Plantilla_de_Layout para `n` piezas.
 *  - n <= 1            : una unica celda que cubre toda la rejilla.
 *  - 2 <= n <= 6       : plantilla organica precomputada (MOSAIC_LAYOUTS).
 *  - n >= 7            : fallback determinista (particion guillotina) con
 *                        exactamente `n` celdas que cubren la rejilla.
 * En todos los casos `cells.length === max(1, floor(n))` y, salvo entradas
 * invalidas, las celdas no se solapan y cubren cols*rows.
 *
 * @param {number} n - numero de piezas (se espera 1..12)
 * @returns {MosaicLayout}
 */
function getLayout(n) {
  let count = Math.floor(Number(n));
  if (!Number.isFinite(count) || count < 1) { count = 1; }
  if (count === 1) { return singleCellLayout(); }
  if (count <= 6) { return MOSAIC_LAYOUTS[count]; }
  return generateFallbackLayout(count);
}

/* ─────────────────────────────────────────────────────────────
   MATEMATICA PURA DE INDICE (tarea 3.1)
   Aritmetica de modulo "segura": el resultado siempre cae en
   [0, n) para CUALQUIER entrada entera (negativa o >= n), de modo
   que el indice de la Pieza_Enfocada nunca se sale de rango y el
   avance/retroceso del foco hace wrap de forma determinista.
   Funciones puras, sin DOM ni estado.
   ───────────────────────────────────────────────────────────── */

/**
 * Normaliza un indice arbitrario al rango [0, n) mediante modulo seguro.
 * Usa `((i % n) + n) % n` para que las entradas negativas o >= n hagan
 * wrap correctamente (p. ej. normalizeIndex(-1, 5) === 4).
 * Defensa: si `i` no es entero se aplica `Math.floor`; si `n` no es un
 * entero finito >= 1 (n <= 0, NaN, Infinity...) se devuelve 0 como
 * fallback determinista y seguro.
 * @param {number} i - indice de entrada (cualquier entero; se redondea hacia abajo si no lo es)
 * @param {number} n - tamaño del conjunto (numero de Piezas); se espera entero >= 1
 * @returns {number} indice normalizado en [0, n), o 0 si n no es valido
 */
function normalizeIndex(i, n) {
  const size = Math.floor(Number(n));
  if (!Number.isFinite(size) || size < 1) { return 0; }
  let idx = Math.floor(Number(i));
  if (!Number.isFinite(idx)) { return 0; }
  return ((idx % size) + size) % size;
}

/**
 * Indice siguiente con wrap: avanza +1 modulo n.
 * nextIndex(n-1, n) === 0 (wrap hacia delante).
 * @param {number} i - indice actual (cualquier entero)
 * @param {number} n - tamaño del conjunto (>= 1)
 * @returns {number} indice siguiente en [0, n)
 */
function nextIndex(i, n) {
  return normalizeIndex(Math.floor(Number(i)) + 1, n);
}

/**
 * Indice anterior con wrap: retrocede -1 modulo n.
 * prevIndex(0, n) === n-1 (wrap hacia atras).
 * @param {number} i - indice actual (cualquier entero)
 * @param {number} n - tamaño del conjunto (>= 1)
 * @returns {number} indice anterior en [0, n)
 */
function prevIndex(i, n) {
  return normalizeIndex(Math.floor(Number(i)) - 1, n);
}

/**
 * Constantes de tiempo del mosaico (unica fuente de verdad).
 * Invariante: FOCUS_TRANS < DWELL y RESUME_DELAY > 0.
 * @type {Readonly<{DWELL:number, FOCUS_TRANS:number, RESUME_DELAY:number, STAGGER:number}>}
 */
const MOSAIC_TIMING = Object.freeze({
  DWELL: 3200,        // ms que una pieza permanece enfocada antes de derivar
  FOCUS_TRANS: 520,   // ms de la transicion de expansion (coincide con CSS)
  RESUME_DELAY: 900,  // ms de gracia tras mouseleave antes de reanudar AUTO
  STAGGER: 70         // ms de escalonado al construir tiles (entrada)
});

/* ─────────────────────────────────────────────────────────────
   REDUCTOR PURO DE ESTADO (tarea 3.3)
   Modela las transiciones de la Maquina de Estados de la
   interaccion como una funcion PURA: reduce(state, action) =>
   nuevo estado. SIN DOM, SIN timers, SIN Date. El scheduler y el
   controlador (tareas 7.x) cablearan estas transiciones a efectos
   reales (timers, render); aqui solo vive la logica de transicion.

   Decision de diseno — N EN EL ESTADO:
     El reductor necesita el numero de Piezas `n` para hacer wrap
     del indice. Se opta por GUARDAR `n` dentro del estado (lo mas
     simple): asi cualquier accion puede normalizar/avanzar el foco
     sin depender del payload. El estado devuelto conserva `n`.

   Forma del estado (la parte que gestiona el reductor):
     {
       focusIndex: number,        // 0..n-1 ; Pieza_Enfocada
       mode: MosaicMode,          // ver typedef MosaicMode
       pinned: boolean,           // fijado por click/Enter/Space
       panelVisible: boolean,     // del IntersectionObserver
       docVisible: boolean,       // de Page Visibility
       reducedMotion: boolean,    // snapshot de prefers-reduced-motion
       n: number                  // numero de Piezas (para el wrap)
     }

   Politica de modo (INVARIANTE central, Requirement 6.2):
     mode === 'AUTO'  SII  panelVisible ∧ docVisible ∧ ¬reducedMotion ∧ ¬pinned.
   Se expresa con el predicado canAuto(s) y con recomputeMode(s),
   que decide el modo "en reposo" tras un cambio de visibilidad /
   reduced-motion / pin o tras la gracia de reanudacion.
   ───────────────────────────────────────────────────────────── */

/**
 * @typedef {'AUTO'|'USER_FOCUS'|'RESUMING'|'PAUSED_OFFSCREEN'|'PAUSED_HIDDEN'|'STATIC_RM'} MosaicMode
 *
 * Estado gestionado por el reductor.
 * @typedef {Object} MosaicReducerState
 * @property {number}     focusIndex
 * @property {MosaicMode} mode
 * @property {boolean}    pinned
 * @property {boolean}    panelVisible
 * @property {boolean}    docVisible
 * @property {boolean}    reducedMotion
 * @property {number}     n
 *
 * Accion del reductor.
 * @typedef {Object} MosaicAction
 * @property {'drift'|'hover'|'focus'|'key'|'click'|'mouseleave'|'blur'|'resume'|'offscreen'|'onscreen'|'hide'|'show'|'setRM'} type
 * @property {number}  [index]  - indice solicitado (hover/focus/click/key resuelto por el caller)
 * @property {'next'|'prev'} [dir] - direccion para `key` (ArrowRight/ArrowLeft) si no se da `index`
 * @property {boolean} [value]  - nuevo valor booleano para `setRM`
 */

/**
 * Predicado de la politica de modo automatico.
 * El Modo AUTO solo es alcanzable cuando se cumplen TODAS las condiciones.
 * @param {MosaicReducerState} s
 * @returns {boolean} true sii panelVisible ∧ docVisible ∧ ¬reducedMotion ∧ ¬pinned
 */
function canAuto(s) {
  return !!s.panelVisible && !!s.docVisible && !s.reducedMotion && !s.pinned;
}

/**
 * Decide el Modo "en reposo" a partir de los flags del estado. Es la regla de
 * recomputo compartida por las transiciones que restauran o cambian las
 * condiciones (onscreen/show/setRM/resume). Prioridad (de mayor a menor):
 *   1. ¬panelVisible            -> 'PAUSED_OFFSCREEN' (panel fuera de viewport)
 *   2. ¬docVisible              -> 'PAUSED_HIDDEN'    (pestaña/documento oculto)
 *   3. reducedMotion            -> 'STATIC_RM'        (sin deriva ni autoplay)
 *   4. pinned                   -> 'USER_FOCUS'       (fijado, ignora reanudacion)
 *   5. resto (== canAuto)       -> 'AUTO'
 * Garantiza el invariante: devuelve 'AUTO' EXACTAMENTE cuando canAuto(s) es true.
 * @param {MosaicReducerState} s
 * @returns {MosaicMode}
 */
function recomputeMode(s) {
  if (!s.panelVisible) { return 'PAUSED_OFFSCREEN'; }
  if (!s.docVisible) { return 'PAUSED_HIDDEN'; }
  if (s.reducedMotion) { return 'STATIC_RM'; }
  if (s.pinned) { return 'USER_FOCUS'; }
  return 'AUTO';
}

/**
 * Reductor PURO de la maquina de estados del mosaico. Devuelve SIEMPRE un
 * objeto de estado NUEVO (no muta la entrada); en los casos no-op devuelve el
 * mismo `state` recibido (sin cambios observables).
 *
 * Semantica por tipo de accion:
 *  - `drift`  (tick auto): si mode==='AUTO' avanza focusIndex (+1 wrap); en otro
 *             caso es NO-OP (Property 4 / Req 2.4). Al recorrer en AUTO, n drifts
 *             visitan cada Pieza una vez antes de repetir (Req 2.6).
 *  - `hover` / `focus` (index): focusIndex = normalize(index); mode='USER_FOCUS';
 *             pinned sin cambios. Incluso con reducedMotion el control manual fija
 *             el foco y el modo pasa a USER_FOCUS (Req 3.1 / Property 5).
 *  - `key`    (index ya resuelto, o dir 'next'/'prev'): mueve el foco con wrap;
 *             mode='USER_FOCUS'. Si se da `index` se normaliza; si se da `dir` se
 *             usa nextIndex/prevIndex; si no hay ninguno, conserva el foco actual.
 *  - `click`  (index): focusIndex = normalize(index); TOGGLE de pin:
 *             pinned = (focusIndex previo === index normalizado) ? !pinned : true;
 *             mode='USER_FOCUS' (Req 3.6).
 *  - `mouseleave` / `blur`: si pinned, permanece en 'USER_FOCUS' (el pin ignora la
 *             reanudacion); si no, transiciona a 'RESUMING' (la cuenta atras la
 *             gestiona el scheduler, no el reductor). focusIndex sin cambios.
 *  - `resume` (gracia transcurrida): recomputeMode(state) -> 'AUTO' si canAuto,
 *             si no el modo en reposo apropiado (STATIC_RM / USER_FOCUS / PAUSED_*).
 *  - `offscreen`: panelVisible=false; mode='PAUSED_OFFSCREEN'.
 *  - `onscreen` : panelVisible=true ; mode=recomputeMode (respeta docVisible/RM/pin).
 *  - `hide`     : docVisible=false; mode='PAUSED_HIDDEN'.
 *  - `show`     : docVisible=true ; mode=recomputeMode (respeta panelVisible/RM/pin).
 *  - `setRM`    : reducedMotion=value; mode=recomputeMode (STATIC_RM si value, etc.).
 *
 * Invariantes garantizados sobre el estado devuelto:
 *  - 0 ≤ focusIndex < n  (se reutiliza normalizeIndex/nextIndex/prevIndex).
 *  - mode === 'AUTO'  =>  canAuto(estado) (la politica de modo nunca se viola).
 *
 * @param {MosaicReducerState} state
 * @param {MosaicAction} action
 * @returns {MosaicReducerState} nuevo estado (o el mismo si la accion es no-op)
 */
function reduce(state, action) {
  const n = state.n;
  const type = action && action.type;

  switch (type) {
    case 'drift': {
      // Tick de la deriva automatica: solo avanza el foco en modo AUTO.
      if (state.mode !== 'AUTO') { return state; }            // no-op (Property 4 / Req 2.4)
      return Object.assign({}, state, { focusIndex: nextIndex(state.focusIndex, n) });
    }

    case 'hover':
    case 'focus': {
      // Control manual: fija el foco solicitado y pausa la deriva (USER_FOCUS).
      return Object.assign({}, state, {
        focusIndex: normalizeIndex(action.index, n),
        mode: 'USER_FOCUS'
      });
    }

    case 'key': {
      // Teclado: avance/retroceso con wrap (dir) o indice ya resuelto (index).
      let idx;
      if (action.dir === 'next') { idx = nextIndex(state.focusIndex, n); }
      else if (action.dir === 'prev') { idx = prevIndex(state.focusIndex, n); }
      else if (action.index != null) { idx = normalizeIndex(action.index, n); }
      else { idx = normalizeIndex(state.focusIndex, n); }
      return Object.assign({}, state, { focusIndex: idx, mode: 'USER_FOCUS' });
    }

    case 'click': {
      // Toggle de pin: re-click sobre la MISMA Pieza des-fija; otra Pieza fija.
      const idx = normalizeIndex(action.index, n);
      const pinned = (state.focusIndex === idx) ? !state.pinned : true;
      return Object.assign({}, state, { focusIndex: idx, pinned: pinned, mode: 'USER_FOCUS' });
    }

    case 'mouseleave':
    case 'blur': {
      // Salida del usuario: el pin ignora la reanudacion (queda en USER_FOCUS);
      // si no esta fijado, entra en la gracia de reanudacion (RESUMING).
      const mode = state.pinned ? 'USER_FOCUS' : 'RESUMING';
      if (mode === state.mode) { return state; }
      return Object.assign({}, state, { mode: mode });
    }

    case 'resume': {
      // Gracia transcurrida: vuelve a AUTO si procede, si no, modo en reposo.
      return Object.assign({}, state, { mode: recomputeMode(state) });
    }

    case 'offscreen': {
      const next = Object.assign({}, state, { panelVisible: false, mode: 'PAUSED_OFFSCREEN' });
      return next;
    }

    case 'onscreen': {
      const next = Object.assign({}, state, { panelVisible: true });
      next.mode = recomputeMode(next);
      return next;
    }

    case 'hide': {
      const next = Object.assign({}, state, { docVisible: false, mode: 'PAUSED_HIDDEN' });
      return next;
    }

    case 'show': {
      const next = Object.assign({}, state, { docVisible: true });
      next.mode = recomputeMode(next);
      return next;
    }

    case 'setRM': {
      const next = Object.assign({}, state, { reducedMotion: !!action.value });
      next.mode = recomputeMode(next);
      return next;
    }

    default:
      // Accion desconocida: no-op (estado inalterado).
      return state;
  }
}

/**
 * Calcula el array de clases de las Piezas para un foco dado. Devuelve un array
 * de longitud `n` donde la Pieza en normalizeIndex(focusIndex, n) lleva
 * 'is-focus' y TODAS las demas 'is-ambient'. Para n<=0 devuelve [].
 *
 * Invariante (Property 1 / Req 1.2): para n>=1 hay EXACTAMENTE un 'is-focus'.
 *
 * @param {number} n - numero de Piezas
 * @param {number} focusIndex - indice de la Pieza_Enfocada (se normaliza con wrap)
 * @returns {string[]} clases por Pieza, en orden de indice
 */
function computeFocusClasses(n, focusIndex) {
  const size = Math.floor(Number(n));
  if (!Number.isFinite(size) || size < 1) { return []; }
  const focus = normalizeIndex(focusIndex, size);
  const out = new Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = (i === focus) ? 'is-focus' : 'is-ambient';
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────
   PLAN PURO DE TILES + CONSTRUCCION DEL DOM (tarea 6.1)
   -------------------------------------------------------------
   `planMosaic(items, layout)` es la base PURA y determinista de la
   construccion (y, por tanto, de la idempotencia de hidratacion,
   Property 11 / Req 8.2): a partir de los medios y la geometria
   produce una lista de descriptores de tile, SIN tocar el DOM y SIN
   efectos secundarios (NO hace console.warn). Para no perder la
   informacion de los medios omitidos por falta de `src` (Req 8.6),
   devuelve TAMBIEN la lista `skipped`, de modo que el consumidor con
   DOM (`buildMosaic`) sea el unico que registre la advertencia.

   Contrato de planMosaic:
     planMosaic(items, layout) -> { tiles: TileDescriptor[], skipped: SkippedItem[] }
     - `tiles`   : un descriptor por cada medio VALIDO (con `src` no
                   vacio), en el mismo orden del manifiesto. El medio
                   valido en la posicion p se empareja con `layout.cells[p]`
                   (Req 1.1). El descriptor 0 lleva 'is-focus' y el resto
                   'is-ambient' (Req 1.2), via computeFocusClasses.
     - `skipped` : un registro {index, item} por cada medio omitido por
                   carecer de `src` no vacio (Req 8.6).
   La funcion es determinista: para los mismos (items, layout) devuelve
   siempre los mismos descriptores (base de la hidratacion idempotente).

   `buildMosaic(vis, items, layout, opts)` construye el DOM dentro de
   `vis` (.proj-vis) a partir del plan: un <button.mosaic-tile> por tile,
   inyecta las custom props de celda (--col/--col-span/--row/--row-span),
   el .mosaic-readout, el .mosaic-modedot y la region aria-live. El medio
   del indice 0 carga con `src`; los ambientales difieren con `data-src`
   (Req 5.2). Registra console.warn por cada medio omitido (Req 8.6).
   Devuelve { mosaic, tiles, readout, modedot, live } o null si no hay DOM
   disponible o no queda ningun medio valido.
   ───────────────────────────────────────────────────────────── */

/**
 * Descriptor PURO de una Pieza del mosaico (sin DOM). Es la unidad que
 * `buildMosaic` materializa como <button class="mosaic-tile">.
 * @typedef {Object} TileDescriptor
 * @property {number}  idx        - posicion de la Pieza en el mosaico (0-based) == data-idx
 * @property {number}  srcIndex   - indice original del medio en `items` (trazabilidad)
 * @property {('image'|'gif'|'video')} type - tipo de medio (normalizado a 'image' si desconocido)
 * @property {string}  src        - ruta del medio real (item.src)
 * @property {string}  [poster]   - poster del video (si type==='video' y existe)
 * @property {string}  imgSrc     - fuente que usa el <img> del tile: poster para 'video', si no `src`
 * @property {string}  [focus]    - object-position de interes sugerido (si lo declara el manifiesto)
 * @property {string}  [captionEs]- caption en espanol (si existe; planMosaic NO resuelve idioma)
 * @property {string}  [captionEn]- caption en ingles (si existe)
 * @property {?{col:number,colSpan:number,row:number,rowSpan:number,featured:boolean}} cell
 *                                - celda de rejilla emparejada (o null si la plantilla no la define)
 * @property {string[]} classes   - clase de foco del tile: ['is-focus'] o ['is-ambient']
 *
 * @typedef {Object} SkippedItem
 * @property {number} index - indice del medio omitido en `items`
 * @property {*}      item  - el medio omitido (para diagnostico)
 *
 * @typedef {Object} MosaicPlan
 * @property {TileDescriptor[]} tiles
 * @property {SkippedItem[]}    skipped
 */

/** Normaliza un tipo de medio arbitrario a uno conocido (fallback 'image'). */
function normalizeMediaType(type) {
  return (type === 'gif' || type === 'video') ? type : 'image';
}

/** True si un medio tiene un `src` string no vacio (Req 8.6 / 5.1). */
function hasValidSrc(item) {
  return !!item && typeof item.src === 'string' && item.src.trim() !== '';
}

/**
 * Construye el plan PURO de tiles a partir de los medios y la geometria.
 * Determinista y sin efectos secundarios (no escribe en consola ni DOM).
 *
 * Empareja cada medio VALIDO (en orden) con `layout.cells[p]` por posicion;
 * los medios sin `src` se omiten y se acumulan en `skipped`. El primer tile
 * valido recibe 'is-focus' y el resto 'is-ambient' (computeFocusClasses).
 *
 * @param {import('./media-manifest.js').MediaItem[]} items - medios del manifiesto (en orden)
 * @param {MosaicLayout} layout - geometria; se asume `layout.cells.length === nº de medios validos`
 * @returns {MosaicPlan} { tiles, skipped }
 */
function planMosaic(items, layout) {
  const list = Array.isArray(items) ? items : [];
  const cells = (layout && Array.isArray(layout.cells)) ? layout.cells : [];

  /** @type {Array<{item:*, srcIndex:number}>} */
  const valid = [];
  /** @type {SkippedItem[]} */
  const skipped = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (hasValidSrc(item)) { valid.push({ item: item, srcIndex: i }); }
    else { skipped.push({ index: i, item: item }); }
  }

  const classes = computeFocusClasses(valid.length, 0);

  /** @type {TileDescriptor[]} */
  const tiles = valid.map(function (entry, p) {
    const item = entry.item;
    const type = normalizeMediaType(item.type);
    const poster = (typeof item.poster === 'string' && item.poster.trim() !== '') ? item.poster : undefined;
    const imgSrc = (type === 'video') ? (poster || '') : item.src;
    const cell = cells[p]
      ? { col: cells[p].col, colSpan: cells[p].colSpan, row: cells[p].row, rowSpan: cells[p].rowSpan, featured: !!cells[p].featured }
      : null;
    return {
      idx: p,
      srcIndex: entry.srcIndex,
      type: type,
      src: item.src,
      poster: poster,
      imgSrc: imgSrc,
      focus: (typeof item.focus === 'string' && item.focus.trim() !== '') ? item.focus : undefined,
      captionEs: item.captionEs,
      captionEn: item.captionEn,
      cell: cell,
      classes: [classes[p]]
    };
  });

  return { tiles: tiles, skipped: skipped };
}

/* Helpers de presentacion compartidos por buildMosaic ───────────── */

/** Rellena un numero a 2 digitos (p. ej. 1 -> "01"). */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Etiqueta corta del tipo para el lector HUD .mo-type (IMG/GIF/VID). */
function typeLabel(type) {
  if (type === 'gif') { return 'GIF'; }
  if (type === 'video') { return 'VID'; }
  return 'IMG';
}

/** Texto del badge para video/gif (▶ GIF / ▶ VID); '' para imagen. */
function badgeText(type) {
  if (type === 'gif') { return '\u25B6 GIF'; }
  if (type === 'video') { return '\u25B6 VID'; }
  return '';
}

/**
 * Calcula la escala de expansion de la Pieza_Enfocada en funcion del tamaño
 * relativo de su celda dentro de la rejilla densa. Las celdas PEQUEÑAS reciben
 * un impulso mayor (para que la imagen enfocada alcance siempre un tamaño
 * destacado), mientras que la celda "featured" (grande) crece de forma suave.
 *
 * scale = clamp(MIN, K / sqrt(areaRelativa), MAX), con areaRelativa ∈ (0,1].
 * Para la rejilla 6x6: featured 4x4 (~1.12), mediana 2x3 (~1.22), pequeña
 * 2x2 (~1.5). La escala se aplica por compositor (transform), sin reflow.
 *
 * @param {?{colSpan:number,rowSpan:number}} cell
 * @param {number} cols
 * @param {number} rows
 * @returns {number} factor de escala de foco (1.12 .. 1.55)
 */
function computeFocusScale(cell, cols, rows) {
  const MIN = 1.12;
  const MAX = 1.55;
  const K = 0.5;
  if (!cell || !cols || !rows) { return 1.3; }
  const area = (cell.colSpan * cell.rowSpan) / (cols * rows);
  if (!(area > 0)) { return 1.3; }
  const raw = K / Math.sqrt(area);
  const s = Math.max(MIN, Math.min(MAX, raw));
  return Math.round(s * 1000) / 1000;
}

/**
 * Resuelve el texto alternativo de un tile (Req 7.7): caption del idioma
 * activo o, en su ausencia, fallback generico `"{proj} · {NN}"` con NN
 * basado en 1 y rellenado a dos digitos.
 * @param {TileDescriptor} d
 * @param {string} proj - identificador de proyecto (data-proj)
 * @param {string} lang - 'es' | 'en'
 * @returns {string} texto alternativo no vacio
 */
function resolveAlt(d, proj, lang) {
  const caption = (lang === 'en') ? d.captionEn : d.captionEs;
  if (typeof caption === 'string' && caption.trim() !== '') { return caption; }
  return (proj || 'media') + ' \u00B7 ' + pad2(d.idx + 1);
}

/**
 * Elimina cualquier mosaico previo (y sus elementos hermanos HUD) dentro de
 * `vis`. Soporta una re-hidratacion idempotente: `buildMosaic` reconstruye
 * desde cero, de modo que invocarlo k>=1 veces produce el mismo DOM sin
 * acumular tiles, readouts, modedots ni regiones live.
 * @param {Element} vis
 */
function clearMosaicDom(vis) {
  const selectors = ['.proj-mosaic', '.mosaic-readout', '.mosaic-modedot', '.mosaic-live'];
  selectors.forEach(function (sel) {
    const nodes = vis.querySelectorAll ? vis.querySelectorAll(sel) : [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node && node.parentNode) { node.parentNode.removeChild(node); }
    }
  });
}

/**
 * @typedef {Object} MosaicDom
 * @property {HTMLElement} mosaic   - contenedor .proj-mosaic[data-mosaic]
 * @property {HTMLButtonElement[]} tiles - botones .mosaic-tile en orden
 * @property {HTMLElement} readout  - .mosaic-readout (HUD indice/total/tipo)
 * @property {HTMLElement} modedot  - .mosaic-modedot[data-mode]
 * @property {HTMLElement} live     - .mosaic-live[aria-live=polite]
 */

/**
 * Construye el DOM del mosaico dentro de `vis` a partir de `items`+`layout`.
 * Mejora progresiva: emite <button> nativos (Req 8.1) y deja el indice 0
 * cargado y el resto diferido (Req 5.2). Omite medios sin `src`, registrando
 * un `console.warn` por cada uno (Req 8.6), y construye con los validos.
 *
 * Es seguro en entornos sin DOM (Node/pruebas): devuelve `null` si no existe
 * `document`. Tambien devuelve `null` si `vis` es nulo o si no queda ningun
 * medio valido. Para soportar re-hidratacion idempotente, limpia cualquier
 * mosaico previo dentro de `vis` antes de reconstruir.
 *
 * @param {Element} vis - contenedor .proj-vis del panel
 * @param {import('./media-manifest.js').MediaItem[]} items - medios del manifiesto
 * @param {MosaicLayout} layout - geometria (normalmente getLayout(nº validos))
 * @param {{proj?:string, lang?:string, groupLabel?:string}} [opts] - overrides robustos:
 *        proj/lang (si no, se leen de vis.closest('[data-proj]') y documentElement.dataset.lang)
 * @returns {MosaicDom|null}
 */
function buildMosaic(vis, items, layout, opts) {
  if (typeof document === 'undefined') { return null; }
  if (!vis) { return null; }
  opts = opts || {};

  const plan = planMosaic(items, layout);

  // Req 8.6: advertir (una vez por medio) de los omitidos por falta de src.
  plan.skipped.forEach(function (s) {
    console.warn('[media-mosaic] medio omitido por falta de "src" (indice ' + s.index + ')', s.item);
  });

  if (plan.tiles.length === 0) { return null; }

  // Resolucion robusta de proyecto e idioma.
  const panel = (typeof vis.closest === 'function') ? vis.closest('[data-proj]') : null;
  const proj = opts.proj
    || (panel && panel.dataset && panel.dataset.proj)
    || '';
  const docEl = document.documentElement;
  const lang = opts.lang
    || (docEl && docEl.dataset && docEl.dataset.lang)
    || 'es';

  // Re-hidratacion idempotente: descartar cualquier mosaico previo.
  clearMosaicDom(vis);

  // Contenedor .proj-mosaic
  const mosaic = document.createElement('div');
  mosaic.className = 'proj-mosaic';
  mosaic.setAttribute('data-mosaic', '');
  mosaic.setAttribute('data-count', String(plan.tiles.length));
  mosaic.setAttribute('role', 'group');
  mosaic.setAttribute('aria-label', opts.groupLabel || 'Galer\u00EDa del proyecto');
  mosaic.setAttribute('aria-roledescription', 'mosaico de medios');

  /** @type {HTMLButtonElement[]} */
  const tiles = plan.tiles.map(function (d) {
    const isFocus = d.classes[0] === 'is-focus';

    const btn = document.createElement('button');
    btn.className = 'mosaic-tile ' + (d.classes[0] || 'is-ambient');
    btn.type = 'button';
    btn.setAttribute('data-idx', String(d.idx));
    btn.setAttribute('data-type', d.type);
    btn.setAttribute('aria-pressed', isFocus ? 'true' : 'false');

    // Geometria por custom properties (sin selectores por indice en CSS).
    if (d.cell) {
      btn.style.setProperty('--col', String(d.cell.col));
      btn.style.setProperty('--col-span', String(d.cell.colSpan));
      btn.style.setProperty('--row', String(d.cell.row));
      btn.style.setProperty('--row-span', String(d.cell.rowSpan));
      // Escala de expansion adaptada al tamaño de la celda: las piezas pequeñas
      // crecen mas al enfocarse para que la imagen enfocada siempre destaque.
      const cols = (layout && layout.cols) || 6;
      const rows = (layout && layout.rows) || 6;
      btn.style.setProperty('--focus-scale', String(computeFocusScale(d.cell, cols, rows)));
      // Origen de la expansion hacia el centro de la rejilla, para que la pieza
      // crezca "hacia dentro" y no se salga por el borde del area visual.
      const cx = (d.cell.col - 1 + d.cell.colSpan / 2) / cols;       // 0..1
      const cy = (d.cell.row - 1 + d.cell.rowSpan / 2) / rows;       // 0..1
      const ox = cx < 0.34 ? 'left' : (cx > 0.66 ? 'right' : 'center');
      const oy = cy < 0.34 ? 'top' : (cy > 0.66 ? 'bottom' : 'center');
      btn.style.setProperty('--focus-origin', ox + ' ' + oy);
    }

    // Medio: <img>. El indice 0 carga con `src` (+ .loaded para visibilidad
    // inmediata, coherente con el markup estatico); los ambientales difieren
    // con `data-src` y loading="lazy" (Req 5.2). El <video>/GIF real lo
    // gestiona el MediaLoader al enfocar (tarea 9).
    const img = document.createElement('img');
    img.className = isFocus ? 'mosaic-media loaded' : 'mosaic-media';
    img.setAttribute('loading', 'lazy');
    img.setAttribute('alt', resolveAlt(d, proj, lang));
    if (d.imgSrc) {
      img.setAttribute(isFocus ? 'src' : 'data-src', d.imgSrc);
    }
    btn.appendChild(img);

    // Badge de tipo para gif/video.
    if (d.type === 'gif' || d.type === 'video') {
      const badge = document.createElement('span');
      badge.className = 'mosaic-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = badgeText(d.type);
      btn.appendChild(badge);
    }

    mosaic.appendChild(btn);
    return btn;
  });

  // Lector HUD .mosaic-readout (indice 01 / total / tipo del foco inicial).
  const readout = document.createElement('div');
  readout.className = 'mosaic-readout';
  readout.setAttribute('aria-hidden', 'true');
  const moIdx = document.createElement('span'); moIdx.className = 'mo-idx'; moIdx.textContent = '01';
  const moSep = document.createElement('span'); moSep.className = 'mo-sep'; moSep.textContent = '/';
  const moTotal = document.createElement('span'); moTotal.className = 'mo-total'; moTotal.textContent = pad2(plan.tiles.length);
  const moType = document.createElement('span'); moType.className = 'mo-type'; moType.textContent = typeLabel(plan.tiles[0].type);
  readout.appendChild(moIdx);
  readout.appendChild(moSep);
  readout.appendChild(moTotal);
  readout.appendChild(moType);

  // Indicador de modo (auto/pausa).
  const modedot = document.createElement('span');
  modedot.className = 'mosaic-modedot';
  modedot.setAttribute('aria-hidden', 'true');
  modedot.setAttribute('data-mode', 'auto');

  // Region viva para lectores de pantalla (Req 7.5).
  const live = document.createElement('p');
  live.className = 'mosaic-live sr-only';
  live.setAttribute('aria-live', 'polite');

  vis.appendChild(mosaic);
  vis.appendChild(readout);
  vis.appendChild(modedot);
  vis.appendChild(live);

  return { mosaic: mosaic, tiles: tiles, readout: readout, modedot: modedot, live: live };
}

/* ═════════════════════════════════════════════════════════════
   CAPA DE RUNTIME (tareas 6.2, 7.1, 7.2, 8.1, 9.1, 9.2, 11.1,
   11.2, 12.1, 12.2)
   -------------------------------------------------------------
   Todo lo que sigue es codigo de DOM/timers/observers. Esta
   GUARDADO para que el modulo siga cargando bajo `node --test`
   (las pruebas hacen require de este archivo): las funciones que
   tocan el DOM comprueban `typeof document === 'undefined'` y
   devuelven null/no-op; NADA se ejecuta al cargar el modulo (solo
   se definen funciones). El cableado real ocurre cuando el boot de
   ui.js invoca initMediaMosaic(panel) en el navegador.

   Reutiliza la logica pura ya definida arriba (reduce,
   computeFocusClasses, canAuto, recomputeMode, normalizeIndex/
   nextIndex/prevIndex, planMosaic, buildMosaic, MOSAIC_TIMING,
   normalizeMediaType, hasValidSrc, pad2, typeLabel, resolveAlt).
   ═════════════════════════════════════════════════════════════ */

/* ── Utilidades de entorno (node-safe) ───────────────────────── */

/** Devuelve la funcion matchMedia disponible, o null fuera de navegador. */
function getMatchMedia() {
  if (typeof matchMedia !== 'undefined') { return matchMedia; }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia.bind(window);
  }
  return null;
}

/** Lee el snapshot actual de prefers-reduced-motion (false si no hay soporte). */
function readReducedMotion() {
  try {
    const mm = getMatchMedia();
    if (mm) { const q = mm('(prefers-reduced-motion: reduce)'); return !!(q && q.matches); }
  } catch (e) { /* ignore */ }
  return false;
}

/** Idioma activo del documento ('es'|'en'); 'es' por defecto/fuera de navegador. */
function currentLang() {
  if (typeof document === 'undefined') { return 'es'; }
  const docEl = document.documentElement;
  return (docEl && docEl.dataset && docEl.dataset.lang) || 'es';
}

/**
 * Resuelve el manifiesto de un proyecto de forma segura tanto en navegador
 * (getManifest/PROJECT_MEDIA son globales de media-manifest.js) como en Node
 * (donde no estan declarados). `typeof` sobre un identificador no declarado no
 * lanza, de modo que esto es seguro en ambos entornos.
 * @param {string} proj
 * @returns {Array}
 */
function safeGetManifest(proj) {
  try {
    if (typeof getManifest === 'function') { return getManifest(proj) || []; }
  } catch (e) { /* ignore */ }
  try {
    if (typeof PROJECT_MEDIA !== 'undefined' && PROJECT_MEDIA &&
        Object.prototype.hasOwnProperty.call(PROJECT_MEDIA, proj)) {
      return PROJECT_MEDIA[proj] || [];
    }
  } catch (e) { /* ignore */ }
  return [];
}

/** Palabra de tipo de medio para anuncios aria-live, segun idioma. */
function typeWordFor(type, lang) {
  if (lang === 'en') {
    if (type === 'gif') { return 'gif'; }
    if (type === 'video') { return 'video'; }
    return 'image';
  }
  if (type === 'gif') { return 'gif'; }
  if (type === 'video') { return 'v\u00EDdeo'; }
  return 'imagen';
}

/* ─────────────────────────────────────────────────────────────
   COMPONENTE 6: MediaLoader (tareas 9.1 y 9.2)
   -------------------------------------------------------------
   Carga perezosa idempotente (dataset.loaded), inyeccion de <video>
   y politica de reproduccion de un unico medio. Se crea por mosaico
   para poder rastrear y limpiar sus timeouts de carga en destroy().
   ───────────────────────────────────────────────────────────── */

/**
 * Asegura/recupera el <video> de un tile de tipo video, creandolo perezosamente
 * con los atributos seguros (muted/playsinline/loop/preload=none) y el poster
 * declarado (si falta, se confia en el fondo HUD del CSS, Req 5.9). Conserva el
 * <img> poster existente. Seguro fuera de navegador (devuelve null).
 * @param {Element} tile
 * @param {Object} item
 * @returns {HTMLVideoElement|null}
 */
function ensureVideoEl(tile, item) {
  if (typeof document === 'undefined' || !tile) { return null; }
  let v = (typeof tile.querySelector === 'function') ? tile.querySelector('video.mosaic-media') : null;
  if (v) { return v; }
  v = document.createElement('video');
  v.className = 'mosaic-media';
  v.muted = true;
  try { v.defaultMuted = true; } catch (e) { /* ignore */ }
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  try { v.playsInline = true; } catch (e) { /* ignore */ }
  v.loop = true;
  v.setAttribute('loop', '');
  v.setAttribute('preload', 'none');
  if (item && typeof item.poster === 'string' && item.poster.trim() !== '') {
    v.setAttribute('poster', item.poster);
  }
  tile.appendChild(v);
  return v;
}

/**
 * Crea un cargador de medios. Funciones:
 *  - ensureLoaded(tile, item): carga el medio del tile a lo sumo una vez (Req 5.4).
 *  - prefetch(tile, item)     : alias de ensureLoaded para la pieza siguiente (Req 5.3).
 *  - applyPlayback(tile, item, shouldPlay, reducedMotion): politica de reproduccion
 *                               de un unico medio (Req 5.6, 5.7, 5.10, 6.6).
 *  - dispose(): cancela cualquier timeout de carga pendiente (sin fugas).
 * @returns {{ensureLoaded:Function, prefetch:Function, applyPlayback:Function, dispose:Function}}
 */
function createMediaLoader() {
  /** @type {Set<*>} timeouts de carga (Req 5.8) pendientes; se limpian en dispose. */
  const loadTimers = new Set();
  /** @type {Array<{el:*,type:string,handler:Function}>} listeners de carga (load/error/loadeddata). */
  const mediaListeners = [];

  /** Registra un listener de medio rastreado (para retirarlo en dispose sin fugas). */
  function onMedia(el, type, handler) {
    if (!el || typeof el.addEventListener !== 'function') { return; }
    el.addEventListener(type, handler, { once: true });
    mediaListeners.push({ el: el, type: type, handler: handler });
  }

  function startTimeout(tile) {
    if (typeof setTimeout === 'undefined') { return null; }
    const id = setTimeout(function () {
      loadTimers.delete(id);
      // Timeout de 10 s sin cargar (Req 5.8): marcar error, sin reintentar.
      if (tile && tile.classList &&
          !tile.classList.contains('media-error') &&
          !tile.classList.contains('video-ready')) {
        const media = (typeof tile.querySelector === 'function') ? tile.querySelector('.mosaic-media') : null;
        const done = media && media.classList && media.classList.contains('loaded');
        if (!done) { tile.classList.add('media-error'); }
      }
    }, 10000);
    loadTimers.add(id);
    return id;
  }

  function clearTO(id) {
    if (id == null) { return; }
    if (loadTimers.has(id)) { loadTimers.delete(id); }
    if (typeof clearTimeout !== 'undefined') { clearTimeout(id); }
  }

  function ensureLoaded(tile, item) {
    if (!tile || !item) { return; }
    if (tile.dataset && tile.dataset.loaded === '1') { return; }
    const type = normalizeMediaType(item.type);

    if (type === 'image' || type === 'gif') {
      const img = (typeof tile.querySelector === 'function')
        ? (tile.querySelector('img.mosaic-media') || tile.querySelector('img'))
        : null;
      if (img) {
        const src = img.getAttribute('data-src') || item.src;
        const to = startTimeout(tile);
        onMedia(img, 'load', function () { clearTO(to); img.classList.add('loaded'); });
        onMedia(img, 'error', function () { clearTO(to); tile.classList.add('media-error'); });
        if (src) { img.setAttribute('src', src); img.removeAttribute('data-src'); }
        // Ya estaba decodificada (p. ej. el indice 0 que carga con `src` en buildMosaic).
        if (img.complete && img.naturalWidth > 0) { clearTO(to); img.classList.add('loaded'); }
      }
    } else if (type === 'video') {
      const v = ensureVideoEl(tile, item);
      if (v) {
        const to = startTimeout(tile);
        onMedia(v, 'loadeddata', function () {
          clearTO(to); tile.classList.add('video-ready'); v.classList.add('loaded');
        });
        onMedia(v, 'error', function () { clearTO(to); tile.classList.add('media-error'); });
        if (item.src) { v.setAttribute('src', item.src); }
      }
    }

    if (tile.dataset) { tile.dataset.loaded = '1'; }
  }

  function prefetch(tile, item) { ensureLoaded(tile, item); }

  /**
   * Precarga la IMAGEN ESTATICA de un tile (imagen, GIF o POSTER de video) de
   * inmediato, sin inyectar el <video> pesado (que se difiere al enfocar). Es
   * idempotente via `tile.dataset.stillLoaded`. Promueve `data-src` -> `src` y,
   * al cargar, añade la clase `.loaded` (necesaria: el medio es opacity:0 hasta
   * entonces). Asi NINGUN tile queda en blanco a la espera del foco/hover.
   *  - image/gif : esta ES la carga completa ⇒ marca tambien `dataset.loaded`.
   *  - video     : carga solo el poster <img>; NO marca `dataset.loaded`, de
   *                modo que al enfocar se inyecte el <video> real.
   * @param {Element} tile
   * @param {Object} item
   */
  function preloadStill(tile, item) {
    if (!tile || !item) { return; }
    if (tile.dataset && tile.dataset.stillLoaded === '1') { return; }
    const type = normalizeMediaType(item.type);
    const img = (typeof tile.querySelector === 'function')
      ? (tile.querySelector('img.mosaic-media') || tile.querySelector('img'))
      : null;
    if (img) {
      // Si ya esta decodificada (p. ej. el indice 0 que nace con `src`), basta
      // con marcar la clase de visibilidad.
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('loaded');
      } else {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        const to = startTimeout(tile);
        onMedia(img, 'load', function () { clearTO(to); img.classList.add('loaded'); });
        onMedia(img, 'error', function () { clearTO(to); tile.classList.add('media-error'); });
        if (src && !img.getAttribute('src')) { img.setAttribute('src', src); }
        img.removeAttribute('data-src');
      }
    }
    if (tile.dataset) {
      tile.dataset.stillLoaded = '1';
      // Para imagen/gif el still ES el medio definitivo: evita recargas posteriores.
      if (type === 'image' || type === 'gif') { tile.dataset.loaded = '1'; }
    }
  }

  function applyPlayback(tile, item, shouldPlay, reducedMotion) {
    if (!tile || !item) { return; }
    const type = normalizeMediaType(item.type);
    if (type === 'video') {
      let v = (typeof tile.querySelector === 'function') ? tile.querySelector('video') : null;
      if (!v) {
        if (shouldPlay && !reducedMotion) { ensureLoaded(tile, item); v = tile.querySelector('video'); }
        if (!v) { return; }
      }
      if (shouldPlay && !reducedMotion) {
        const p = (typeof v.play === 'function') ? v.play() : null;
        if (p && typeof p.catch === 'function') { p.catch(function () { /* autoplay bloqueado: queda poster */ }); }
      } else if (typeof v.pause === 'function') {
        v.pause();
      }
    } else if (type === 'gif') {
      // El GIF anima al cargar: solo se promueve su src cuando debe reproducirse.
      if (shouldPlay && !reducedMotion) { ensureLoaded(tile, item); }
    }
    // image: sin efecto de reproduccion.
  }

  function dispose() {
    loadTimers.forEach(function (id) { if (typeof clearTimeout !== 'undefined') { clearTimeout(id); } });
    loadTimers.clear();
    // Retirar los listeners de carga aun no disparados (evita fugas tras destroy).
    mediaListeners.forEach(function (l) {
      if (l.el && typeof l.el.removeEventListener === 'function') { l.el.removeEventListener(l.type, l.handler); }
    });
    mediaListeners.length = 0;
  }

  return { ensureLoaded: ensureLoaded, prefetch: prefetch, preloadStill: preloadStill, applyPlayback: applyPlayback, dispose: dispose };
}

/* ─────────────────────────────────────────────────────────────
   COMPONENTE 4: FocusScheduler (tarea 7.2)
   -------------------------------------------------------------
   Un unico setTimeout re-encadenado por mosaico (NUNCA setInterval).
   Temporiza la deriva (DWELL) y la reanudacion con gracia
   (resumeAfter). Acepta relojes inyectables (opts.setTimeout/
   opts.clearTimeout) para que las pruebas con reloj simulado (tarea
   7.3) puedan controlar el tiempo; por defecto usa los globales.
   ───────────────────────────────────────────────────────────── */

/**
 * @param {Object} ctrl - MosaicController (usa getMode/getFocus/getCount/canAuto/setFocus/_setMode)
 * @param {Object} [opts] - { dwell, resumeDelay, getReducedMotion, setTimeout, clearTimeout }
 * @returns {{start:Function, pause:Function, resumeAfter:Function, isRunning:Function, dispose:Function}}
 */
function createFocusScheduler(ctrl, opts) {
  opts = opts || {};
  const dwell = (opts.dwell != null) ? opts.dwell : MOSAIC_TIMING.DWELL;
  const defaultResume = (opts.resumeDelay != null) ? opts.resumeDelay : MOSAIC_TIMING.RESUME_DELAY;
  const getReducedMotion = (typeof opts.getReducedMotion === 'function')
    ? opts.getReducedMotion : function () { return false; };
  const _setTimeout = opts.setTimeout || ((typeof setTimeout !== 'undefined') ? setTimeout : null);
  const _clearTimeout = opts.clearTimeout || ((typeof clearTimeout !== 'undefined') ? clearTimeout : null);

  let driftTimer = null;
  let resumeTimer = null;
  let running = false;

  function clearDrift() { if (driftTimer != null && _clearTimeout) { _clearTimeout(driftTimer); } driftTimer = null; }
  function clearResume() { if (resumeTimer != null && _clearTimeout) { _clearTimeout(resumeTimer); } resumeTimer = null; }

  function armTimer() {
    if (!_setTimeout) { return; }
    clearDrift();
    driftTimer = _setTimeout(function () {
      driftTimer = null;
      // Solo deriva si seguimos en AUTO en el instante del disparo (Property 4).
      if (ctrl.getMode() === 'AUTO') {
        ctrl.setFocus(ctrl.getFocus() + 1, { source: 'auto' });
      }
      // Re-encadena un unico timer mientras siga activo (Req 6.4).
      if (running) { armTimer(); }
    }, dwell);
  }

  function start() {
    if (getReducedMotion()) { return; }          // nunca arranca con reduced motion (Req 7.1)
    if (ctrl.getCount() < 2) { return; }          // 1 medio: nada que derivar (Req 2.7)
    if (running) { return; }
    running = true;
    armTimer();
  }

  function pause() {
    running = false;
    clearDrift();
    clearResume();
  }

  function resumeAfter(ms) {
    if (!_setTimeout) { return; }
    clearResume();
    resumeTimer = _setTimeout(function () {
      resumeTimer = null;
      if (ctrl.canAuto()) { ctrl._setMode('AUTO'); start(); }
    }, (ms != null) ? ms : defaultResume);
  }

  function isRunning() { return running; }
  function dispose() { pause(); }

  return {
    start: start, pause: pause, resumeAfter: resumeAfter,
    isRunning: isRunning, dispose: dispose
  };
}

/* ─────────────────────────────────────────────────────────────
   COMPONENTE 5: VisibilityGate (tarea 8.1)
   -------------------------------------------------------------
   Unifica IntersectionObserver (panel dentro/fuera de viewport) y
   Page Visibility API (pestaña oculta). Emite onChange(panelVisible
   && docVisible) en cada cambio. dispose() desconecta el observer y
   retira el listener de visibilitychange (sin fugas, Req 8.4).
   ───────────────────────────────────────────────────────────── */

/**
 * @param {Element} panel
 * @param {(visible:boolean)=>void} onChange
 * @returns {{isPanelVisible:Function, isDocVisible:Function, dispose:Function}}
 */
function createVisibilityGate(panel, onChange) {
  if (typeof document === 'undefined') {
    return {
      isPanelVisible: function () { return false; },
      isDocVisible: function () { return true; },
      dispose: function () { /* no-op */ }
    };
  }

  let panelVisible = false;
  let docVisible = !document.hidden;
  let io = null;

  function emit() { if (typeof onChange === 'function') { onChange(panelVisible && docVisible); } }

  if (typeof IntersectionObserver !== 'undefined' && panel) {
    io = new IntersectionObserver(function (entries) {
      for (let i = 0; i < entries.length; i++) { panelVisible = entries[i].isIntersecting; }
      emit();
    }, { threshold: 0 });
    io.observe(panel);
  } else {
    // Sin soporte de IO: mejora progresiva, se asume visible.
    panelVisible = true;
  }

  function onVisChange() { docVisible = !document.hidden; emit(); }
  document.addEventListener('visibilitychange', onVisChange);

  return {
    isPanelVisible: function () { return panelVisible; },
    isDocVisible: function () { return docVisible; },
    dispose: function () {
      if (io) { io.disconnect(); io = null; }
      document.removeEventListener('visibilitychange', onVisChange);
    }
  };
}

/* ─────────────────────────────────────────────────────────────
   COMPONENTE 3: MosaicController (tareas 7.1, 11.1, 11.2, 12.1, 12.2)
   -------------------------------------------------------------
   Cablea el reductor puro al DOM: render (clases is-focus/is-ambient,
   aria-pressed, object-position, readout, modedot, aria-live), carga
   y reproduccion del medio, deriva automatica, control manual por
   hover/teclado, reactividad a reduced-motion, relabel y destroy.
   ───────────────────────────────────────────────────────────── */

/**
 * @param {Element} panel
 * @param {Element} vis
 * @param {MosaicDom} dom
 * @param {Array} items - SOLO medios validos, alineados 1:1 con dom.tiles
 * @param {string} proj
 * @param {MosaicReducerState} initialState
 * @returns {Object} MosaicController
 */
function createController(panel, vis, dom, items, proj, initialState) {
  let state = initialState;
  let scheduler = null;
  let gate = null;
  const loader = createMediaLoader();

  /** Listeners de DOM registrados (para destroy sin fugas). */
  let listeners = [];
  /** Timers transientes del controlador (barridos .just-focused). */
  const pendingTimers = new Set();
  /** matchMedia de reduced-motion + su listener (tarea 11.2). */
  let mql = null;
  let mqlHandler = null;
  let destroyed = false;

  function on(el, type, handler, opt) {
    if (!el || typeof el.addEventListener !== 'function') { return; }
    el.addEventListener(type, handler, opt);
    listeners.push({ el: el, type: type, handler: handler, opt: opt });
  }

  function scheduleTimer(fn, ms) {
    if (typeof setTimeout === 'undefined') { return null; }
    const id = setTimeout(function () { pendingTimers.delete(id); fn(); }, ms);
    pendingTimers.add(id);
    return id;
  }

  function clearAllTimers() {
    pendingTimers.forEach(function (id) { if (typeof clearTimeout !== 'undefined') { clearTimeout(id); } });
    pendingTimers.clear();
  }

  /* ── Helpers de DOM ───────────────────────────────────────── */

  function closestTile(node) {
    if (!node || typeof node.closest !== 'function') { return null; }
    const t = node.closest('.mosaic-tile');
    return (t && dom.mosaic && dom.mosaic.contains(t)) ? t : null;
  }

  function tileIndex(tile) { return dom.tiles.indexOf(tile); }

  function focusTile(idx) {
    const tile = dom.tiles[idx];
    if (tile && typeof tile.focus === 'function') { try { tile.focus(); } catch (e) { /* ignore */ } }
  }

  function applyFocusPos(tile, focus) {
    if (!tile || !tile.style) { return; }
    const pos = (typeof focus === 'string' && focus.trim() !== '') ? focus : '50% 50%'; // Req 4.6
    tile.style.setProperty('--focus-pos', pos);                                          // Req 4.4
  }

  function flashSweep(tile) {
    if (!tile || !tile.classList) { return; }
    tile.classList.add('just-focused');
    scheduleTimer(function () { tile.classList.remove('just-focused'); }, MOSAIC_TIMING.FOCUS_TRANS);
  }

  function updateReadout(idx) {
    if (!dom.readout || typeof dom.readout.querySelector !== 'function') { return; }
    const moIdx = dom.readout.querySelector('.mo-idx');
    const moType = dom.readout.querySelector('.mo-type');
    if (moIdx) { moIdx.textContent = pad2(idx + 1); }
    if (moType) { moType.textContent = typeLabel(normalizeMediaType(items[idx].type)); }
  }

  function setModeDot() {
    if (!dom.modedot) { return; }
    dom.modedot.setAttribute('data-mode', state.mode === 'AUTO' ? 'auto' : 'user');
  }

  function announce(idx) {
    if (!dom.live) { return; }
    const lang = currentLang();
    const word = typeWordFor(normalizeMediaType(items[idx].type), lang);
    const connector = (lang === 'en') ? ' of ' : ' de ';
    // Formato «{posición} de {total}» (1-based) + tipo (Req 7.5).
    dom.live.textContent = (idx + 1) + connector + state.n + ', ' + word;
  }

  function pauseAllMedia() {
    for (let k = 0; k < dom.tiles.length; k++) {
      loader.applyPlayback(dom.tiles[k], items[k], false, state.reducedMotion);
    }
  }

  /**
   * Precarga la imagen estatica de TODAS las Piezas (imagen/gif/poster) al
   * hidratar, para que ninguna quede en blanco a la espera del foco/hover.
   * El <video> pesado se sigue difiriendo hasta enfocar. `loading="lazy"` deja
   * que el navegador difiera por su cuenta las Piezas realmente fuera de vista.
   */
  function preloadStills() {
    for (let k = 0; k < dom.tiles.length; k++) {
      loader.preloadStill(dom.tiles[k], items[k]);
    }
  }

  /* ── Render (invariante: exactamente un is-focus) ─────────── */

  function render(prev, ropts) {
    ropts = ropts || {};
    const idx = state.focusIndex;
    const n = state.n;
    const visible = state.panelVisible && state.docVisible;
    const isNeutral = !!ropts.neutral;

    // 1. Clases + aria-pressed (Req 1.2, 7.4). Sin reflow: solo clases.
    for (let k = 0; k < dom.tiles.length; k++) {
      const tile = dom.tiles[k];
      const isFocus = !isNeutral && (k === idx);
      tile.classList.toggle('is-neutral', isNeutral);
      tile.classList.toggle('is-focus',   isFocus);
      tile.classList.toggle('is-ambient', !isNeutral && !isFocus);
      tile.setAttribute('aria-pressed', isFocus ? 'true' : 'false');
    }

    // 2. object-position de interes + barrido CRT breve (salvo reduced-motion,
    //    modo neutral o cuando se pide silencioso, p. ej. al deshacer el hover).
    if (!isNeutral) {
      applyFocusPos(dom.tiles[idx], items[idx] && items[idx].focus);
      if (prev !== idx && !state.reducedMotion && !ropts.noSweep) { flashSweep(dom.tiles[idx]); }
    }

    // 3. Carga del enfocado + prefetch del siguiente (Req 5.2, 5.3) y politica
    //    de reproduccion de un unico medio (Req 5.6, 5.7).
    if (!isNeutral) {
      loader.ensureLoaded(dom.tiles[idx], items[idx]);
      if (n > 1) {
        const nextI = nextIndex(idx, n);
        loader.prefetch(dom.tiles[nextI], items[nextI]);
      }
    }
    for (let m = 0; m < dom.tiles.length; m++) {
      const shouldPlay = !isNeutral && (m === idx) && visible;
      loader.applyPlayback(dom.tiles[m], items[m], shouldPlay, state.reducedMotion);
    }

    // 4. HUD + accesibilidad.
    if (!isNeutral) { updateReadout(idx); }
    setModeDot();
    if (!isNeutral) { announce(idx); }
  }

  /** Aplica el estado neutral: todas las piezas sin expansion ni atenuacion. */
  function renderNeutral() {
    render(state.focusIndex, { neutral: true });
  }

  /* ── setFocus: nucleo de la interaccion (tarea 7.1) ───────── */

  function setFocus(i, opts) {
    opts = opts || {};
    const source = opts.source;
    const n = state.n;
    if (n < 1) { return; }

    // (Property 4 / Req 2.4) un tick auto rezagado nunca pisa al usuario.
    if (source === 'auto' && state.mode !== 'AUTO') { return; }

    const prev = state.focusIndex;
    const idx = normalizeIndex(i, n);

    // Transicion de modo segun origen (delegada en el reductor puro).
    if (source === 'hover' || source === 'focus') {
      state = reduce(state, { type: source, index: idx });
      if (scheduler) { scheduler.pause(); }
    } else if (source === 'key') {
      state = reduce(state, { type: 'key', index: idx });
      if (scheduler) { scheduler.pause(); }
    } else if (source === 'click') {
      state = reduce(state, { type: 'click', index: idx });
      if (scheduler) { scheduler.pause(); }
    } else if (source === 'restore') {
      // Deshacer el hover: vuelve al estado neutral (sin ninguna pieza expandida).
      renderNeutral();
      return;
    } else {
      // 'auto' o 'init': solo mueve el foco; el modo lo gobierna _onVisibility/scheduler.
      state = Object.assign({}, state, { focusIndex: idx });
    }

    render(prev);
  }

  /* ── API publica de navegacion ────────────────────────────── */

  function getFocus() { return state.focusIndex; }
  function getMode() { return state.mode; }
  function getCount() { return state.n; }
  function getReducedMotion() { return state.reducedMotion; }
  function canAutoFn() { return canAuto(state); }
  function setMode(m) { state = Object.assign({}, state, { mode: m }); setModeDot(); }

  function next() {
    const idx = nextIndex(state.focusIndex, state.n);
    setFocus(idx, { source: 'key' });
    focusTile(idx);
  }
  function prev() {
    const idx = prevIndex(state.focusIndex, state.n);
    setFocus(idx, { source: 'key' });
    focusTile(idx);
  }

  function pause() {
    if (scheduler) { scheduler.pause(); }
    state = Object.assign({}, state, { mode: 'USER_FOCUS' });
    setModeDot();
  }
  function resume() {
    if (canAuto(state)) {
      state = Object.assign({}, state, { mode: 'AUTO' });
      if (scheduler) { scheduler.start(); }
      setModeDot();
    }
  }

  /* ── Visibilidad (tarea 8.1) ──────────────────────────────── */

  function _onVisibility(visible) {
    if (gate) {
      state = Object.assign({}, state, {
        panelVisible: gate.isPanelVisible(),
        docVisible: gate.isDocVisible()
      });
    }
    const isVisible = (typeof visible === 'boolean') ? visible : (state.panelVisible && state.docVisible);

    if (!isVisible) {
      state = Object.assign({}, state, { mode: state.docVisible ? 'PAUSED_OFFSCREEN' : 'PAUSED_HIDDEN' });
      if (scheduler) { scheduler.pause(); }
      pauseAllMedia();                                   // Req 6.6 / 5.10
    } else {
      if (state.reducedMotion) {
        state = Object.assign({}, state, { mode: 'STATIC_RM' });
      } else if (state.pinned) {
        state = Object.assign({}, state, { mode: 'USER_FOCUS' });
      } else {
        state = Object.assign({}, state, { mode: 'AUTO' });
        if (scheduler) { scheduler.start(); }            // Req 6.3
      }
      const idx = state.focusIndex;
      for (let k = 0; k < dom.tiles.length; k++) {
        loader.applyPlayback(dom.tiles[k], items[k], k === idx, state.reducedMotion);
      }
    }
    setModeDot();
  }

  /* ── Reactividad a prefers-reduced-motion (tarea 11.2) ────── */

  function bindReducedMotion() {
    const mm = getMatchMedia();
    if (!mm) { return; }
    try { mql = mm('(prefers-reduced-motion: reduce)'); } catch (e) { mql = null; }
    if (!mql) { return; }
    mqlHandler = function (e) {
      state = reduce(state, { type: 'setRM', value: !!e.matches });
      if (state.reducedMotion) {
        if (scheduler) { scheduler.pause(); }            // sin deriva ni autoplay (Req 7.1)
        pauseAllMedia();
        setModeDot();
      } else {
        _onVisibility(state.panelVisible && state.docVisible);  // re-evaluar deriva/playback
      }
    };
    if (typeof mql.addEventListener === 'function') { mql.addEventListener('change', mqlHandler); }
    else if (typeof mql.addListener === 'function') { mql.addListener(mqlHandler); }
  }

  /* ── Cableado de eventos hover/focus/click/teclado (tarea 11.1) ── */

  function _bind(sched, vgate) {
    scheduler = sched;
    gate = vgate;
    if (typeof document === 'undefined' || !dom.mosaic) { return; }

    const mosaic = dom.mosaic;
    let lastHover = -1;
    // Foco al que volver cuando el raton sale del mosaico (lo que habia ANTES
    // de empezar el hover): asi al salir se deshace la expansion del hover.
    let hoverReturnIndex = -1;

    // Hover: mouseover (burbujea) con guarda para no re-disparar en el mismo tile.
    on(mosaic, 'mouseover', function (e) {
      const tile = closestTile(e.target);
      if (!tile) { return; }
      const idx = tileIndex(tile);
      if (idx < 0) { return; }
      if (idx === lastHover && state.mode === 'USER_FOCUS') { return; }
      // Recordar el foco previo solo al INICIAR un hover (no en cada tile).
      if (lastHover === -1) { hoverReturnIndex = state.focusIndex; }
      lastHover = idx;
      setFocus(idx, { source: 'hover' });
    });

    // Foco de teclado entrando en una pieza.
    on(mosaic, 'focusin', function (e) {
      const tile = closestTile(e.target);
      if (!tile) { return; }
      setFocus(tileIndex(tile), { source: 'focus' });
    });

    // El cursor abandona el mosaico: se DESHACE el hover (vuelve al foco previo)
    // y, si no esta fijado, se programa la reanudacion con gracia (cancelable).
    on(mosaic, 'mouseleave', function () {
      lastHover = -1;
      if (state.pinned) { return; }
      // Restaurar el foco que habia antes del hover (deshace la expansion).
      if (hoverReturnIndex >= 0 && hoverReturnIndex !== state.focusIndex) {
        setFocus(hoverReturnIndex, { source: 'restore' });
      }
      hoverReturnIndex = -1;
      if (scheduler) {
        state = reduce(state, { type: 'mouseleave' });
        setModeDot();
        scheduler.resumeAfter(MOSAIC_TIMING.RESUME_DELAY);   // Req 3.4
      }
    });

    // El foco de teclado sale del mosaico (no a otra pieza interna).
    on(mosaic, 'focusout', function (e) {
      const to = e.relatedTarget;
      if (to && mosaic.contains(to)) { return; }
      if (!state.pinned && scheduler) {
        state = reduce(state, { type: 'blur' });
        setModeDot();
        scheduler.resumeAfter(MOSAIC_TIMING.RESUME_DELAY);
      }
    });

    // Click/Enter/Space (los <button> disparan 'click' con Enter/Space): toggle pin.
    on(mosaic, 'click', function (e) {
      const tile = closestTile(e.target);
      if (!tile) { return; }
      setFocus(tileIndex(tile), { source: 'click' });       // Req 3.6
      focusTile(state.focusIndex);
    });

    // ArrowRight/ArrowLeft: avance/retroceso con wrap + traslado del foco (Req 3.2/3.3).
    on(mosaic, 'keydown', function (e) {
      const key = e.key;
      if (key === 'ArrowRight' || key === 'Right') { e.preventDefault(); next(); }
      else if (key === 'ArrowLeft' || key === 'Left') { e.preventDefault(); prev(); }
    });

    bindReducedMotion();
  }

  /* ── relabel (tarea 12.1) ─────────────────────────────────── */

  function relabel() {
    const lang = currentLang();
    for (let k = 0; k < dom.tiles.length; k++) {
      const tile = dom.tiles[k];
      const alt = resolveAlt(
        { idx: k, captionEs: items[k].captionEs, captionEn: items[k].captionEn },
        proj, lang
      );
      const img = (typeof tile.querySelector === 'function')
        ? (tile.querySelector('img.mosaic-media') || tile.querySelector('img'))
        : null;
      if (img) { img.setAttribute('alt', alt); }   // textContent/atributos, sin innerHTML
    }
    announce(state.focusIndex);                     // anuncio en el nuevo idioma
  }

  /* ── destroy (tarea 12.2) ─────────────────────────────────── */

  function destroy() {
    if (destroyed) { return; }
    destroyed = true;

    if (scheduler) { scheduler.dispose(); }
    if (gate) { gate.dispose(); }

    // Retirar el listener de la media query de reduced-motion.
    if (mql && mqlHandler) {
      if (typeof mql.removeEventListener === 'function') { mql.removeEventListener('change', mqlHandler); }
      else if (typeof mql.removeListener === 'function') { mql.removeListener(mqlHandler); }
    }
    mql = null; mqlHandler = null;

    // Retirar todos los listeners de DOM registrados.
    listeners.forEach(function (l) {
      if (l.el && typeof l.el.removeEventListener === 'function') { l.el.removeEventListener(l.type, l.handler, l.opt); }
    });
    listeners = [];

    // Cancelar timers transientes y los del cargador.
    clearAllTimers();
    if (loader && loader.dispose) { loader.dispose(); }

    // Pausar cualquier video (estado permitido; no se reconstruye el DOM).
    for (let k = 0; k < dom.tiles.length; k++) {
      const v = (typeof dom.tiles[k].querySelector === 'function') ? dom.tiles[k].querySelector('video') : null;
      if (v && typeof v.pause === 'function') { v.pause(); }
    }

    // Permitir una posterior re-hidratacion del mismo panel.
    if (vis && vis.dataset) { delete vis.dataset.mosaicReady; }
    if (vis) { vis.__mosaicCtrl = null; }
    if (panel) { panel.__mosaicCtrl = null; }
  }

  return {
    // API publica (typedef MosaicController)
    setFocus: setFocus,
    getFocus: getFocus,
    next: next,
    prev: prev,
    pause: pause,
    resume: resume,
    getMode: getMode,
    relabel: relabel,
    destroy: destroy,
    // Auxiliares usados por scheduler/gate/init
    getCount: getCount,
    getReducedMotion: getReducedMotion,
    canAuto: canAutoFn,
    _setMode: setMode,
    _onVisibility: _onVisibility,
    _preloadStills: preloadStills,
    _renderNeutral: renderNeutral,
    _bind: _bind
  };
}

/* ─────────────────────────────────────────────────────────────
   initMediaMosaic (tarea 6.2): hidratacion idempotente del panel
   -------------------------------------------------------------
   Resuelve el manifiesto + layout, construye el mosaico (HYDRATE:
   buildMosaic limpia el markup estatico y reconstruye de forma
   determinista), crea controlador + scheduler + gate, cablea
   eventos, fija el foco inicial y arranca AUTO si procede.
   Devuelve null y conserva el markup base si no hay medios validos
   (Req 1.6 / 8.5). Idempotente via vis.dataset.mosaicReady (Req 8.2).
   Seguro fuera de navegador (devuelve null).
   ───────────────────────────────────────────────────────────── */

/**
 * @param {HTMLElement} panel - article.proj-panel
 * @returns {Object|null} MosaicController o null
 */
function initMediaMosaic(panel) {
  if (typeof document === 'undefined') { return null; }    // node-safe
  if (!panel || typeof panel.querySelector !== 'function') { return null; }

  const proj = (panel.dataset && panel.dataset.proj) || '';
  const items = safeGetManifest(proj);
  const vis = panel.querySelector('.proj-vis');

  // Sin .proj-vis o sin medios: no hidratar, conservar markup base (Req 1.6 / 8.5).
  if (!vis || !items || items.length === 0) { return null; }

  // Idempotencia (Req 8.2 / Property 11): reutilizar el controlador existente.
  if (vis.dataset && vis.dataset.mosaicReady === '1' && vis.__mosaicCtrl) {
    return vis.__mosaicCtrl;
  }

  // Solo los medios validos generan Pieza; el layout debe dimensionarse a ese
  // recuento porque planMosaic empareja cada medio valido con layout.cells[p].
  const validItems = items.filter(hasValidSrc);
  if (validItems.length === 0) { return null; }

  const layout = getLayout(validItems.length);
  const dom = buildMosaic(vis, items, layout, { proj: proj });
  if (!dom) { return null; }

  const state = {
    focusIndex: 0,
    mode: 'BOOTING',
    pinned: false,
    panelVisible: false,
    docVisible: (typeof document !== 'undefined') ? !document.hidden : true,
    reducedMotion: readReducedMotion(),
    n: dom.tiles.length
  };

  const ctrl = createController(panel, vis, dom, validItems, proj, state);
  const sched = createFocusScheduler(ctrl, {
    dwell: MOSAIC_TIMING.DWELL,
    resumeDelay: MOSAIC_TIMING.RESUME_DELAY,
    getReducedMotion: function () { return ctrl.getReducedMotion(); }
  });
  const gate = createVisibilityGate(panel, function (visible) { ctrl._onVisibility(visible); });

  ctrl._bind(sched, gate);
  ctrl._preloadStills();                                                  // carga TODAS las imagenes estaticas (sin esperar foco/hover)
  ctrl._renderNeutral();                                                  // arranca en estado neutral (sin ninguna pieza expandida)
  ctrl._onVisibility(gate.isPanelVisible() && gate.isDocVisible());        // arranca AUTO si procede

  if (vis.dataset) { vis.dataset.mosaicReady = '1'; }
  vis.__mosaicCtrl = ctrl;
  panel.__mosaicCtrl = ctrl;                                              // para el cableado de relabel
  return ctrl;
}

/* ═══ EXPORT GUARD ═══
   En Node (pruebas) exporta como modulo CommonJS; en navegador no hace nada
   y los simbolos quedan disponibles como globales del script. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MOSAIC_LAYOUTS, getLayout, MOSAIC_TIMING,
    normalizeIndex, nextIndex, prevIndex,
    reduce, computeFocusClasses, canAuto, recomputeMode,
    planMosaic, buildMosaic, computeFocusScale,
    // Capa de runtime (tareas 6.2, 7.x, 8.1, 9.x, 11.x, 12.x)
    initMediaMosaic, createMediaLoader, createFocusScheduler,
    createVisibilityGate, ensureVideoEl
  };
}
