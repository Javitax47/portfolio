'use strict';
/* =============================================================
   tests/media-mosaic.loader.test.js
   Javier Portfolio · project-media-mosaic

   Property 12: Carga única (single-load)
   Validates: Requirements 5.4

   "El Cargador_de_Medios SHALL cargar el medio de cada Pieza a lo
   sumo una vez, usando `dataset.loaded` como guarda de idempotencia."

   Se ejercita `createMediaLoader().ensureLoaded(tile, item)` (y su
   alias `prefetch`) de js/media-mosaic.js.

   ─── DOM STUB (jsdom NO está instalado) ───────────────────────
   El runtime del loader solo usa una superficie mínima del DOM:
     · tile.dataset            (objeto plano para la guarda `loaded`)
     · tile.classList          (add/remove/contains/toggle ⇒ Set)
     · tile.querySelector(sel) (devuelve el medio falso del tile)
     · tile.appendChild(node)  (para el <video> inyectado)
     · sobre el medio (img/video): get/setAttribute, removeAttribute,
       addEventListener, classList, y (solo img) complete/naturalWidth.

   Por eso construimos un STUB pequeño y documentado en lugar de jsdom:
     - `makeFakeEl(tag)`  : elemento falso. Su `setAttribute('src', v)`
       INCREMENTA `srcAssignments` cuando `v` es no vacío ⇒ así medimos
       cuántas veces se asignó realmente la fuente del medio.
       Para imágenes, `complete=true`/`naturalWidth=1` hacen que
       ensureLoaded limpie de inmediato su timeout de carga de 10 s
       (evita timers colgados en el runner).
     - `makeFakeTile(initialMedia)` : tile falso cuyo querySelector
       devuelve `initialMedia` y/o los hijos añadidos por appendChild.

   El camino de vídeo usa `document.createElement` + `tile.appendChild`.
   ensureVideoEl comprueba `typeof document === 'undefined'`; por eso un
   único test de vídeo define un `global.document` mínimo y lo restaura.
   Las PROPIEDADES generadas se centran en image|gif (el invariante de
   carga única es agnóstico del tipo vía `dataset.loaded`); un test
   unitario adicional cubre el camino de vídeo.

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { createMediaLoader } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

/* ─────────────────────────────────────────────────────────────
   STUB de elemento DOM.
   `srcAssignments` cuenta SOLO las asignaciones de 'src' con valor
   no vacío (que es como ensureLoaded materializa la carga del medio).
   ───────────────────────────────────────────────────────────── */
function makeFakeEl(tag) {
  const attrs = Object.create(null);
  const classes = new Set();
  const el = {
    tagName: String(tag).toUpperCase(),
    srcAssignments: 0,
    // Solo lo lee el camino de imagen; "ya decodificada" ⇒ limpia el timeout.
    complete: true,
    naturalWidth: 1,
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); },
      toggle: function (c) {
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      }
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute: function (name, value) {
      attrs[name] = value;
      if (name === 'src' && typeof value === 'string' && value.trim() !== '') {
        el.srcAssignments += 1;
      }
    },
    removeAttribute: function (name) { delete attrs[name]; },
    addEventListener: function () { /* listeners nunca se disparan en el stub */ },
    removeEventListener: function () { /* no-op */ },
    children: [],
    appendChild: function (child) { el.children.push(child); return child; }
  };
  // className como accesor: ensureVideoEl hace `v.className = 'mosaic-media'`.
  Object.defineProperty(el, 'className', {
    get: function () { return Array.from(classes).join(' '); },
    set: function (v) {
      classes.clear();
      String(v).split(/\s+/).forEach(function (c) { if (c) { classes.add(c); } });
    }
  });
  return el;
}

/* ─────────────────────────────────────────────────────────────
   STUB de tile. `querySelector` resuelve el medio inicial y/o los
   nodos añadidos por appendChild (necesario para el <video>).
   ───────────────────────────────────────────────────────────── */
function makeFakeTile(initialMedia) {
  const classes = new Set();
  const appended = [];
  return {
    dataset: {},
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); },
      toggle: function (c) {
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      }
    },
    appendChild: function (child) { appended.push(child); return child; },
    querySelector: function (sel) {
      const all = (initialMedia ? [initialMedia] : []).concat(appended);
      if (sel === 'video' || sel === 'video.mosaic-media') {
        return all.find(function (e) { return e.tagName === 'VIDEO'; }) || null;
      }
      if (sel === 'img' || sel === 'img.mosaic-media') {
        return all.find(function (e) { return e.tagName === 'IMG'; }) || null;
      }
      if (sel === '.mosaic-media') { return all[0] || null; }
      return null;
    }
  };
}

/* Genera un `src` no vacío y sin espacios (ruta de medio plausible). */
const validSrc = fc.string({ minLength: 0, maxLength: 30 }).map(function (s) {
  return 'public/media/x/' + s.replace(/[^\w.-]/g, '_') + '-02.png';
});

/* MediaItem image|gif: el invariante de carga única es agnóstico del
   tipo (lo impone `dataset.loaded`). El camino de vídeo se cubre aparte. */
const imageOrGifItem = fc.record({
  type: fc.constantFrom('image', 'gif'),
  src: validSrc
});

/* Crea (loader, tile, img) para un item de tipo image|gif, con el medio
   diferido vía `data-src` (escenario de Pieza ambiental). Poner 'data-src'
   NO cuenta como asignación de 'src'. */
