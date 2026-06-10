'use strict';
/* =============================================================
   tests/integration.wiring.test.js
   Javier Portfolio · project-media-mosaic · Task 14.3

   Integration test of the WIRING (end-to-end at the media-mosaic
   level, with a minimal DOM stub + an injectable clock).

   Validates: Requirements 8.2, 8.3, 2.1

   ─────────────────────────────────────────────────────────────
   WHAT THIS COVERS (the real integration contract)
   ─────────────────────────────────────────────────────────────
   The real boot wiring lives in two files that are hard to unit
   test without a full browser:

     · js/ui.js — inside the boot IntersectionObserver, after
       `panel.classList.add('booted')`, it calls:
           initVis(panel);
           initMediaMosaic(panel);     // ← hydrates the mosaic
       (see ui.js, the `pio` observer).

     · js/bg-engine.js — inside `setLang()`, after updating
       `documentElement.dataset.lang`, it relabels every booted
       mosaic:
           document.querySelectorAll('.proj-vis')
             .forEach(v => v.__mosaicCtrl?.relabel());
       (see bg-engine.js, the `.proj-vis` loop).

   This test exercises EXACTLY those two calls:
     1. `initMediaMosaic(panel)`  — what ui.js runs on boot.
     2. `v.__mosaicCtrl.relabel()` — what bg-engine.js runs on
        language change (here invoked directly as `ctrl.relabel()`,
        which is the same object stored at `vis.__mosaicCtrl`).

   And it simulates the visibility gate firing `visible = true` by
   grabbing the IntersectionObserver instance the gate created and
   invoking its callback with `[{ isIntersecting: true, target }]`,
   which is how the panel "enters the viewport" in a real browser.

   ─────────────────────────────────────────────────────────────
   WHY A HAND-ROLLED DOM STUB (no jsdom)
   ─────────────────────────────────────────────────────────────
   The portfolio has no build step and jsdom is not installed.
   The runtime only touches a small, well-defined slice of the DOM
   (dataset, classList, style.setProperty, children/appendChild/
   removeChild, get/setAttribute, querySelector/All, closest,
   addEventListener/removeEventListener, focus, contains). We build
   that slice as a minimal stub — the same strategy used by the
   loader test (tests/media-mosaic.loader.test.js).

   The clock is "injectable" through the GLOBAL timer functions:
   the FocusScheduler/MediaLoader pick up `setTimeout`/`clearTimeout`
   from the global scope (exactly as they do in the browser when
   ui.js boots them). We replace those globals with a controllable
   fake so the test is hermetic (no real 3.2 s drift timer leaks)
   and so we can observe that a drift timer is armed once AUTO is
   reached.

   Runner: node --test (native, Node 18+). assert (no fast-check
   needed — this is an example-based integration test). Dev-only:
   adds no production build.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');

const { requireProject } = require('./_helpers.js');

/* getManifest / PROJECT_MEDIA must be reachable as globals BEFORE we
   require media-mosaic.js: that is how the browser sees them (both
   files are loaded as <script> globals; media-mosaic.js resolves the
   manifest through `safeGetManifest`, which reads the global). */
const manifest = requireProject('js/media-manifest.js');
global.getManifest = manifest.getManifest;
global.PROJECT_MEDIA = manifest.PROJECT_MEDIA;

const { initMediaMosaic } = requireProject('js/media-mosaic.js');

/* ─────────────────────────────────────────────────────────────
   MINIMAL DOM STUB
   ───────────────────────────────────────────────────────────── */

/** Very small CSS-selector matcher: '.cls', 'tag', 'tag.cls', '[attr]'. */
function elMatches(el, sel) {
  if (!el || el.nodeType !== 1) { return false; }
  sel = String(sel).trim();
  if (sel[0] === '[') {
    const name = sel.slice(1, sel.indexOf(']'));
    return el.hasAttribute(name);
  }
  let tag = null;
  let cls = null;
  const dot = sel.indexOf('.');
  if (dot >= 0) { tag = sel.slice(0, dot) || null; cls = sel.slice(dot + 1) || null; }
  else { tag = sel || null; }
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) { return false; }
  if (cls && !el.classList.contains(cls)) { return false; }
  return true;
}

/** Depth-first descendant query (document order). firstOnly short-circuits. */
function queryAll(root, sel, firstOnly) {
  const out = [];
  (function walk(node) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (elMatches(child, sel)) { out.push(child); if (firstOnly) { return true; } }
      if (walk(child)) { return true; }
    }
    return false;
  })(root);
  return out;
}

