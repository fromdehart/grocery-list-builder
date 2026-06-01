# Test Results — grocery-list-builder
Date: Mon Jun  1 09:00:17 AM EDT 2026

## pnpm run build

> one-shot-template@0.1.0 build /home/mike/one-shots/grocery-list-builder
> vite build

vite v6.4.2 building for production...
transforming...
✓ 122 modules transformed.
Generated an empty chunk: "vendor".
rendering chunks...
computing gzip size...
dist/index.html                   1.58 kB │ gzip:  0.61 kB
dist/assets/index-DsBy5ud0.css   55.83 kB │ gzip:  9.98 kB
dist/assets/vendor-l0sNRNKZ.js    0.00 kB │ gzip:  0.02 kB
dist/assets/icons-BvyxZY-6.js     0.03 kB │ gzip:  0.05 kB
dist/assets/convex-D71ygHJT.js    0.03 kB │ gzip:  0.05 kB
dist/assets/ui-CMG1Ytdw.js        0.72 kB │ gzip:  0.46 kB
dist/assets/index-DqpuCFZa.js   125.18 kB │ gzip: 33.87 kB
dist/assets/router-BZsf2jue.js  160.68 kB │ gzip: 52.57 kB
✓ built in 6.61s
**PASS**

## npx convex codegen
Warning: Unknown property in `node`: `18`
  These properties will be preserved but are not recognized by this version of Convex.
Warning: Unknown properties in `convex.json`: `schema`, `auth`, `env`
  These properties will be preserved but are not recognized by this version of Convex.
Finding component definitions...
Generating server code...
Bundling component definitions...
Bundling component schemas and implementations...
Downloading current deployment state...
Uploading functions to Convex...
Generating TypeScript bindings...
Running TypeScript...
**PASS**

## TypeScript check
**PASS**

## Overall: ✅ ALL TESTS PASSED
