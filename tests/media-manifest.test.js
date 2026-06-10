'use strict';
/* =============================================================
   tests/media-manifest.test.js — Unit tests for getManifest()
   Javier Portfolio · project-media-mosaic

   Validates: Requirements 5.1
   -------------------------------------------------------------
   Requirement 5.1 (resumen): THE Manifiesto_de_Medios SHALL asociar
   cada proyecto (`data-proj`) con una lista ordenada de entre 1 y 12
   medios, donde cada medio declara un `type` ∈ {image, gif, video} y
   un `src` no vacio de a lo sumo 2048 caracteres.

   These are concrete unit tests on Node's native runner (node --test),
   so no extra dependency is required: `npm test` runs without install.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');

const { PROJECT_MEDIA, getManifest } =
  require('./_helpers.js').requireProject('js/media-manifest.js');

/** The 6 known projects declared in the manifest (data-proj keys). */
const KNOWN_PROJECTS = ['gw', 'nltl', 'cosmos', 'physdeck', 'mineralia', 'mario'];

/** Allowed media types per Requirement 5.1. */
const VALID_TYPES = new Set(['image', 'gif', 'video']);

/** Max src length per Requirement 5.1. */
const MAX_SRC_LEN = 2048;

// ── 1. Unknown / empty project keys return [] ────────────────────────────────
test('getManifest returns [] for an unknown project', () => {
  assert.deepStrictEqual(getManifest('does-not-exist'), []);
});

test('getManifest returns [] for an empty string key', () => {
  assert.strictEqual(getManifest('').length, 0);
  assert.deepStrictEqual(getManifest(''), []);
});

test('getManifest returns [] for non-string / nullish keys without throwing', () => {
  assert.deepStrictEqual(getManifest(undefined), []);
  assert.deepStrictEqual(getManifest(null), []);
  // Must not accidentally resolve inherited Object.prototype keys.
  assert.deepStrictEqual(getManifest('toString'), []);
  assert.deepStrictEqual(getManifest('hasOwnProperty'), []);
});

// ── 2. Known projects: non-empty array, same order & content as PROJECT_MEDIA ─
for (const key of KNOWN_PROJECTS) {
  test(`getManifest('${key}') returns the exact ordered list from PROJECT_MEDIA`, () => {
    const result = getManifest(key);
    assert.ok(Array.isArray(result), `getManifest('${key}') should return an array`);
    assert.ok(result.length >= 1, `getManifest('${key}') should be non-empty`);
    // Same order AND content as the source manifest.
    assert.deepStrictEqual(result, PROJECT_MEDIA[key]);
  });
}

// ── 3. Every item in every project satisfies Requirement 5.1 ─────────────────
test('every MediaItem has a valid type and a non-empty src <= 2048 chars', () => {
  for (const key of KNOWN_PROJECTS) {
    const items = getManifest(key);
    items.forEach((item, i) => {
      const where = `${key}[${i}]`;

      // type ∈ {image, gif, video}
      assert.ok(
        VALID_TYPES.has(item.type),
        `${where}.type must be one of {image,gif,video}, got ${JSON.stringify(item.type)}`
      );

      // src is a non-empty string of length <= 2048
      assert.strictEqual(typeof item.src, 'string', `${where}.src must be a string`);
      assert.ok(item.src.length > 0, `${where}.src must be non-empty`);
      assert.ok(
        item.src.length <= MAX_SRC_LEN,
        `${where}.src must be <= ${MAX_SRC_LEN} chars, got ${item.src.length}`
      );

      // Videos should declare a non-empty poster (design: poster recommended for video).
      if (item.type === 'video') {
        assert.strictEqual(typeof item.poster, 'string', `${where} (video) must declare a string poster`);
        assert.ok(item.poster.length > 0, `${where} (video) poster must be non-empty`);
      }
    });
  }
});

// ── 4. Sanity: exactly 6 known projects, each with 1..12 items ───────────────
test('there are exactly 6 known projects', () => {
  assert.strictEqual(Object.keys(PROJECT_MEDIA).length, 6);
  assert.deepStrictEqual(Object.keys(PROJECT_MEDIA).sort(), [...KNOWN_PROJECTS].sort());
});

test('each known project declares between 1 and 12 items (design says 4 each)', () => {
  for (const key of KNOWN_PROJECTS) {
    const n = getManifest(key).length;
    assert.ok(n >= 1 && n <= 12, `${key} should have 1..12 items, got ${n}`);
    // Design specifies 4 items per project for the current placeholders.
    assert.strictEqual(n, 4, `${key} is expected to have 4 items per the design`);
  }
});

// ── 5. Determinism: repeated calls return consistent data ────────────────────
test('getManifest returns consistent data across repeated calls', () => {
  for (const key of KNOWN_PROJECTS) {
    const a = getManifest(key);
    const b = getManifest(key);
    assert.deepStrictEqual(a, b, `getManifest('${key}') must be deterministic`);
  }
});
