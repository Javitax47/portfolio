'use strict';
/* =============================================================
   tests/media-mosaic.lifecycle.test.js
   Javier Portfolio · project-media-mosaic   (tarea 12.3)

   Property 15: Sincronía de idioma
   Property 13: Sin fugas tras destroy
   Validates: Requirements 8.3, 8.4

   A diferencia del resto de pruebas del mosaico (que ejercitan la
   LÓGICA PURA: reductor, índice, layout…), aquí se prueba la CAPA
   DE RUNTIME con DOM: `initMediaMosaic(panel)` construye el mosaico
   y devuelve un controlador con `relabel()` / `destroy()`.

   El sitio es HTML/CSS/JS vanilla sin build, y jsdom NO está
   instalado. En lugar de añadir una dependencia pesada, se instala
   un STUB MÍNIMO de DOM (document/IntersectionObserver/matchMedia)
   suficiente para recorrer el camino de hidratación real del módulo.
   Cada test reinstala un DOM fresco con CONTADORES propios para
   medir, de forma observable, las fugas tras `destroy()`.

   Notas sobre proxies observables (cuando una aserción directa no es
   práctica con el stub):
     · "timers liberados" → se valida indirectamente vía `destroy()`
       (que invoca scheduler.dispose + loader.dispose). Aquí medimos
       los recuentos observables: listeners de elementos, listener de
       `document`/visibilitychange, listener de matchMedia y la
       desconexión del IntersectionObserver, además de la limpieza de
       `vis.dataset.mosaicReady` (que rehabilita la re-hidratación).

   Runner: node --test (nativo, Node 18+). Sin build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');

const helpers = require('./_helpers.js');
const { getManifest, PROJECT_MEDIA } = helpers.requireProject('js/media-manifest.js');
const { initMediaMosaic } = helpers.requireProject('js/media-mosaic.js');

/* ═══════════════════════════════════════════════════════════════
   STUB MÍNIMO DE DOM
   -------------------------------------------------------------
   `installDom()` instala en `global` un document/IntersectionObserver/
   matchMedia falsos y devuelve:
     · counters  : recuentos observables para las aserciones de fuga
     · makePanel : fábrica de un panel falso (article.proj-panel) con
                   su .proj-vis hija (lista para initMediaMosaic)
   Las funciones del módulo leen los globales de forma PEREZOSA (en
   tiempo de llamada, no de carga), así que reinstalar globales por
   test basta para aislar cada caso.
   ═══════════════════════════════════════════════════════════════ */

