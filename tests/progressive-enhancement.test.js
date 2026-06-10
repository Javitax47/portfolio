'use strict';
/* =============================================================
   tests/progressive-enhancement.test.js
   Javier Portfolio · project-media-mosaic

   Property 14: Mejora progresiva
   Validates: Requirements 8.1

   Sin JavaScript (o si la hidratacion falla), CADA medio del
   Manifiesto_de_Medios debe ser alcanzable visualmente dentro de un
   BOTON NATIVO (`<button>`), en el ORDEN DEL DOCUMENTO y operable con
   teclado (Tab + Enter/Space) — sin depender de JS.

   Estrategia (jsdom NO esta instalado): se lee `index.html` como CADENA
   (fs.readFileSync) y se verifica la estructura mediante parsing por
   regex/strings, tolerante a espacios/saltos de linea. El manifiesto se
   carga via la guarda de export de `js/media-manifest.js`.

   Para cada proyecto se comprueba que:
     · existe un `.proj-mosaic` con `data-count="4"`,
     · hay exactamente un `<button class="mosaic-tile">` por medio del
       manifiesto (botones nativos, operables sin JS),
     · la primera pieza es la enfocada (`is-focus` / aria-pressed=true) y
       el resto ambientales (`is-ambient` / aria-pressed=false),
     · cada ruta del manifiesto aparece como `src=`/`data-src=` dentro del
       bloque del proyecto, en el MISMO ORDEN que el manifiesto
       (para video se usa `poster`; para image/gif, `src`).

   Runner: node --test (nativo, Node 18+). Generadores: fast-check (opcional).
   Solo desarrollo: no anade build de produccion.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

let fc = null;
try { fc = require('fast-check'); } catch (_) { /* opcional */ }

const { fromRoot, requireProject } = require('./_helpers.js');
const { getManifest } = requireProject('js/media-manifest.js');

/* ── Datos del dominio ─────────────────────────────────────── */
const PROJECTS = ['gw', 'nltl', 'cosmos', 'physdeck', 'mineralia', 'mario'];

/* index.html leido una sola vez como cadena (sin DOM). */
const HTML = fs.readFileSync(fromRoot('index.html'), 'utf8');

/* ── Utilidades de parsing tolerante a espacios ────────────── */

/** Escapa una cadena para uso literal dentro de un RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extrae el bloque HTML del <article> de un proyecto: desde su etiqueta de
 * apertura `<article ... data-proj="X" ...>` hasta su `</article>` de cierre.
 * Los <article> de proyecto no estan anidados, asi que el siguiente
 * `</article>` delimita el bloque de forma precisa.
 */
function getProjectBlock(proj) {
  const openRe = new RegExp('<article\\b[^>]*\\bdata-proj="' + escapeRegExp(proj) + '"[^>]*>');
  const m = openRe.exec(HTML);
  assert.ok(m, `No se encontro <article data-proj="${proj}">`);
  const start = m.index;
  const closeIdx = HTML.indexOf('</article>', start);
  assert.ok(closeIdx > start, `No se encontro </article> de cierre para "${proj}"`);
  return HTML.slice(start, closeIdx + '</article>'.length);
}

/** Etiquetas de apertura de cada `<button class="mosaic-tile ...">` del bloque, en orden. */
function tileOpenTags(block) {
  return block.match(/<button\b[^>]*\bclass="mosaic-tile[^"]*"[^>]*>/g) || [];
}

/** Lee el valor de un atributo de una etiqueta de apertura (o null). */
function attr(tag, name) {
  const m = new RegExp('\\b' + escapeRegExp(name) + '="([^"]*)"').exec(tag);
  return m ? m[1] : null;
}

/** Fuente estatica esperada de un item: poster si es video; src en otro caso. */
function expectedSource(item) {
  return item.type === 'video' ? item.poster : item.src;
}

/**
 * Posicion (indice de cadena) de la primera aparicion de `ruta` como valor de
 * un atributo `src=` o `data-src=` dentro de `block`, o -1 si no aparece.
 */
function sourceAttrIndex(block, ruta) {
  const re = new RegExp('(?:\\bsrc|\\bdata-src)="' + escapeRegExp(ruta) + '"');
  const m = re.exec(block);
  return m ? m.index : -1;
}

/* ── Aserciones reutilizables por proyecto (nucleo de Property 14) ── */

