import { json2satrec } from "./vendor/satellite.js/io.js";
import { propagate, gstime } from "./vendor/satellite.js/propagation.js";
import {
  eciToEcf,
  eciToGeodetic,
  ecfToLookAngles,
  degreesToRadians,
} from "./vendor/satellite.js/transforms.js";
import { sunPos } from "./vendor/satellite.js/sun.js";
import { shadowFraction } from "./vendor/satellite.js/shadow.js";

export const STATIONS = [
  { id: 25544, name: "ISS", color: "#168b8b" },
  { id: 48274, name: "Tianhe / Tiangong", color: "#ba7631" },
];
export const DAY = 86400000;
export const MAX_ELEMENT_AGE = 3 * DAY;
const DEG = 180 / Math.PI;
const AU_KM = 149597870.7;

export function observer(site) {
  return {
    latitude: degreesToRadians(site.latitude),
    longitude: degreesToRadians(site.longitude),
    height: Math.max(0, site.elevation || 0) / 1000,
  };
}

export function compass(degrees) {
  return [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(degrees / 22.5) % 16];
}

export function epochMs(omm) {
  return Date.parse(omm.EPOCH.endsWith("Z") ? omm.EPOCH : omm.EPOCH + "Z");
}
export function fresh(omm, now = Date.now()) {
  const age = now - epochMs(omm);
  return Number.isFinite(age) && age >= -DAY && age <= MAX_ELEMENT_AGE;
}
export function usableElements(records) {
  if (!Array.isArray(records))
    throw new Error("Orbital data is not a catalog.");
  return STATIONS.map((station) => {
    const omm = records.find(
      (record) => Number(record.NORAD_CAT_ID) === station.id,
    );
    if (
      !omm ||
      ![omm.MEAN_MOTION, omm.INCLINATION, omm.ECCENTRICITY].every(
        Number.isFinite,
      ) ||
      !Number.isFinite(epochMs(omm))
    )
      throw new Error("Incomplete orbital data.");
    return omm;
  });
}

export function position(record, ms) {
  const date = new Date(ms),
    state = propagate(record, date);
  if (!state || !state.position || !Number.isFinite(state.position.x))
    throw new Error("Orbit propagation failed.");
  const gmst = gstime(date),
    ecf = eciToEcf(state.position, gmst),
    gd = eciToGeodetic(state.position, gmst);
  return {
    state,
    ecf,
    gmst,
    latitude: gd.latitude * DEG,
    longitude: gd.longitude * DEG,
    height: gd.height,
    speed: Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z),
  };
}

export function sample(record, site, ms, light = true) {
  const p = position(record, ms),
    look = ecfToLookAngles(observer(site), p.ecf);
  const result = {
    time: ms,
    elevation: look.elevation * DEG,
    azimuth: (look.azimuth * DEG + 360) % 360,
  };
  if (light) {
    const sun = sunPos(ms / DAY + 2440587.5).rsun;
    const sunEcf = eciToEcf(
      { x: sun.x * AU_KM, y: sun.y * AU_KM, z: sun.z * AU_KM },
      p.gmst,
    );
    result.sunAltitude =
      ecfToLookAngles(observer(site), sunEcf).elevation * DEG;
    result.shadow = shadowFraction(sun, p.state.position);
    result.visible = visible(result);
  }
  return result;
}

export function visible(point) {
  return (
    point.elevation >= 10 && point.sunAltitude <= -6 && point.shadow < 0.05
  );
}

function crossing(record, site, a, b, rising) {
  while (b - a > 250) {
    const m = (a + b) / 2,
      above = sample(record, site, m, false).elevation > 0;
    if (above === rising) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

function peak(record, site, start, end) {
  let a = start,
    b = end;
  while (b - a > 250) {
    const x = a + (b - a) / 3,
      y = b - (b - a) / 3;
    if (
      sample(record, site, x, false).elevation <
      sample(record, site, y, false).elevation
    )
      a = x;
    else b = y;
  }
  return sample(record, site, (a + b) / 2);
}

function describePass(record, site, rise, set) {
  const maximum = peak(record, site, rise, set),
    points = [];
  for (let t = rise; t <= set; t += 2000) points.push(sample(record, site, t));
  points.push(sample(record, site, set));
  const windows = [];
  let segment = null;
  points.forEach((point) => {
    if (point.visible) {
      if (!segment) segment = { start: point, end: point, maximum: point };
      segment.end = point;
      if (point.elevation > segment.maximum.elevation) segment.maximum = point;
    } else if (segment) {
      windows.push(segment);
      segment = null;
    }
  });
  if (segment) windows.push(segment);
  // Exclude momentary threshold crossings, not actual observable intervals.
  const visibleWindows = windows.filter(
    (w) => w.end.time - w.start.time >= 10000,
  );
  let reason =
    "Favorable geometry; clouds and brightness still affect visibility.";
  if (!visibleWindows.length) {
    if (maximum.elevation < 10)
      reason = "Too low: the pass stays below 10 degrees.";
    else if (!points.some((p) => p.elevation >= 10 && p.sunAltitude <= -6))
      reason = "Daylight or bright twilight at the observer.";
    else
      reason =
        "Earth shadow: the station is not sufficiently sunlit during the dark-sky interval.";
  }
  return {
    rise: sample(record, site, rise),
    set: sample(record, site, set),
    maximum,
    visibleWindows,
    reason,
    visible: visibleWindows.length > 0,
  };
}

export function predict(omm, site, now = Date.now(), days = 7) {
  if (!fresh(omm, now))
    throw new Error(
      "Orbital elements are more than 3 days old. Refresh required.",
    );
  const record = json2satrec(omm),
    passes = [],
    step = 20000,
    end = now + days * DAY;
  let previous = now - 20 * 60000,
    elevation = sample(record, site, previous, false).elevation,
    rise = null;
  for (let t = previous + step; t <= end; t += step) {
    const next = sample(record, site, t, false).elevation;
    if (elevation <= 0 && next > 0)
      rise = crossing(record, site, previous, t, true);
    if (elevation > 0 && next <= 0 && rise !== null) {
      const set = crossing(record, site, previous, t, false);
      if (set > now) passes.push(describePass(record, site, rise, set));
      rise = null;
    }
    previous = t;
    elevation = next;
  }
  return { id: Number(omm.NORAD_CAT_ID), epoch: omm.EPOCH, passes };
}

export { json2satrec };