function installDom() {
  /** Recuentos/registros observables (frescos por test). */
  const counters = {
    elementListeners: 0,  // listeners activos sobre elementos (mosaic/tiles/imgs)
    ioInstances: [],      // IntersectionObservers construidos
    ioObserved: 0,        // nº de .observe()
    ioDisconnected: 0,    // nº de .disconnect()
    mmListeners: 0,       // listeners 'change' activos en matchMedia
    docListeners: []      // listeners activos en `document` ({type, handler})
  };

  /* ── style mínimo: setProperty/getPropertyValue ── */
  function makeStyle() {
    const props = {};
    return {
      _props: props,
      setProperty(k, v) { props[k] = String(v); },
      getPropertyValue(k) { return (k in props) ? props[k] : ''; },
      removeProperty(k) { delete props[k]; }
    };
  }

  /* ── matcher de selector simple: '.cls' | 'tag' | 'tag.cls' | '[data-x]' ── */
  function matchesSel(node, sel) {
    sel = String(sel).trim();
    if (sel[0] === '[') {                       // atributo: [data-proj], [data-mosaic]…
      const name = sel.slice(1, -1).split('=')[0];
      if (name.indexOf('data-') === 0) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return !!node.dataset && node.dataset[key] != null;
      }
      return !!node._attrs && (name in node._attrs);
    }
    let tag = null, cls = null;
    const dot = sel.indexOf('.');
    if (dot === -1) { tag = sel; }
    else if (dot === 0) { cls = sel.slice(1); }
    else { tag = sel.slice(0, dot); cls = sel.slice(dot + 1); }
    if (tag && tag !== '*' && node.tagName !== tag.toUpperCase()) { return false; }
    if (cls && !(node.classList && node.classList.contains(cls))) { return false; }
    return true;
  }

  function descendantsMatching(root, sel) {
    const out = [];
    (function walk(n) {
      for (let i = 0; i < n.children.length; i++) {
        const c = n.children[i];
        if (matchesSel(c, sel)) { out.push(c); }
        walk(c);
      }
    })(root);
    return out;
  }

  /* ── fábrica de elemento falso ── */
  function makeEl(tag) {
    const classSet = new Set();
    const attrs = {};
    const listeners = [];   // {type, handler} activos en ESTE elemento
    const children = [];

    const node = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      dataset: {},
      style: makeStyle(),
      children: children,
      parentNode: null,
      textContent: '',
      _attrs: attrs,
      _listeners: listeners
    };

    // classList respaldada por Set; `className` se sincroniza con ella.
    node.classList = {
      add() { for (let i = 0; i < arguments.length; i++) { classSet.add(arguments[i]); } },
      remove() { for (let i = 0; i < arguments.length; i++) { classSet.delete(arguments[i]); } },
      contains(c) { return classSet.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (classSet.has(c)) { classSet.delete(c); return false; }
          classSet.add(c); return true;
        }
        if (force) { classSet.add(c); return true; }
        classSet.delete(c); return false;
      }
    };
    Object.defineProperty(node, 'className', {
      get() { return Array.from(classSet).join(' '); },
      set(v) {
        classSet.clear();
        String(v).split(/\s+/).forEach(function (c) { if (c) { classSet.add(c); } });
      }
    });

    node.setAttribute = function (k, v) { attrs[k] = String(v); };
    node.getAttribute = function (k) { return (k in attrs) ? attrs[k] : null; };
    node.removeAttribute = function (k) { delete attrs[k]; };
    node.hasAttribute = function (k) { return (k in attrs); };

    node.appendChild = function (child) { child.parentNode = node; children.push(child); return child; };
    node.removeChild = function (child) {
      const i = children.indexOf(child);
      if (i >= 0) { children.splice(i, 1); }
      child.parentNode = null;
      return child;
    };

    // Listeners: cada add/remove ajusta el contador global compartido.
    node.addEventListener = function (type, handler /*, opt */) {
      listeners.push({ type: type, handler: handler });
      counters.elementListeners++;
    };
    node.removeEventListener = function (type, handler /*, opt */) {
      const i = listeners.findIndex(function (l) { return l.type === type && l.handler === handler; });
      if (i >= 0) { listeners.splice(i, 1); counters.elementListeners--; }
    };

    node.querySelector = function (sel) { const a = descendantsMatching(node, sel); return a.length ? a[0] : null; };
    node.querySelectorAll = function (sel) { return descendantsMatching(node, sel); };
    node.closest = function (sel) {
      let cur = node;
      while (cur) { if (matchesSel(cur, sel)) { return cur; } cur = cur.parentNode; }
      return null;
    };
    node.contains = function (other) {
      if (node === other) { return true; }
      let hit = false;
      (function walk(n) { n.children.forEach(function (c) { if (c === other) { hit = true; } else { walk(c); } }); })(node);
      return hit;
    };
    node.focus = function () { /* no-op */ };

    return node;
  }

  /* ── <html> con idioma activo (data-lang) ── */
  const documentElement = makeEl('html');
  documentElement.dataset.lang = 'es';

  /* ── document falso ── */
  global.document = {
    hidden: false,
    documentElement: documentElement,
    createElement: function (t) { return makeEl(t); },
    addEventListener: function (type, handler) { counters.docListeners.push({ type: type, handler: handler }); },
    removeEventListener: function (type, handler) {
      const i = counters.docListeners.findIndex(function (l) { return l.type === type && l.handler === handler; });
      if (i >= 0) { counters.docListeners.splice(i, 1); }
    }
  };

  /* ── IntersectionObserver falso con contadores ── */
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; counters.ioInstances.push(this); }
    observe() { counters.ioObserved++; }
    disconnect() { counters.ioDisconnected++; }
    unobserve() { /* no-op */ }
  };

  /* ── matchMedia falso: nunca reduce-motion; cuenta listeners 'change' ── */
  global.matchMedia = function (q) {
    return {
      media: q,
      matches: false,
      addEventListener() { counters.mmListeners++; },
      removeEventListener() { counters.mmListeners--; },
      addListener() { /* legacy: sin contar */ },
      removeListener() { /* legacy */ }
    };
  };

  /* ── manifiesto disponible como GLOBAL (media-mosaic usa el global) ── */
  global.getManifest = getManifest;
  global.PROJECT_MEDIA = PROJECT_MEDIA;

  /* ── fábrica de panel: article.proj-panel[data-proj] > div.proj-vis ── */
  function makePanel(proj) {
    const panel = makeEl('article');
    panel.className = 'proj-panel';
    panel.dataset.proj = proj;
    const vis = makeEl('div');
    vis.className = 'proj-vis';
    panel.appendChild(vis);   // vis.parentNode = panel  => vis.closest('[data-proj]') === panel
    return { panel: panel, vis: vis };
  }

  return { counters: counters, makePanel: makePanel, documentElement: documentElement };
}