/** Build a minimal fake element. `img` reads `complete`/`naturalWidth`. */
function makeEl(tag) {
  const classes = new Set();
  const attrs = Object.create(null);
  const styleProps = Object.create(null);

  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    dataset: {},
    parentNode: null,
    children: [],
    textContent: '',
    // Images are treated as already decoded so ensureLoaded marks them
    // 'loaded' synchronously and clears its 10 s timeout (no leak).
    complete: true,
    naturalWidth: 1,
    _listeners: [],

    style: {
      setProperty: function (name, value) { styleProps[name] = String(value); },
      getPropertyValue: function (name) { return styleProps[name] || ''; },
      removeProperty: function (name) { delete styleProps[name]; }
    },

    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); },
      toggle: function (c, force) {
        if (force === true) { classes.add(c); return true; }
        if (force === false) { classes.delete(c); return false; }
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      }
    },

    setAttribute: function (name, value) { attrs[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    removeAttribute: function (name) { delete attrs[name]; },
    hasAttribute: function (name) {
      if (Object.prototype.hasOwnProperty.call(attrs, name)) { return true; }
      if (name.indexOf('data-') === 0) {
        const key = name.slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
        return el.dataset[key] !== undefined;
      }
      return false;
    },

    appendChild: function (child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild: function (child) {
      const i = el.children.indexOf(child);
      if (i >= 0) { el.children.splice(i, 1); child.parentNode = null; }
      return child;
    },
    contains: function (node) {
      if (node === el) { return true; }
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i];
        if (c === node || (typeof c.contains === 'function' && c.contains(node))) { return true; }
      }
      return false;
    },
    closest: function (sel) {
      let cur = el;
      while (cur) { if (elMatches(cur, sel)) { return cur; } cur = cur.parentNode; }
      return null;
    },
    querySelector: function (sel) { return queryAll(el, sel, true)[0] || null; },
    querySelectorAll: function (sel) { return queryAll(el, sel, false); },

    addEventListener: function (type, handler, opt) { el._listeners.push({ type: type, handler: handler, opt: opt }); },
    removeEventListener: function (type, handler) {
      el._listeners = el._listeners.filter(function (l) { return !(l.type === type && l.handler === handler); });
    },

    focus: function () { /* no-op: keyboard focus not exercised here */ }
  };

  // className mirrors the classes Set (buildMosaic sets `el.className = '...'`).
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
   INJECTABLE CLOCK + capturing IntersectionObserver
   ───────────────────────────────────────────────────────────── */

/** Controllable fake clock installed onto global setTimeout/clearTimeout. */
function makeClock() {
  let seq = 1;
  const timers = new Map();
  return {
    setTimeout: function (fn, ms) { const id = seq++; timers.set(id, { fn: fn, ms: ms }); return id; },
    clearTimeout: function (id) { timers.delete(id); },
    pending: function () { return timers.size; }
  };
}

/** Captured IntersectionObserver instances (the gate creates one per panel). */
let ioInstances = [];

class FakeIntersectionObserver {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = []; ioInstances.push(this); }
  observe(t) { this.targets.push(t); }
  unobserve(t) { this.targets = this.targets.filter(function (x) { return x !== t; }); }
  disconnect() { this.targets = []; }
}

/* ─────────────────────────────────────────────────────────────
   ENV install / teardown (per test, restoring originals)
   ───────────────────────────────────────────────────────────── */

function installEnv() {
  const saved = {
    document: global.document,
    matchMedia: global.matchMedia,
    IntersectionObserver: global.IntersectionObserver,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout
  };

  ioInstances = [];
  const clock = makeClock();

  const document = {
    hidden: false,
    documentElement: { dataset: { lang: 'es' } },
    createElement: function (tag) { return makeEl(tag); },
    _listeners: [],
    addEventListener: function (type, handler, opt) { document._listeners.push({ type: type, handler: handler, opt: opt }); },
    removeEventListener: function (type, handler) {
      document._listeners = document._listeners.filter(function (l) { return !(l.type === type && l.handler === handler); });
    }
  };

  global.document = document;
  global.matchMedia = function () {
    return {
      matches: false,
      media: '',
      addEventListener: function () {},
      removeEventListener: function () {},
      addListener: function () {},
      removeListener: function () {}
    };
  };
  global.IntersectionObserver = FakeIntersectionObserver;
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;

  function teardown() {
    global.document = saved.document;
    global.matchMedia = saved.matchMedia;
    global.IntersectionObserver = saved.IntersectionObserver;
    global.setTimeout = saved.setTimeout;
    global.clearTimeout = saved.clearTimeout;
  }

  return { document: document, clock: clock, teardown: teardown };
}

