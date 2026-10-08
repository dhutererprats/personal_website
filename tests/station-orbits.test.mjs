import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  STATIONS,
  DAY,
  predict,
  visible,
  compass,
  fresh,
  usableElements,
  json2satrec,
  sample,
  epochMs,
} from "../station-orbits.mjs";
import { shadowFraction } from "../vendor/satellite.js/shadow.js";

const elements = JSON.parse(
  fs.readFileSync(new URL("../data/stations.json", import.meta.url)),
).elements;
const denver = { latitude: 39.73915, longitude: -104.9847, elevation: 1609 };
const now = Math.max(...elements.map(epochMs));
const predictions = elements.map((omm) => predict(omm, denver, now));

test("station identities and catalog validation", () => {
  assert.deepEqual(
    STATIONS.map((s) => s.id),
    [25544, 48274],
  );
  assert.equal(usableElements(elements).length, 2);
  assert.throws(() => usableElements([]));
});
test("stale orbital data is never presented as current", () => {
  assert.equal(fresh(elements[0], epochMs(elements[0]) + 4 * DAY), false);
  assert.throws(() =>
    predict(elements[0], denver, epochMs(elements[0]) + 4 * DAY),
  );
});
test("visibility requires elevation, dark observer sky and a sunlit station", () => {
  assert.equal(visible({ elevation: 30, sunAltitude: -15, shadow: 0 }), true);
  assert.equal(visible({ elevation: 30, sunAltitude: -45, shadow: 1 }), false);
  assert.equal(visible({ elevation: 30, sunAltitude: 5, shadow: 0 }), false);
  assert.equal(visible({ elevation: 5, sunAltitude: -15, shadow: 0 }), false);
});
test("physical eclipse geometry distinguishes sunward and nightside satellites", () => {
  assert.equal(
    shadowFraction({ x: 1, y: 0, z: 0 }, { x: 6800, y: 0, z: 0 }),
    0,
  );
  assert.equal(
    shadowFraction({ x: 1, y: 0, z: 0 }, { x: -6800, y: 0, z: 0 }),
    1,
  );
});
test("both stations have ordered, refined horizon crossings and real peaks", () => {
  for (const result of predictions) {
    assert.ok(result.passes.length > 10);
    let previous = now - 1;
    for (const pass of result.passes) {
      assert.ok(pass.set.time > previous);
      previous = pass.set.time;
      assert.ok(Math.abs(pass.rise.elevation) < 0.08);
      assert.ok(Math.abs(pass.set.elevation) < 0.08);
      assert.ok(
        pass.rise.time < pass.maximum.time && pass.maximum.time < pass.set.time,
      );
      assert.ok(pass.maximum.elevation > 0 && pass.maximum.elevation <= 90);
      assert.ok(pass.rise.azimuth >= 0 && pass.rise.azimuth < 360);
    }
  }
});
test("every viewing window satisfies the criteria, including eclipse transitions", () => {
  let count = 0;
  for (const result of predictions)
    for (const pass of result.passes)
      for (const window of pass.visibleWindows) {
        count++;
        assert.ok(
          window.start.visible && window.end.visible && window.maximum.visible,
        );
        assert.ok(window.end.time - window.start.time >= 10000);
        assert.ok(
          window.start.time >= pass.rise.time &&
            window.end.time <= pass.set.time,
        );
      }
  assert.ok(count > 0);
});
test("an in-progress pass remains available when recalculating", () => {
  const pass = predictions[0].passes[0];
  const result = predict(elements[0], denver, pass.maximum.time, 1);
  assert.ok(Math.abs(result.passes[0].rise.time - pass.rise.time) < 500);
  assert.ok(result.passes[0].rise.time < pass.maximum.time);
});
test("compass and observer-dependent angles", () => {
  assert.equal(compass(0), "N");
  assert.equal(compass(90), "E");
  assert.equal(compass(180), "S");
  assert.equal(compass(270), "W");
  assert.equal(compass(359), "N");
  const record = json2satrec(elements[0]);
  assert.notEqual(
    sample(record, denver, now).elevation,
    sample(record, { latitude: 0, longitude: 0 }, now).elevation,
  );
});
