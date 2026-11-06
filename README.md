# Roomform — DWG → Soundvision

Static browser tool for converting DWG Polyface / 3DFACE room surfaces to Soundvision TXT.
Built for GitHub Pages: no server, uploads, API keys, npm installation or runtime CDNs.

## Use

Choose a DWG, confirm its units, turn off unneeded blocks and download TXT. In Soundvision,
use **3D room data → Import 3D room data**. Set audience surfaces and listening levels there.

Model-space geometry and nested block transforms are retained; hidden entities / layers are
excluded. Planar connected meshes are merged only when their outer boundary is a single
loop and the merged area matches. Interior holes retain their original tessellation.
The original door notches remain. The exact Vectorworks text header selects the correct
Soundvision import path; a generic / SketchUp header failed for the polygon export.

Polyface face indices are read through the raw WebAssembly API. The high-level JS database
converter in the pinned upstream package does not preserve these polyface meshes.

## Run locally

Serve this folder with a static HTTP server, then open `/dist/`. Opening `index.html` as a
`file://` URL will not work because browser workers and WASM need HTTP(S).

```sh
python3 -m http.server 8000
```

Tests (Node 20+):

```sh
bash scripts/gate.sh
DWG_FIXTURE='/absolute/path/to/local.dwg' SV_REFERENCE='/path/to/known-good.txt' bash scripts/gate.sh
```

The optional DWG check is a local regression for the original model: 9 room surfaces,
184.706912 m² floor. The private model and its coordinates are **not** included in this repo.
The browser QA script in `tests/browser.mjs` uses local Playwright and a local DWG fixture;
configure its paths for another machine. It covers upload, WASM execution, block filtering,
export download, scale changes, merge on/off, empty selection recovery, corrupt DWG and
mobile layout. Runtime requests are GET-only; no drawing is uploaded.

## Limits

DWG only; 50 MiB input, 300,000 supported faces, no inference from 2D plans. ACIS solids,
regions and external references are not converted. Unsupported entities are listed in the
UI so a partial export is visible. Sources grouped by block name can be excluded together.
Geometry is not an acoustic prediction. Check dimensions and imported surfaces in Soundvision.
No claims of arbitrary-DWG compatibility: end-to-end regression uses one real architectural
model plus synthetic geometry tests. Browser testing uses Chromium; Safari has not been tested.

## Hosting

The feature branch is published directly with GitHub Pages (source: repository root).
The root landing page redirects to `dist/`. Main is not modified or merged as part of delivery.
Every runtime asset uses relative paths so project-subdirectory hosting works.

## License and third-party source

GPL-3.0-or-later. See `LICENSE`. Includes `@mlightcad/libredwg-web` **0.8.4**, GPL-3.0,
based on GNU LibreDWG. No changes were made to its generated JS/WASM files.
Corresponding source and build instructions:

- https://github.com/mlightcad/libredwg-web/tree/1e8972121130198dee363478b47f89b944842276
- https://github.com/mlightcad/libredwg-web/archive/1e8972121130198dee363478b47f89b944842276.tar.gz
- `bindings/javascript/README.md` and `bindings/javascript/package.json` in that source tree.

The original package is available from the npm registry as
`@mlightcad/libredwg-web@0.8.4`. Runtime checksums are recorded in `THIRD_PARTY.json`.

Roomform is independent of L-Acoustics, Autodesk and Vectorworks.
