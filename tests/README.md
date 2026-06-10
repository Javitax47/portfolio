# tests/ — Dev-only test suite

These tests exist purely for development. They do **not** add any production
build, bundler, or runtime dependency to the portfolio, which remains a plain
HTML/CSS/JS site served as static files.

## How it works

- **Runner:** [`node --test`](https://nodejs.org/api/test.html) is Node's
  built-in test runner, available natively in **Node 18+** (this project is on
  Node 22). No extra test framework is installed and nothing is compiled.
- **Property-based testing:** [`fast-check`](https://github.com/dubzzz/fast-check)
  is the only `devDependency`. It is never shipped to the browser.
- **Module loading:** project modules (`js/media-manifest.js`,
  `js/media-mosaic.js`, …) use a CommonJS *export guard*:

  ```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { /* pure logic */ };
  }
  ```

  The same file runs as a browser `<script>` and is `require()`-able in Node.
  Use `tests/_helpers.js` (`requireProject('js/media-mosaic.js')`) to load them
  without depending on a test file's location on disk.

## Running the tests

```bash
npm install   # once, to fetch fast-check (dev only)
npm test      # runs `node --test` over the tests/ folder
```

> Running the tests requires `npm install` once to fetch `fast-check`. The
> portfolio itself needs no install step to run in a browser.