function setupImageScenario(item) {
  const loader = createMediaLoader();
  const img = makeFakeEl('img');
  img.setAttribute('data-src', item.src); // diferido; no incrementa srcAssignments
  const tile = makeFakeTile(img);
  return { loader: loader, tile: tile, img: img };
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 12 · (1) Carga única bajo cualquier nº de llamadas
   Para CUALQUIER secuencia de 1..20 ensureLoaded sobre el MISMO tile,
   la fuente del medio se asigna A LO SUMO una vez y, tras la primera
   llamada, tile.dataset.loaded === '1' (guarda de idempotencia).
   ═══════════════════════════════════════════════════════════════ */
test('Property 12 · ensureLoaded repetido carga el src a lo sumo una vez', () => {
  fc.assert(
    fc.property(imageOrGifItem, fc.integer({ min: 1, max: 20 }), (item, count) => {
      const { loader, tile, img } = setupImageScenario(item);
      try {
        for (let i = 0; i < count; i++) {
          loader.ensureLoaded(tile, item);
          if (i === 0) {
            assert.strictEqual(
              tile.dataset.loaded, '1',
              'tras la primera carga, dataset.loaded debe ser "1" (guarda)'
            );
          }
        }
        assert.ok(
          img.srcAssignments <= 1,
          `el src del medio debe asignarse a lo sumo una vez (fue ${img.srcAssignments})`
        );
        assert.strictEqual(tile.dataset.loaded, '1', 'la guarda permanece en "1"');
      } finally {
        loader.dispose();
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 12 · (2) Un tile nuevo con src válido carga EXACTAMENTE una vez
   ═══════════════════════════════════════════════════════════════ */
test('Property 12 · tile nuevo con src válido asigna el src exactamente una vez', () => {
  fc.assert(
    fc.property(imageOrGifItem, (item) => {
      const { loader, tile, img } = setupImageScenario(item);
      try {
        loader.ensureLoaded(tile, item);
        assert.strictEqual(img.srcAssignments, 1, 'la primera carga asigna el src una vez');
        assert.strictEqual(tile.dataset.loaded, '1', 'queda marcado como cargado');
      } finally {
        loader.dispose();
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 12 · (3) prefetch se comporta como ensureLoaded (idempotente)
   Cualquier mezcla de prefetch/ensureLoaded sobre el mismo tile mantiene
   la carga única (prefetch es un alias de ensureLoaded en el diseño).
   ═══════════════════════════════════════════════════════════════ */
test('Property 12 · prefetch es idempotente y comparte la guarda con ensureLoaded', () => {
  const callKind = fc.constantFrom('ensure', 'prefetch');
  fc.assert(
    fc.property(imageOrGifItem, fc.array(callKind, { minLength: 1, maxLength: 20 }), (item, calls) => {
      const { loader, tile, img } = setupImageScenario(item);
      try {
        calls.forEach(function (kind) {
          if (kind === 'prefetch') { loader.prefetch(tile, item); }
          else { loader.ensureLoaded(tile, item); }
        });
        assert.ok(
          img.srcAssignments <= 1,
          `prefetch/ensureLoaded mezclados deben cargar a lo sumo una vez (fue ${img.srcAssignments})`
        );
        assert.strictEqual(tile.dataset.loaded, '1', 'la guarda queda en "1" tras cualquier mezcla');
      } finally {
        loader.dispose();
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT · camino de VÍDEO (single-load type-agnostic)
   Define un global.document mínimo para ensureVideoEl (createElement)
   y verifica que el <video> y su `src` se materializan UNA sola vez,
   aun con múltiples ensureLoaded. Restaura document al terminar.
   ═══════════════════════════════════════════════════════════════ */
test('Property 12 · camino de vídeo también carga el src una sola vez', () => {
  const prevDoc = global.document;
  global.document = { createElement: function (tag) { return makeFakeEl(tag); } };
  const loader = createMediaLoader();
  try {
    const tile = makeFakeTile(null); // sin poster <img> inicial
    const item = {
      type: 'video',
      src: 'public/media/x/x-04.mp4',
      poster: 'public/media/x/x-04.poster.png'
    };
    for (let i = 0; i < 7; i++) { loader.ensureLoaded(tile, item); }

    const v = tile.querySelector('video');
    assert.ok(v, 'se inyecta un <video>');
    assert.strictEqual(v.srcAssignments, 1, 'el src del vídeo se asigna exactamente una vez');
    assert.strictEqual(tile.dataset.loaded, '1', 'queda marcado como cargado');
  } finally {
    loader.dispose();
    global.document = prevDoc;
  }
});

/* ═══════════════════════════════════════════════════════════════
   UNIT · entradas inválidas son no-op seguro (no marca cargado)
   ═══════════════════════════════════════════════════════════════ */
test('ensureLoaded sin tile o sin item es no-op (no asigna src ni guarda)', () => {
  const loader = createMediaLoader();
  try {
    const img = makeFakeEl('img');
    img.setAttribute('data-src', 'public/media/x/x-02.png');
    const tile = makeFakeTile(img);

    loader.ensureLoaded(null, { type: 'image', src: 'public/media/x/x-02.png' });
    loader.ensureLoaded(tile, null);

    assert.strictEqual(img.srcAssignments, 0, 'sin item/tile no se asigna ningún src');
    assert.notStrictEqual(tile.dataset.loaded, '1', 'no se marca como cargado en no-op');
  } finally {
    loader.dispose();
  }
});