function assertProjectProgressiveEnhancement(proj) {
  const items = getManifest(proj);
  assert.ok(items.length > 0, `El manifiesto de "${proj}" no debe estar vacio`);

  const block = getProjectBlock(proj);

  // (2) Un boton nativo .mosaic-tile por cada medio del manifiesto.
  const tags = tileOpenTags(block);
  assert.strictEqual(
    tags.length, items.length,
    `${proj}: ${tags.length} mosaic-tile pero el manifiesto tiene ${items.length}`
  );

  // El contenedor declara data-count igual al numero de medios.
  const mosaicOpen = /<div\b[^>]*\bclass="proj-mosaic"[^>]*>/.exec(block);
  assert.ok(mosaicOpen, `${proj}: falta el contenedor .proj-mosaic`);
  assert.strictEqual(
    attr(mosaicOpen[0], 'data-count'), String(items.length),
    `${proj}: data-count debe ser "${items.length}"`
  );

  // (4) Botones nativos + estado de foco: la 1a pieza enfocada, el resto ambiente.
  tags.forEach((tag, i) => {
    assert.ok(/^<button\b/.test(tag), `${proj} tile ${i}: debe ser un <button> nativo`);
    const cls = attr(tag, 'class') || '';
    const pressed = attr(tag, 'aria-pressed');
    // Estado inicial: todas las piezas arrancan en is-neutral (sin foco por defecto).
    assert.ok(/\bis-neutral\b/.test(cls), `${proj} tile ${i}: la clase debe contener is-neutral`);
    assert.strictEqual(pressed, 'false', `${proj} tile ${i}: aria-pressed debe ser "false"`);
  });

  // (3) Cada medio aparece como src=/data-src= y en el MISMO ORDEN del manifiesto.
  const positions = [];
  items.forEach((item, i) => {
    const ruta = expectedSource(item);
    assert.ok(
      ruta && ruta.length > 0,
      `${proj} item ${i} (${item.type}): no tiene una ruta estatica esperada (¿video sin poster?)`
    );
    const at = sourceAttrIndex(block, ruta);
    assert.ok(
      at >= 0,
      `${proj} item ${i}: la ruta "${ruta}" no aparece como src=/data-src= en el markup`
    );
    positions.push(at);
  });

  for (let i = 1; i < positions.length; i++) {
    assert.ok(
      positions[i] > positions[i - 1],
      `${proj}: el orden del markup no coincide con el manifiesto en el item ${i} ` +
      `(pos ${positions[i]} no es > ${positions[i - 1]})`
    );
  }
}

/* ═══════════════════════════════════════════════════════════════
   TEST 1 · Exactamente 6 contenedores .proj-mosaic, cada uno data-count="4"
   ═══════════════════════════════════════════════════════════════ */
test('Property 14 · hay exactamente 6 .proj-mosaic y cada uno tiene data-count="4"', () => {
  const opens = HTML.match(/<div\b[^>]*\bclass="proj-mosaic"[^>]*>/g) || [];
  assert.strictEqual(opens.length, 6, `Se esperaban 6 .proj-mosaic, se hallaron ${opens.length}`);
  opens.forEach((tag, i) => {
    assert.strictEqual(
      attr(tag, 'data-count'), '4',
      `.proj-mosaic #${i}: data-count debe ser "4"`
    );
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 2 · Por proyecto: numero de tiles === 4 === |manifiesto|
   ═══════════════════════════════════════════════════════════════ */
test('Property 14 · cada proyecto tiene 4 mosaic-tile = |manifiesto| = data-count', () => {
  for (const proj of PROJECTS) {
    const items = getManifest(proj);
    const block = getProjectBlock(proj);
    const tags = tileOpenTags(block);
    assert.strictEqual(tags.length, 4, `${proj}: deben existir 4 mosaic-tile`);
    assert.strictEqual(
      tags.length, items.length,
      `${proj}: tiles (${tags.length}) deben igualar |manifiesto| (${items.length})`
    );
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 3 · Cada medio del manifiesto aparece como src=/data-src= en orden
   ═══════════════════════════════════════════════════════════════ */
test('Property 14 · cada ruta del manifiesto aparece en el markup, en el orden del manifiesto', () => {
  for (const proj of PROJECTS) {
    assertProjectProgressiveEnhancement(proj);
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 4 · Botones nativos: 1a pieza enfocada, resto ambientales
   ═══════════════════════════════════════════════════════════════ */
test('Property 14 · cada tile es <button> nativo; todas arrancan en is-neutral (sin foco por defecto)', () => {
  for (const proj of PROJECTS) {
    const block = getProjectBlock(proj);
    const tags = tileOpenTags(block);
    tags.forEach((tag, i) => {
      assert.ok(/^<button\b/.test(tag), `${proj} tile ${i}: debe ser <button> nativo`);
      assert.ok(/\btype="button"/.test(tag), `${proj} tile ${i}: debe declarar type="button"`);
      const cls = attr(tag, 'class') || '';
      const pressed = attr(tag, 'aria-pressed');
      // Estado inicial neutral: sin foco por defecto.
      assert.match(cls, /\bis-neutral\b/, `${proj} tile ${i}: clase con is-neutral`);
      assert.strictEqual(pressed, 'false', `${proj} tile ${i}: aria-pressed="false"`);
    });
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 5 · Orden de scripts: media-manifest.js y media-mosaic.js ANTES de ui.js
   ═══════════════════════════════════════════════════════════════ */
test('Property 14 · js/media-manifest.js y js/media-mosaic.js aparecen antes de js/ui.js', () => {
  const iManifest = HTML.indexOf('js/media-manifest.js');
  const iMosaic = HTML.indexOf('js/media-mosaic.js');
  const iUi = HTML.indexOf('js/ui.js');
  assert.ok(iManifest >= 0, 'falta <script ... js/media-manifest.js>');
  assert.ok(iMosaic >= 0, 'falta <script ... js/media-mosaic.js>');
  assert.ok(iUi >= 0, 'falta <script ... js/ui.js>');
  assert.ok(iManifest < iUi, 'js/media-manifest.js debe ir antes de js/ui.js');
  assert.ok(iMosaic < iUi, 'js/media-mosaic.js debe ir antes de js/ui.js');
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TEST (fast-check, opcional) · Property 14 sobre el dominio de proyectos
   Para CUALQUIER proyecto del manifiesto, todos sus medios son alcanzables
   dentro de botones nativos, en el orden del documento, sin JS.
   ═══════════════════════════════════════════════════════════════ */
if (fc) {
  test('Property 14 · ∀ proyecto: medios alcanzables en <button> nativos y en orden (fast-check)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROJECTS), (proj) => {
        assertProjectProgressiveEnhancement(proj);
      }),
      { numRuns: 60 }
    );
  });
}