/** Build a fresh `article.proj-panel[data-proj] > div.proj-vis` for `proj`. */
function buildPanel(proj) {
  const panel = makeEl('article');
  panel.classList.add('proj-panel');
  panel.dataset.proj = proj;
  const vis = makeEl('div');
  vis.classList.add('proj-vis');
  panel.appendChild(vis);
  return { panel: panel, vis: vis };
}

/* Helpers to inspect the hydrated mosaic via the public DOM. */
function mosaicOf(vis) { return vis.querySelector('.proj-mosaic'); }
function tilesOf(vis) { const m = mosaicOf(vis); return m ? m.querySelectorAll('.mosaic-tile') : []; }
function focusTilesOf(vis) {
  return tilesOf(vis).filter(function (t) { return t.classList.contains('is-focus'); });
}
function imgOf(tile) { return tile.querySelector('img.mosaic-media') || tile.querySelector('img'); }

/** Find the IntersectionObserver the gate created for `panel` and fire it. */
function fireVisibility(panel, isIntersecting) {
  const io = ioInstances.find(function (o) { return o.targets.indexOf(panel) >= 0; });
  assert.ok(io, 'the VisibilityGate should have created an IntersectionObserver observing the panel');
  io.cb([{ isIntersecting: isIntersecting, target: panel }]);
}

/* Expected gw captions (js/media-manifest.js), used to assert the language swap. */
const GW_CAPTION_ES_0 = 'Vista general del detector';
const GW_CAPTION_EN_0 = 'Detector overview';

/* ═══════════════════════════════════════════════════════════════
   TEST 1 · Boot/hydration + AUTO when visible and ¬RM
   (Req 8.2 hydration, Req 2.1 drift active when visible)
   ═══════════════════════════════════════════════════════════════ */
