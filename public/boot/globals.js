// Globals some dependencies expect before any module runs: `global` and `process.env`.
//
// This was an inline <script> in index.html. The Content-Security-Policy's
// script-src 'self' blocks inline scripts, so it is a file loaded from this origin
// instead, in the same place in the page, before the app's module script.
// scripts/guard-security-headers.mjs fails if an inline script comes back.
if (typeof global === 'undefined') {
  var global = globalThis;
}
if (typeof process === 'undefined') {
  var process = { env: {} };
}