/** Devuelve los <button.mosaic-tile> del mosaico, en orden de documento. */
function tilesOf(vis) {
  return vis.querySelectorAll('.mosaic-tile');
}

/* ═══════════════════════════════════════════════════════════════
   TEST 1 · Property 15 (Sincronía de idioma) — Req 8.3
   ═══════════════════════════════════════════════════════════════ */

test('Property 15 · relabel() sincroniza captions/aria con el idioma activo (es→en)', () => {
  const dom = installDom();
  const gw = getManifest('gw');                       // datos reales del manifiesto
  const { panel, vis } = dom.makePanel('gw');

  // Idioma inicial 'es'.
  dom.documentElement.dataset.lang = 'es';
  const ctrl = initMediaMosaic(panel);
  assert.ok(ctrl, 'initMediaMosaic debe hidratar el panel gw y devolver un controlador');

  const tiles = tilesOf(vis);
  assert.strictEqual(tiles.length, gw.length, 'una Pieza por medio del manifiesto');

  // Estado inicial: todas las piezas en is-neutral (sin foco por defecto).
  tiles.forEach(function (t) {
    assert.ok(t.classList.contains('is-neutral'), 'todas las piezas arrancan en is-neutral');
  });
  // Usamos la pieza 0 para verificar el alt (relabel actualiza todas las piezas).
  const tile0 = tiles[0];
  const tile0Img = tile0.querySelector('img');

  // (es) el alt de la pieza 0 coincide con el captionEs del medio 0.
  assert.strictEqual(
    tile0Img.getAttribute('alt'), gw[0].captionEs,
    'en es, el alt de la pieza 0 debe ser el captionEs del medio 0'
  );
  // …y todas las Piezas usan su captionEs.
  tiles.forEach(function (t, k) {
    assert.strictEqual(
      t.querySelector('img').getAttribute('alt'), gw[k].captionEs,
      'en es, el alt de la Pieza ' + k + ' debe ser su captionEs'
    );
  });

  // La región aria-live existe (puede estar vacía en estado neutral).
  const live = vis.querySelector('.mosaic-live');
  assert.ok(live, 'debe existir la región aria-live (.mosaic-live)');

  // Cambio de idioma a 'en' + relabel().
  dom.documentElement.dataset.lang = 'en';
  ctrl.relabel();

  // (en) el alt de la pieza 0 cambia al captionEn del medio 0.
  assert.strictEqual(
    tile0Img.getAttribute('alt'), gw[0].captionEn,
    'tras relabel(en), el alt de la pieza 0 debe ser el captionEn del medio 0'
  );
  assert.notStrictEqual(
    gw[0].captionEs, gw[0].captionEn,
    'precondición: el caption del medio 0 difiere entre idiomas (el cambio es observable)'
  );
  // …y todas las Piezas pasan a su captionEn.
  tiles.forEach(function (t, k) {
    assert.strictEqual(
      t.querySelector('img').getAttribute('alt'), gw[k].captionEn,
      'tras relabel(en), el alt de la Pieza ' + k + ' debe ser su captionEn'
    );
  });

  ctrl.destroy();   // limpieza (cancela timers de carga pendientes)
});