test('boot ⇒ hydrated, item 0 loaded, and AUTO once visible (¬reducedMotion)', () => {
  const env = installEnv();
  const { panel, vis } = buildPanel('gw');
  let ctrl = null;

  try {
    // (1) This is EXACTLY the call ui.js makes on boot.
    ctrl = initMediaMosaic(panel);

    // Hydration contract (Req 8.2).
    assert.ok(ctrl, 'initMediaMosaic should return a MosaicController');
    assert.strictEqual(vis.dataset.mosaicReady, '1', 'vis should be marked hydrated (mosaicReady=1)');

    const tiles = tilesOf(vis);
    assert.strictEqual(tiles.length, 4, 'gw declares 4 valid media ⇒ 4 tiles');

    // Initial state: all tiles are neutral (no focus by default).
    tiles.forEach(function (t) {
      assert.ok(t.classList.contains('is-neutral'), 'all tiles start in is-neutral (no default focus)');
    });

    // Item 0 is LOADED: its <img> has a real `src` (preloadStills runs at hydration).
    const tile0 = tiles[0];
    const tile0Img = imgOf(tile0);
    assert.ok(tile0Img, 'tile 0 has an <img>');
    const src = tile0Img.getAttribute('src');
    assert.ok(typeof src === 'string' && src.trim() !== '', 'tile 0 img has a non-empty src attribute');
    assert.ok(tile0Img.classList.contains('loaded'), 'tile 0 img is marked .loaded');

    // Before the panel enters the viewport, the gate keeps the mosaic paused.
    assert.strictEqual(ctrl.getMode(), 'PAUSED_OFFSCREEN', 'not visible yet ⇒ paused offscreen');
    assert.strictEqual(env.clock.pending(), 0, 'no drift timer armed while paused');

    // (2) Simulate the panel entering the viewport (IntersectionObserver fires).
    fireVisibility(panel, true);

    // Visible ∧ docVisible ∧ ¬reducedMotion ∧ ¬pinned ⇒ AUTO with drift active (Req 2.1).
    assert.strictEqual(ctrl.getMode(), 'AUTO', 'visible & ¬RM ⇒ mode AUTO');
    assert.ok(env.clock.pending() >= 1, 'AUTO arms a single drift timer (drift active)');

    // No-leak sanity: destroy clears the armed timer.
    ctrl.destroy();
    assert.strictEqual(env.clock.pending(), 0, 'destroy() clears the drift timer');
  } finally {
    try { if (ctrl) { ctrl.destroy(); } } catch (e) { /* idempotent */ }
    env.teardown();
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 2 · Idempotent hydration (Req 8.2)
   Re-invoking initMediaMosaic returns the SAME controller and does
   not duplicate tiles or mosaics.
   ═══════════════════════════════════════════════════════════════ */
test('initMediaMosaic is idempotent: same controller, no duplicate tiles', () => {
  const env = installEnv();
  const { panel, vis } = buildPanel('gw');
  let ctrl = null;

  try {
    const ctrl1 = initMediaMosaic(panel);
    const ctrl2 = initMediaMosaic(panel);
    ctrl = ctrl1;

    assert.ok(ctrl1, 'first hydration returns a controller');
    assert.strictEqual(ctrl2, ctrl1, 'second hydration returns the SAME controller instance');
    assert.strictEqual(vis.__mosaicCtrl, ctrl1, 'vis.__mosaicCtrl points at the controller (ui.js/bg-engine.js contract)');

    assert.strictEqual(vis.querySelectorAll('.proj-mosaic').length, 1, 'only one .proj-mosaic exists');
    assert.strictEqual(tilesOf(vis).length, 4, 'tile count stays 4 after re-hydration');
  } finally {
    try { if (ctrl) { ctrl.destroy(); } } catch (e) { /* idempotent */ }
    env.teardown();
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 3 · Language change ⇒ captions/aria updated (Req 8.3)
   Mirrors bg-engine.js setLang(): set documentElement.dataset.lang
   then call the mosaic controller's relabel() (the object stored at
   vis.__mosaicCtrl).
   ═══════════════════════════════════════════════════════════════ */
test('language change ⇒ relabel() swaps tile 0 alt es→en', () => {
  const env = installEnv();
  const { panel, vis } = buildPanel('gw');
  let ctrl = null;

  try {
    ctrl = initMediaMosaic(panel);
    assert.ok(ctrl, 'controller hydrated');

    // Use tile 0 directly (neutral state: no focused tile by default).
    const tile0 = tilesOf(vis)[0];
    const tile0Img = imgOf(tile0);
    assert.strictEqual(tile0Img.getAttribute('alt'), GW_CAPTION_ES_0, 'initial alt uses the Spanish caption');

    // This is what bg-engine.js does inside setLang('en'):
    //   documentElement.dataset.lang = 'en';
    //   vis.__mosaicCtrl.relabel();
    env.document.documentElement.dataset.lang = 'en';
    vis.__mosaicCtrl.relabel();

    assert.strictEqual(tile0Img.getAttribute('alt'), GW_CAPTION_EN_0, 'after relabel the alt uses the English caption');
    assert.notStrictEqual(tile0Img.getAttribute('alt'), GW_CAPTION_ES_0, 'the alt actually changed from the Spanish caption');
  } finally {
    try { if (ctrl) { ctrl.destroy(); } } catch (e) { /* idempotent */ }
    env.teardown();
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 4 (optional) · Offscreen ⇒ PAUSED_OFFSCREEN (Req 6.1 via gate)
   Firing the IntersectionObserver with isIntersecting:false pauses
   the mosaic, complementing the AUTO transition above.
   ═══════════════════════════════════════════════════════════════ */
test('offscreen via IntersectionObserver ⇒ mode PAUSED_OFFSCREEN', () => {
  const env = installEnv();
  const { panel } = buildPanel('gw');
  let ctrl = null;

  try {
    ctrl = initMediaMosaic(panel);
    fireVisibility(panel, true);
    assert.strictEqual(ctrl.getMode(), 'AUTO', 'enters AUTO when visible');

    fireVisibility(panel, false);
    assert.strictEqual(ctrl.getMode(), 'PAUSED_OFFSCREEN', 'leaving the viewport pauses the mosaic');
    assert.strictEqual(env.clock.pending(), 0, 'no drift timer remains while paused offscreen');
  } finally {
    try { if (ctrl) { ctrl.destroy(); } } catch (e) { /* idempotent */ }
    env.teardown();
  }
});
