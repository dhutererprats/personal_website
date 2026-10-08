# Local Home Icons

Iconify Icon 1.0.7 (MIT) and eight Material Design Icons from
`@iconify-json/mdi` 1.2.3 (Apache-2.0, Pictogrammers).
Only the icons used on the home page are bundled, so the controls do not need
an external icon API or CDN at runtime.

Official sources: https://iconify.design/ and https://pictogrammers.com/library/mdi/.
The original licenses are included beside this file.

Build with `esbuild entry.mjs --bundle --format=esm --minify --legal-comments=inline
--outfile=icons.mjs` after installing the pinned packages. When packages are
installed outside this checkout, set `NODE_PATH` to that `node_modules` directory.
