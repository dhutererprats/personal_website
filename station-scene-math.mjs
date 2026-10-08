import { position } from "./station-orbits.mjs";
import { eciToEcf, geodeticToEcf } from "./vendor/satellite.js/transforms.js";
import { observer } from "./station-orbits.mjs";
import { sunPos } from "./vendor/satellite.js/sun.js";

export const EARTH_RADIUS_KM = 6378.137;
export const POLAR_SCALE = 6356.7523142 / EARTH_RADIUS_KM;

// Three.js is Y-up; ECEF is Z-north. Preserve a right-handed frame.
export function scenePoint(ecf) {
  return [
    ecf.x / EARTH_RADIUS_KM,
    ecf.z / EARTH_RADIUS_KM,
    -ecf.y / EARTH_RADIUS_KM,
  ];
}

export function cityPoint(site) {
  return scenePoint(geodeticToEcf(observer(site))).map(
    (value) => value * 1.008,
  );
}

export function orbitPoints(record, now, steps = 180) {
  const rotation = position(record, now).gmst;
  const period = ((2 * Math.PI) / record.no) * 60000;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const state = position(record, now + (index / steps) * period).state;
    // Freeze Earth's orientation at now: this is an orbit, not a ground track.
    return scenePoint(eciToEcf(state.position, rotation));
  });
}

export function sunDirection(now, gmst) {
  return scenePoint(eciToEcf(sunPos(now / 86400000 + 2440587.5).rsun, gmst));
}

export function behindEarth(point, camera) {
  const p = [point[0], point[1] / POLAR_SCALE, point[2]];
  const c = [camera[0], camera[1] / POLAR_SCALE, camera[2]];
  const d = p.map((value, index) => value - c[index]);
  const dot = (a, b) =>
    a.reduce((sum, value, index) => sum + value * b[index], 0);
  const t = -dot(c, d) / dot(d, d);
  return (
    t > 0 &&
    t < 1 &&
    Math.hypot(...c.map((value, index) => value + t * d[index])) < 0.999
  );
}
