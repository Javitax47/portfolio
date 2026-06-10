'use strict';
/* =============================================================
   tests/media-mosaic.plan.test.js
   Javier Portfolio · project-media-mosaic

   Property 11: Idempotencia de hidratación
   Validates: Requirements 8.2

   `planMosaic(items, layout)` es la base PURA y determinista de la
   hidratación del mosaico. Esta suite verifica, sin DOM, que:
     - es determinista para los mismos (items, layout);
     - empareja exactamente un descriptor por medio VALIDO (src string
       no vacío) y registra el resto en `skipped`;
     - asigna un único 'is-focus' (el primero) y 'is-ambient' al resto;
     - preserva el orden del manifiesto (srcIndex creciente);
     - aplicar el plan k>=1 veces (proxy de re-hidratación) produce el
       MISMO conjunto de descriptores, sin duplicación ni crecimiento.
   Estas garantías son la base de la idempotencia de `initMediaMosaic`
   (la guarda con DOM `dataset.mosaicReady` evita además duplicar tiles,
   timers y listeners; Req 8.2).

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { planMosaic, getLayout } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

/** Mismo criterio que `hasValidSrc` en media-mosaic.js: src string no vacío. */
function isValid(item) {
  return !!item && typeof item.src === 'string' && item.src.trim() !== '';
}

/** Firma estable de un plan (idx/srcIndex/src/cell) para comparar re-aplicaciones. */
function tileSignature(tiles) {
  return tiles.map((t) => ({ idx: t.idx, srcIndex: t.srcIndex, src: t.src, cell: t.cell }));
}

/* ─────────────────────────────────────────────────────────────
   Generadores (arbitraries)
   ───────────────────────────────────────────────────────────── */

// src: mezcla deliberada de valores válidos, vacíos y en blanco para
// ejercitar el camino de "skip". (La clave puede faltar => src ausente.)
const srcArb = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(
      'public/ph_gw.png', 'public/media/gw/gw-02.png', 'media/x.gif',
      'clip.mp4', 'https://example.com/v.mp4'
    ) },
  { weight: 2, arbitrary: fc.constantFrom('', '   ', '\t', '\n') },
  { weight: 1, arbitrary: fc.string({ maxLength: 24 }) } // puede ser válido o vacío
);

// Un medio del manifiesto. `requiredKeys: ['type']` hace que src/poster/
// captions puedan ESTAR AUSENTES (otra forma de medio inválido por src).
const itemArb = fc.record(
  {
    type: fc.constantFrom('image', 'gif', 'video'),
    src: srcArb,
    poster: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    captionEs: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    captionEn: fc.option(fc.string({ maxLength: 20 }), { nil: undefined })
  },
  { requiredKeys: ['type'] }
);

// items: 0..12 medios (cubre vacío, single y fallback de layout n>=7).
const itemsArb = fc.array(itemArb, { minLength: 0, maxLength: 12 });

/**
 * A partir de items generados, computa el layout coherente con el número de
 * medios válidos: el consumidor real usa getLayout(validItems.length).
 */
