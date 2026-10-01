# examples/standalone — original proof of concept

This is Helmet's first demo, written **before** the library existed: a canvas-drawn
page with its own `build/make_assets.py`, `src/worker.ts` and `client/app.js`. It is
kept unchanged as a historical reference.

For how to build a site on the packaged mechanism, see **`examples/minimal`** and the
root `README.md`. New work should use `@helmet/build`, `@helmet/worker`,
`@helmet/runtime` and the `helmet` CLI — not the scripts in this folder.
