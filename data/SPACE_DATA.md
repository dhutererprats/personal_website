# Home Space Widgets

The browser fetches current CelesTrak OMM elements and NASA's official APOD
WordPress entry directly, without a shared API key or third-party proxy. It
computes seven-day passes locally with vendored Satellite.js 7.1.0 in a worker.
City search uses Open-Meteo; Denver and Boulder resolve without a network request.

The default view is a lazily loaded Three.js globe, with drag/pinch/wheel and
keyboard rotation, zoom, pause and city-centering controls. The 2D map is optional
and its geographic data loads only when selected. Browsers without WebGL fall
back explicitly to the map; pass predictions remain available in either view.
Both orbital curves use propagated ECI positions transformed with Earth's
orientation fixed at the current instant. This preserves their physical altitude
and orbital plane; it is not the time-varying surface ground track. The Earth
uses WGS84 equatorial/polar radii and a local NASA Blue Marble texture. Path
thickness and city/station markers are enlarged for legibility. Rendering stops offscreen, in a
hidden tab, and in map mode; reduced-motion users start with auto-rotation off.

`stations.json` and `apod.json` are dated fallback snapshots, never invented data.
Refresh them before publishing with `python3 scripts/refresh_space_data.py`.
Orbital elements older than three days disable predictions; older NASA entries
remain usable but display their actual date. No background publish job is enabled.

Potential visibility requires elevation of at least 10 degrees, observer Sun
altitude at or below -6 degrees, and a solar-disc obscuration below 5 percent.
Rise/set times refer to the geometric horizon; the visible portion is shown
separately. Azimuth is clockwise from true north. Times use the selected city's
IANA timezone. Forecasts are estimates: maneuvers, terrain, weather and object
brightness are not modeled. Midnight alone does not determine an eclipse.

`station-land.json` is GeoJSON converted from World Atlas 2.0.2's `land-110m.json`
using TopoJSON Client 3.1.0. Natural Earth geographic data is public domain.
Source: https://github.com/topojson/world-atlas and https://www.naturalearthdata.com/.

Checks: `node --test tests/station-orbits.test.mjs tests/station-scene.test.mjs` and
`python3 -m unittest discover -s tests -p 'test_*.py'`.