function planFor(items) {
  const validCount = items.filter(isValid).length;
  const layout = getLayout(Math.max(1, validCount));
  return { layout: layout, validCount: validCount, plan: planMosaic(items, layout) };
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (Property 11)
   ═══════════════════════════════════════════════════════════════ */

// 1) Determinismo: dos llamadas con los mismos (items, layout) devuelven
//    descriptores profundamente iguales. (Validates 8.2)
test('Property 11 · planMosaic es determinista para los mismos (items, layout)', () => {
  fc.assert(
    fc.property(itemsArb, (items) => {
      const { layout } = planFor(items);
      const a = planMosaic(items, layout);
      const b = planMosaic(items, layout);
      assert.deepStrictEqual(a, b, 'dos planes del mismo input deben ser deep-equal');
      // refuerzo "JSON deep equal" (insensible a propiedades undefined)
      assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
    }),
    { numRuns: 200 }
  );
});

// 2) Particionado correcto: tiles == nº de válidos; skipped == resto. (Validates 8.2)
test('Property 11 · tiles.length === validCount y skipped.length === items.length - validCount', () => {
  fc.assert(
    fc.property(itemsArb, (items) => {
      const { plan, validCount } = planFor(items);
      assert.strictEqual(plan.tiles.length, validCount, 'un tile por medio válido');
      assert.strictEqual(
        plan.skipped.length, items.length - validCount,
        'skipped recoge exactamente los medios sin src'
      );
      // los skipped apuntan a índices de medios inválidos del manifiesto
      plan.skipped.forEach((s) => {
        assert.ok(!isValid(items[s.index]), `el medio ${s.index} debe ser inválido`);
      });
    }),
    { numRuns: 200 }
  );
});

// 3) Exactamente un 'is-focus' (el primero), resto 'is-ambient'. (Validates 8.2)
test('Property 11 · exactamente un is-focus (el primer tile) y resto is-ambient', () => {
  fc.assert(
    fc.property(itemsArb, (items) => {
      const { plan, validCount } = planFor(items);
      const focusCount = plan.tiles.filter((t) => t.classes[0] === 'is-focus').length;

      if (validCount >= 1) {
        assert.strictEqual(focusCount, 1, 'debe haber exactamente un is-focus');
        assert.strictEqual(plan.tiles[0].classes[0], 'is-focus', 'el primer tile es el foco');
        for (let i = 1; i < plan.tiles.length; i++) {
          assert.strictEqual(plan.tiles[i].classes[0], 'is-ambient', `tile ${i} debe ser is-ambient`);
        }
      } else {
        assert.strictEqual(plan.tiles.length, 0, 'sin válidos no hay tiles');
        assert.strictEqual(focusCount, 0, 'sin válidos no hay foco');
      }
    }),
    { numRuns: 200 }
  );
});

// 4) Se preserva el orden del manifiesto: srcIndex estrictamente creciente. (Validates 8.2)
test('Property 11 · los tiles preservan el orden del manifiesto (srcIndex creciente)', () => {
  fc.assert(
    fc.property(itemsArb, (items) => {
      const { plan } = planFor(items);
      for (let i = 1; i < plan.tiles.length; i++) {
        assert.ok(
          plan.tiles[i].srcIndex > plan.tiles[i - 1].srcIndex,
          `srcIndex debe crecer: ${plan.tiles[i - 1].srcIndex} -> ${plan.tiles[i].srcIndex}`
        );
      }
      // idx es 0..tiles-1 consecutivo
      plan.tiles.forEach((t, p) => assert.strictEqual(t.idx, p, 'idx consecutivo desde 0'));
    }),
    { numRuns: 200 }
  );
});

// 5) Idempotencia (proxy de re-hidratación): aplicar el plan k=3 veces produce
//    secuencias idx/src/cell idénticas (sin duplicación ni crecimiento). (Validates 8.2)
test('Property 11 · aplicar el plan k>=1 veces produce idénticos idx/src/cell (sin duplicar)', () => {
  fc.assert(
    fc.property(itemsArb, (items) => {
      const { layout } = planFor(items);
      const runs = [planMosaic(items, layout), planMosaic(items, layout), planMosaic(items, layout)];
      const sig0 = tileSignature(runs[0].tiles);

      runs.forEach((r, k) => {
        // sin crecimiento del conjunto de descriptores
        assert.strictEqual(r.tiles.length, runs[0].tiles.length, `k=${k}: mismo nº de tiles`);
        assert.strictEqual(r.skipped.length, runs[0].skipped.length, `k=${k}: mismo nº de skipped`);
        // mismas secuencias idx/srcIndex/src/cell
        assert.deepStrictEqual(tileSignature(r.tiles), sig0, `k=${k}: firma de tiles idéntica`);
      });
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (ejemplos explícitos y bordes)
   ═══════════════════════════════════════════════════════════════ */

// 6) Edge: manifiesto vacío => plan vacío, idempotente.
test('Property 11 (edge) · items=[] produce { tiles: [], skipped: [] }', () => {
  const layout = getLayout(1);
  const a = planMosaic([], layout);
  const b = planMosaic([], layout);
  assert.deepStrictEqual(a, { tiles: [], skipped: [] });
  assert.deepStrictEqual(a, b);
});

// 7) Edge: todos los medios inválidos (src vacío/ausente) => todo a skipped.
test('Property 11 (edge) · todos sin src válido => tiles vacío y skipped completo', () => {
  const items = [
    { type: 'image', src: '' },
    { type: 'gif', src: '   ' },
    { type: 'video' } // src ausente
  ];
  const plan = planMosaic(items, getLayout(1));
  assert.strictEqual(plan.tiles.length, 0);
  assert.strictEqual(plan.skipped.length, 3);
  assert.deepStrictEqual(plan.skipped.map((s) => s.index), [0, 1, 2]);
});

// 8) Ejemplo mixto: se omite el inválido y se conserva el orden de los válidos.
test('Property 11 (ejemplo) · mezcla válidos/inválidos preserva orden y empareja celdas', () => {
  const items = [
    { type: 'image', src: 'a.png' }, // válido -> tile 0 (focus)
    { type: 'gif', src: '' },        // inválido -> skipped
    { type: 'video', src: 'c.mp4', poster: 'c.png' } // válido -> tile 1 (ambient)
  ];
  const layout = getLayout(2);
  const plan = planMosaic(items, layout);

  assert.strictEqual(plan.tiles.length, 2);
  assert.deepStrictEqual(plan.skipped.map((s) => s.index), [1]);

  assert.strictEqual(plan.tiles[0].srcIndex, 0);
  assert.strictEqual(plan.tiles[0].classes[0], 'is-focus');
  assert.strictEqual(plan.tiles[1].srcIndex, 2);
  assert.strictEqual(plan.tiles[1].classes[0], 'is-ambient');

  // cada tile válido se empareja con layout.cells[p]
  assert.deepStrictEqual(
    { col: plan.tiles[0].cell.col, colSpan: plan.tiles[0].cell.colSpan, row: plan.tiles[0].cell.row, rowSpan: plan.tiles[0].cell.rowSpan },
    { col: layout.cells[0].col, colSpan: layout.cells[0].colSpan, row: layout.cells[0].row, rowSpan: layout.cells[0].rowSpan }
  );
});
