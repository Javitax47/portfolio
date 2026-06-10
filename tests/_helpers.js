'use strict';
/* =============================================================
   tests/_helpers.js — Test support utilities (dev-only)
   Javier Portfolio · project-media-mosaic

   Purpose
   -------
   The portfolio is a vanilla HTML/CSS/JS site with NO build step.
   Project JS modules (e.g. js/media-manifest.js, js/media-mosaic.js)
   use a CommonJS "export guard" so the SAME file works both as a
   browser <script> and as a Node-importable module:

       if (typeof module !== 'undefined' && module.exports) {
         module.exports = { ... };
       }

   Because of that guard, a plain require() of the file path loads the
   module's pure logic in Node. These helpers resolve module paths
   relative to the project root so tests don't depend on their own
   location on disk.

   Tests run on Node's native test runner (node --test, built into
   Node 18+); fast-check supplies property-based generators. Both are
   devDependencies only and add NO production build. Run `npm install`
   once before `npm test`.
   ============================================================= */

const path = require('node:path');

/** Absolute path to the project root (parent of this tests/ folder). */
const ROOT = path.resolve(__dirname, '..');

/**
 * Resolve a path relative to the project root.
 * @param {...string} segments path segments, e.g. 'js', 'media-mosaic.js'
 * @returns {string} absolute path
 */
function fromRoot(...segments) {
  return path.join(ROOT, ...segments);
}

/**
 * Require a project module by its path relative to the project root.
 * Relies on the module's export guard (module.exports) being present.
 *
 * @param {string} relativePath e.g. 'js/media-manifest.js'
 * @returns {*} the module's exports
 *
 * @example
 *   const { getManifest } = requireProject('js/media-manifest.js');
 */
function requireProject(relativePath) {
  return require(fromRoot(relativePath));
}

module.exports = { ROOT, fromRoot, requireProject };
