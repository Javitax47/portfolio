'use strict';
/* =============================================================
   tests/media-mosaic.layout.test.js
   Javier Portfolio · project-media-mosaic

   Property 10: Layout válido (sin solapes, cubre)
   Validates: Requirements 1.3, 1.4, 1.5

   ∀ n ∈ [2,6], las celdas de getLayout(n) no se solapan y cubren la
   rejilla densa cols×rows (Σ colSpan·rowSpan === cols·rows), y
   cells.length === n. Para n ∈ [1,12], cells.length === n. Para
   n ∈ [7,12] (fallback determinista), además sin solapes y cobertura
   total.

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { getLayout } = require('./_helpers.js').requireProject('js/media-mosaic.js');

/* ─────────────────────────────────────────────────────────────
   Helper de invariantes de teselado.
   Dado un layout {cols, rows, cells}, verifica:
     1) cells.length === expectedN
     2) Cada celda dentro de los limites (1-based) y con spans >= 1
     3) Sin solapes: marca cada cuadrado unidad en una rejilla de
        ocupacion cols×rows; ningun cuadrado se marca dos veces
     4) Cobertura total: cada cuadrado unidad cubierto exactamente una
        vez (equivalente a Σ colSpan·rowSpan === cols·rows sin solapes)
   Devuelve un objeto con metricas utiles para mensajes de aserción.
   ───────────────────────────────────────────────────────────── */
function checkTiling(layout, expectedN) {
  assert.ok(layout && typeof layout === 'object', 'layout debe ser un objeto');

  const { cols, rows, cells } = layout;
  assert.ok(Number.isInteger(cols) && cols >= 1, `cols debe ser entero >= 1 (fue ${cols})`);
  assert.ok(Number.isInteger(rows) && rows >= 1, `rows debe ser entero >= 1 (fue ${rows})`);
  assert.ok(Array.isArray(cells), 'cells debe ser un array');

  // (1) recuento de celdas
  assert.strictEqual(
    cells.length, expectedN,
    `cells.length debe ser ${expectedN} (fue ${cells.length})`
  );

  // Rejilla de ocupacion: ocupacion[r][c] = nº de celdas que cubren ese cuadrado.
  const occ = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let areaSum = 0;

  cells.forEach((cell, k) => {
    const { col, colSpan, row, rowSpan } = cell;

    // (2) dentro de limites + spans validos
    assert.ok(Number.isInteger(col) && col >= 1, `celda ${k}: col debe ser entero >= 1 (fue ${col})`);
    assert.ok(Number.isInteger(row) && row >= 1, `celda ${k}: row debe ser entero >= 1 (fue ${row})`);
    assert.ok(Number.isInteger(colSpan) && colSpan >= 1, `celda ${k}: colSpan debe ser entero >= 1 (fue ${colSpan})`);
    assert.ok(Number.isInteger(rowSpan) && rowSpan >= 1, `celda ${k}: rowSpan debe ser entero >= 1 (fue ${rowSpan})`);
    assert.ok(
      col + colSpan - 1 <= cols,
      `celda ${k}: excede el limite de columnas (col ${col} + span ${colSpan} - 1 > cols ${cols})`
    );
    assert.ok(
      row + rowSpan - 1 <= rows,
      `celda ${k}: excede el limite de filas (row ${row} + span ${rowSpan} - 1 > rows ${rows})`
    );

    areaSum += colSpan * rowSpan;

    // (3) marcar cuadrados unidad; detectar solapes
    for (let r = row - 1; r < row - 1 + rowSpan; r++) {
      for (let c = col - 1; c < col - 1 + colSpan; c++) {
        occ[r][c] += 1;
        assert.ok(
          occ[r][c] === 1,
          `solape detectado en (fila ${r + 1}, col ${c + 1}); celda ${k} lo cubre por segunda vez`
        );
      }
    }
  });

  // (4) cobertura total: cada cuadrado cubierto exactamente una vez
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      assert.strictEqual(
        occ[r][c], 1,
        `cuadrado (fila ${r + 1}, col ${c + 1}) cubierto ${occ[r][c]} veces (se esperaba 1)`
      );
    }
  }

  // Equivalencia algebraica: Σ colSpan·rowSpan === cols·rows
  assert.strictEqual(
    areaSum, cols * rows,
    `la suma de areas (${areaSum}) debe igualar cols*rows (${cols * rows})`
  );

  return { cols, rows, areaSum, n: cells.length };
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (Property 10)
   ═══════════════════════════════════════════════════════════════ */

// 1) n ∈ [2,6]: recuento, sin solapes y cobertura total. (Validates 1.3)
test('Property 10 · n∈[2,6]: getLayout no solapa y cubre la rejilla (Σ areas === cols*rows)', () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 6 }), (n) => {
      const layout = getLayout(n);
      checkTiling(layout, n);
    }),
    { numRuns: 200 }
  );
});

// 2) n ∈ [1,12]: getLayout(n).cells.length === n. (Validates 1.4)
test('Property 10 · n∈[1,12]: getLayout(n) devuelve exactamente n celdas', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 12 }), (n) => {
      const layout = getLayout(n);
      assert.ok(Array.isArray(layout.cells), 'cells debe ser un array');
      assert.strictEqual(
        layout.cells.length, n,
        `cells.length debe ser ${n} (fue ${layout.cells.length})`
      );
    }),
    { numRuns: 200 }
  );
});

// 3) n ∈ [7,12]: fallback determinista sin solapes, cobertura total y recuento. (Validates 1.5)
test('Property 10 · n∈[7,12]: fallback determinista no solapa, cubre y tiene n celdas', () => {
  fc.assert(
    fc.property(fc.integer({ min: 7, max: 12 }), (n) => {
      const layout = getLayout(n);
      checkTiling(layout, n);
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (ejemplos explícitos y determinismo)
   ═══════════════════════════════════════════════════════════════ */

test('getLayout(1) devuelve una unica celda que cubre toda la rejilla', () => {
  const layout = getLayout(1);
  checkTiling(layout, 1);
  const cell = layout.cells[0];
  assert.strictEqual(cell.col, 1, 'la celda unica empieza en la columna 1');
  assert.strictEqual(cell.row, 1, 'la celda unica empieza en la fila 1');
  assert.strictEqual(cell.colSpan, layout.cols, 'la celda unica abarca todas las columnas');
  assert.strictEqual(cell.rowSpan, layout.rows, 'la celda unica abarca todas las filas');
});

test('getLayout es determinista: getLayout(9) llamado dos veces es deep-equal', () => {
  const a = getLayout(9);
  const b = getLayout(9);
  assert.deepStrictEqual(a, b, 'dos llamadas con el mismo n deben producir el mismo layout');
});

test('getLayout(4) coincide con la plantilla precomputada (4 celdas, sin solapes, cubre)', () => {
  const layout = getLayout(4);
  checkTiling(layout, 4);
  // al menos una pieza featured en las plantillas precomputadas
  assert.ok(
    layout.cells.some((c) => c.featured === true),
    'la plantilla n=4 debe declarar al menos una celda featured'
  );
});
