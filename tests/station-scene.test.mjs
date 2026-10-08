import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { json2satrec, position, epochMs } from "../station-orbits.mjs";
import {
  EARTH_RADIUS_KM,
  POLAR_SCALE,
  scenePoint,
  cityPoint,
  orbitPoints,
  behindEarth,
  sunDirection,
} from "../station-scene-math.mjs";

const elements = JSON.parse(
  fs.readFileSync(new URL("../data/stations.json", import.meta.url)),
).elements;
const now = Math.max(...elements.map(epochMs));
const magnitude = (point) => Math.hypot(...point);
test("ECEF-to-scene transform preserves true altitude and north/east orientation", () => {
  assert.deepEqual(scenePoint({ x: EARTH_RADIUS_KM, y: 0, z: 0 }), [1, 0, -0]);
  assert.deepEqual(scenePoint({ x: 0, y: EARTH_RADIUS_KM, z: 0 }), [0, 0, -1]);
  assert.deepEqual(scenePoint({ x: 0, y: 0, z: EARTH_RADIUS_KM }), [0, 1, -0]);
});
test("both 3D orbits stay above Earth at physical LEO altitudes", () => {
  for (const omm of elements) {
    const record = json2satrec(omm),
      points = orbitPoints(record, now);
    assert.equal(points.length, 181);
    assert.deepEqual(points[0], scenePoint(position(record, now).ecf));
    for (const point of points) {
      assert.ok(magnitude(point) > 1.04);
      assert.ok(magnitude(point) < 1.09);
    }
    assert.ok(
      magnitude(points[0].map((value, index) => value - points.at(-1)[index])) <
        0.025,
    );
  }
});
test("3D orbit planes use one Earth orientation instead of drawing ground tracks", () => {
  const points = orbitPoints(json2satrec(elements[0]), now);
  const a = points[0],
    b = points[45];
  const normal = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = magnitude(normal);
  const distances = points.map(
    (point) =>
      Math.abs(
        point.reduce((sum, value, index) => sum + value * normal[index], 0),
      ) / norm,
  );
  assert.ok(Math.max(...distances) < 0.012);
});
test("selected city marker lies just outside the oblate Earth", () => {
  for (const site of [
    { latitude: 0, longitude: 0 },
    { latitude: 90, longitude: 0 },
    { latitude: 39.73915, longitude: -104.9847, elevation: 1609 },
  ]) {
    const point = cityPoint(site);
    assert.ok(Math.hypot(point[0], point[1] / POLAR_SCALE, point[2]) > 1);
  }
});
test("Earth occludes far-side labels, not markers in front or outside the limb", () => {
  assert.equal(behindEarth([0, 0, -1.06], [0, 0, 3.6]), true);
  assert.equal(behindEarth([0, 0, 1.06], [0, 0, 3.6]), false);
  assert.equal(behindEarth([1.5, 0, 0], [0, 0, 3.6]), false);
});
test("solar lighting direction is finite and changes with Earth rotation", () => {
  const record = json2satrec(elements[0]);
  const a = sunDirection(now, position(record, now).gmst),
    b = sunDirection(now + 3600000, position(record, now + 3600000).gmst);
  assert.ok(a.every(Number.isFinite) && magnitude(a) > 0);
  assert.notDeepEqual(a, b);
});
