# Three.js 0.186.1

`three.mjs` is a minified, tree-shaken ES-module bundle of Three.js and its
official OrbitControls addon. The MIT license is included. The renderer loads
only when the Home station widget becomes visible; no external CDN is required.

Source: https://github.com/mrdoob/three.js
Official npm package SHA-1: 6d50f70c2c437f844179bbb56d6f5b774e1ca38a

Reproduce from the website directory (dependencies stay outside the repository):

```sh
npm install --prefix /tmp/personal-website-3d-build three@0.186.1 esbuild@0.25.12
NODE_PATH=/tmp/personal-website-3d-build/node_modules /tmp/personal-website-3d-build/node_modules/.bin/esbuild vendor/three/entry.mjs --bundle --format=esm --minify --legal-comments=inline --outfile=vendor/three/three.mjs
```