/* ═══════════════════════════════════════════════════════════════
   TEST 2 · Property 13 (Sin fugas tras destroy) — Req 8.4
   ═══════════════════════════════════════════════════════════════ */

test('Property 13 · destroy() libera observers, listeners de document/matchMedia y de las Piezas', () => {
  const dom = installDom();
  const { counters } = dom;
  const { panel, vis } = dom.makePanel('gw');

  const ctrl = initMediaMosaic(panel);
  assert.ok(ctrl, 'initMediaMosaic debe hidratar el panel gw');

  // Estado tras la hidratación: recursos efectivamente enganchados.
  assert.strictEqual(counters.ioInstances.length, 1, 'se crea un IntersectionObserver');
  assert.strictEqual(counters.ioObserved, 1, 'el observer observa el panel');
  assert.strictEqual(counters.ioDisconnected, 0, 'aún no se ha desconectado');
  assert.ok(
    counters.docListeners.some(function (l) { return l.type === 'visibilitychange'; }),
    'se registra el listener de visibilitychange en document'
  );
  assert.strictEqual(counters.mmListeners, 1, 'se registra un listener change en matchMedia (reduced-motion)');
  const elBefore = counters.elementListeners;
  assert.ok(elBefore > 0, 'hay listeners enganchados en el mosaico/Piezas (fue ' + elBefore + ')');

  // ── destroy() ──
  ctrl.destroy();

  // IntersectionObserver desconectado (Req 8.4).
  assert.strictEqual(counters.ioDisconnected, 1, 'destroy() desconecta el IntersectionObserver');

  // Listener de visibilitychange retirado de document.
  assert.ok(
    !counters.docListeners.some(function (l) { return l.type === 'visibilitychange'; }),
    'destroy() retira el listener de visibilitychange'
  );
  assert.strictEqual(counters.docListeners.length, 0, 'no quedan listeners en document');

  // Listener de matchMedia (reduced-motion) retirado.
  assert.strictEqual(counters.mmListeners, 0, 'destroy() retira el listener change de matchMedia');

  // Todos los listeners de elementos (mosaic + Piezas + medios) retirados.
  assert.strictEqual(counters.elementListeners, 0, 'destroy() retira todos los listeners de elementos');

  // La marca de hidratación se limpia (rehidratación posible).
  assert.strictEqual(
    vis.dataset.mosaicReady, undefined,
    'destroy() limpia vis.dataset.mosaicReady (permite re-hidratar)'
  );

  // destroy() idempotente: una segunda llamada no altera los recuentos.
  ctrl.destroy();
  assert.strictEqual(counters.ioDisconnected, 1, 'destroy() es idempotente (no re-desconecta)');
  assert.strictEqual(counters.elementListeners, 0, 'destroy() idempotente: sigue sin listeners de elementos');
});

/* ═══════════════════════════════════════════════════════════════
   TEST 3 · Hidratación idempotente — Req 8.2 (soporte de 12.3)
   ═══════════════════════════════════════════════════════════════ */

test('Property 11 (apoyo) · re-init devuelve el MISMO controlador (sin duplicar) antes de destroy', () => {
  const dom = installDom();
  const { counters } = dom;
  const { panel, vis } = dom.makePanel('gw');

  const ctrl1 = initMediaMosaic(panel);
  assert.ok(ctrl1, 'primera hidratación');

  const tilesAfterFirst = tilesOf(vis).length;
  const ioAfterFirst = counters.ioInstances.length;
  const listenersAfterFirst = counters.elementListeners;

  const ctrl2 = initMediaMosaic(panel);
  assert.strictEqual(ctrl2, ctrl1, 're-init devuelve el mismo MosaicController (idempotente)');

  // Sin duplicar Piezas, observers ni listeners.
  assert.strictEqual(tilesOf(vis).length, tilesAfterFirst, 're-init no duplica Piezas');
  assert.strictEqual(counters.ioInstances.length, ioAfterFirst, 're-init no crea otro IntersectionObserver');
  assert.strictEqual(counters.elementListeners, listenersAfterFirst, 're-init no añade listeners');

  ctrl1.destroy();
});
