import {
  STATIONS,
  DAY,
  fresh,
  usableElements,
  json2satrec,
  position,
  sample,
  compass,
  predict,
  epochMs,
} from "./station-orbits.mjs";

const ORBITS =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json";
const NASA =
  "https://science.nasa.gov/wp-json/wp/v2/image-article?categories=22766&per_page=1&_fields=title,content,link,date";
const DENVER = {
  name: "Denver",
  admin1: "Colorado",
  country: "United States",
  country_code: "US",
  latitude: 39.73915,
  longitude: -104.9847,
  elevation: 1609,
  timezone: "America/Denver",
};
const BOULDER = {
  name: "Boulder",
  admin1: "Colorado",
  country: "United States",
  country_code: "US",
  latitude: 40.015,
  longitude: -105.2705,
  elevation: 1624,
  timezone: "America/Denver",
};
const label = (site) =>
  [site.name, site.admin1, site.country].filter(Boolean).join(", ");
const node = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function cache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
async function fetchJson(url, timeout = 6500) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Data service unavailable.");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
function validSite(site) {
  return (
    site &&
    Number.isFinite(site.latitude) &&
    Math.abs(site.latitude) <= 90 &&
    Number.isFinite(site.longitude) &&
    Math.abs(site.longitude) <= 180 &&
    typeof site.timezone === "string"
  );
}
function safeUrl(value, hosts) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      hosts.some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseApod(post) {
  const page = new DOMParser().parseFromString(
    post.content?.rendered || "",
    "text/html",
  );
  const hero = page.querySelector(".media-detail-hero__media"),
    image = hero?.querySelector("img"),
    movie = hero?.querySelector("iframe,video");
  const title = page
    .querySelector(".hds-media-detail-hero h1, .hds-media-detail-hero h2")
    ?.textContent.trim();
  const metadata = {};
  page.querySelectorAll(".media-detail-hero__meta-row").forEach((row) => {
    const key = row.querySelector("th")?.textContent.trim().replace(/:\s*$/, "");
    if (key) metadata[key] = row.querySelector("td")?.textContent.trim();
  });
  const date = metadata.Date
    ? new Date(metadata.Date + " 12:00:00 GMT").toISOString().slice(0, 10)
    : post.date?.slice(0, 10);
  const url = safeUrl(post.link, ["science.nasa.gov"]);
  const media = image ? safeUrl(image.getAttribute("src"), ["nasa.gov"]) : null;
  const video = movie
    ? safeUrl(movie.getAttribute("src"), [
        "youtube.com",
        "youtube-nocookie.com",
        "vimeo.com",
        "nasa.gov",
      ])
    : null;
  if (!title || !date || !url || (!media && !movie))
    throw new Error("NASA did not return an APOD entry.");
  const preview = media ? new URL(media) : null;
  if (preview?.hostname === "assets.science.nasa.gov") {
    preview.searchParams.set("w", "960");
    preview.searchParams.delete("h");
    preview.searchParams.set("fit", "clip");
  }
  return {
    title,
    date,
    url,
    image_url: preview?.href || null,
    full_url: media,
    video_url: video,
    alt: image?.getAttribute("alt") || title,
    credit: metadata["Credit & License"] || metadata.Credit || "NASA Astronomy Picture of the Day",
    fetched_at: new Date().toISOString(),
  };
}

async function bootApod() {
  const frame = document.getElementById("apod-frame");
  if (!frame) return;
  const title = document.getElementById("apod-title"),
    date = document.getElementById("apod-date"),
    credit = document.getElementById("apod-credit"),
    status = document.getElementById("apod-status"),
    link = document.getElementById("apod-link");
  let displayed = null;
  function show(data) {
    if (!data?.date || !safeUrl(data.url, ["science.nasa.gov"])) return;
    if (displayed && data.date < displayed.date) return;
    displayed = data;
    title.textContent = data.title;
    date.textContent = data.date;
    credit.textContent = data.credit;
    link.href = data.url;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const today = ["year", "month", "day"]
      .map((name) => parts.find((part) => part.type === name).value)
      .join("-");
    status.textContent =
      data.date === today
        ? "Latest NASA entry"
        : "Latest available NASA entry · " + data.date;
    const imageUrl = safeUrl(data.image_url, ["nasa.gov"]);
    frame.replaceChildren();
    if (imageUrl) {
      const anchor = node("a");
      anchor.href = safeUrl(data.full_url, ["nasa.gov"]) || data.url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.setAttribute("aria-label", "Open full-resolution " + data.title);
      const image = node("img");
      image.alt = data.alt || data.title;
      image.decoding = "async";
      image.src = imageUrl;
      image.addEventListener(
        "error",
        () => {
          frame.replaceChildren(
            node(
              "p",
              "NASA image could not be loaded. Open the original entry below.",
            ),
          );
          status.textContent = "Image temporarily unavailable";
        },
        { once: true },
      );
      anchor.append(image);
      frame.append(anchor);
    } else {
      frame.append(node("p", "Today’s APOD is a video."));
      const video = node("a", "Watch on NASA");
      video.href = data.url;
      video.target = "_blank";
      video.rel = "noopener";
      frame.append(video);
    }
  }
  const cached = readCache("dhp-apod-v2");
  if (cached) show(cached);
  try {
    show(await fetchJson("data/apod.json"));
  } catch {
    /* Live NASA remains available. */
  }
  try {
    const data = await fetchJson(NASA),
      apod = parseApod(data[0]);
    show(apod);
    cache("dhp-apod-v2", apod);
  } catch {
    if (!displayed) {
      status.textContent = "NASA is temporarily unavailable";
      title.textContent = "Astronomy Picture of the Day";
      frame.replaceChildren(node("p", "Open NASA’s current entry below."));
    }
  }
}

async function bootStations() {
  const section = document.getElementById("station-tracker");
  if (!section) return;
  const input = document.getElementById("station-city"),
    form = document.getElementById("station-city-form"),
    suggestions = document.getElementById("station-city-options"),
    status = document.getElementById("station-search-status"),
    results = document.getElementById("station-passes"),
    dataStatus = document.getElementById("station-data-status"),
    current = document.getElementById("station-current"),
    map = document.getElementById("station-map"),
    globeHost = document.getElementById("station-globe"),
    globeTools = document.getElementById("station-globe-tools"),
    viewStatus = document.getElementById("station-view-status"),
    rotationButton = document.getElementById("station-globe-rotation");
  let site = DENVER,
    elements = [],
    records = [],
    world = null,
    selected = 25544,
    filter = "visible",
    prediction = null,
    requestId = 0,
    lookupId = 0,
    debounce,
    choices = [],
    activeChoice = -1,
    worker = null,
    view = "globe",
    globe = null,
    globePromise = null,
    mapDataPromise = null;
  input.value = "Denver";
  document.getElementById("station-location").textContent = label(site);
  function loadMapData() {
    if (mapDataPromise) return;
    mapDataPromise = fetchJson("data/station-land.json?v=2")
      .then((data) => {
        if (data.type === "MultiPolygon") {
          world = data;
          if (view === "map") tick();
        }
      })
      .catch(() => {});
  }
  function rotationState(rotating) {
    rotationButton.setAttribute("aria-pressed", String(rotating));
    rotationButton.setAttribute(
      "aria-label",
      rotating ? "Pause globe rotation" : "Resume globe rotation",
    );
    rotationButton.title = rotationButton.getAttribute("aria-label");
    rotationButton
      .querySelector("iconify-icon")
      .setAttribute("icon", rotating ? "mdi:pause" : "mdi:play");
  }
  function mapFallback() {
    globe?.dispose();
    globe = null;
    viewStatus.textContent =
      "3D is unavailable in this browser. Showing the 2D map.";
    const radio = section.querySelector(
      'input[name="station-view"][value="globe"]',
    );
    radio.disabled = true;
    section.querySelector('input[name="station-view"][value="map"]').checked =
      true;
    changeView("map");
  }
  async function initGlobe() {
    if (globePromise) return globePromise;
    globePromise = import("./station-globe.mjs?v=2")
      .then(({ createStationGlobe }) => {
        globe = createStationGlobe(globeHost, {
          onRotationChange: rotationState,
          onError: mapFallback,
        });
        globe.setRecords(records);
        globe.setSite(site);
        globe.setSelected(selected);
        globe.setEnabled(view === "globe");
        globeTools
          .querySelectorAll("button")
          .forEach((button) => (button.disabled = false));
      })
      .catch(mapFallback);
    return globePromise;
  }
  function changeView(value) {
    view = value;
    globeHost.hidden = view !== "globe";
    map.hidden = view !== "map";
    globeTools.hidden = view !== "globe";
    if (view === "globe") {
      globe?.setEnabled(true);
      initGlobe();
    } else {
      globe?.setEnabled(false);
      loadMapData();
      tick();
    }
  }
  section
    .querySelectorAll('input[name="station-view"]')
    .forEach((radio) =>
      radio.addEventListener("change", () => changeView(radio.value)),
    );
  rotationButton.addEventListener("click", () => globe?.toggleRotation());
  document
    .getElementById("station-globe-reset")
    .addEventListener("click", () => globe?.reset());
  document
    .getElementById("station-globe-zoom-in")
    .addEventListener("click", () => globe?.zoom(0.85));
  document
    .getElementById("station-globe-zoom-out")
    .addEventListener("click", () => globe?.zoom(1.15));
  initGlobe();
  try {
    worker = new Worker(new URL("./station-pass-worker.mjs", import.meta.url), {
      type: "module",
    });
  } catch {
    /* Compute after a paint if workers are unavailable. */
  }
  function time(ms, withDate = false) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: site.timezone,
      ...(withDate ? { weekday: "short", month: "short", day: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(ms);
  }
  const bearing = (point) =>
    compass(point.azimuth) + " " + (Math.round(point.azimuth) % 360) + "°";
  function displayPass(pass) {
    const entry = node("article", undefined, "station-pass"),
      window = pass.visibleWindows.find((w) => w.end.time > Date.now()),
      heading = node("h4", time(pass.rise.time, true));
    entry.append(
      heading,
      node(
        "p",
        pass.visible
          ? "Potentially visible · " +
              Math.round((window?.end.time - window?.start.time || 0) / 1000) +
              " s viewing window"
          : pass.reason,
        "station-pass-condition",
      ),
    );
    const metrics = node("dl", undefined, "station-pass-metrics");
    [
      ["Rise", time(pass.rise.time) + " · " + bearing(pass.rise)],
      [
        "Maximum",
        Math.round(pass.maximum.elevation) +
          "° · " +
          bearing(pass.maximum) +
          " · " +
          time(pass.maximum.time),
      ],
      ["Set", time(pass.set.time) + " · " + bearing(pass.set)],
    ].forEach(([name, value]) => {
      const group = node("div");
      group.append(node("dt", name), node("dd", value));
      metrics.append(group);
    });
    entry.append(metrics);
    if (window)
      entry.append(
        node(
          "p",
          "Visible portion: " +
            time(window.start.time) +
            " at " +
            bearing(window.start) +
            " (" +
            Math.round(window.start.elevation) +
            "°) to " +
            time(window.end.time) +
            " at " +
            bearing(window.end) +
            " (" +
            Math.round(window.end.elevation) +
            "°). Peak during this interval: " +
            Math.round(window.maximum.elevation) +
            "°.",
          "station-pass-window",
        ),
      );
    return entry;
  }
  function renderPasses() {
    if (!prediction) return;
    const result = prediction.find((r) => r.id === selected),
      station = STATIONS.find((s) => s.id === selected);
    results.replaceChildren(
      node(
        "h4",
        station.name +
          " · " +
          (filter === "visible"
            ? "Next visible opportunities"
            : "Next above-horizon passes"),
        "station-results-title",
      ),
    );
    const passes = result.passes.filter((p) => p.set.time > Date.now()),
      above = passes[0];
    if (above)
      results.append(
        node(
          "p",
          "Next above horizon: " +
            (above.rise.time < Date.now()
              ? "now, until " + time(above.set.time)
              : time(above.rise.time, true)) +
            ".",
          "station-next-horizon",
        ),
      );
    const shown = passes
      .filter(
        (p) =>
          filter === "all" ||
          p.visibleWindows.some((w) => w.end.time > Date.now()),
      )
      .slice(0, 3);
    if (!shown.length)
      results.append(
        node(
          "p",
          filter === "visible"
            ? "No pass meets the viewing criteria in the next 7 days. Above-horizon passes may still occur."
            : "No above-horizon passes predicted in the next 7 days.",
        ),
      );
    shown.forEach((pass) => results.append(displayPass(pass)));
  }
  function readyPrediction(data) {
    if (data.requestId !== requestId) return;
    if (data.error) {
      results.replaceChildren(node("p", data.error));
      status.textContent = "Pass predictions need fresh orbital data.";
      return;
    }
    prediction = data.results;
    renderPasses();
    status.textContent =
      "Times are local to " + site.name + " (" + site.timezone + ").";
  }
  if (worker) {
    worker.onmessage = (event) => readyPrediction(event.data);
    worker.onerror = () => {
      worker.terminate();
      worker = null;
      calculate();
    };
  }
  function calculate() {
    if (!elements.length) return;
    const id = ++requestId;
    prediction = null;
    results.replaceChildren(node("p", "Calculating passes…"));
    status.textContent = "Calculating both stations for " + site.name + "…";
    if (worker)
      worker.postMessage({ requestId: id, elements, site, now: Date.now() });
    else
      setTimeout(() => {
        try {
          readyPrediction({
            requestId: id,
            results: elements.map((omm) => predict(omm, site)),
          });
        } catch (error) {
          readyPrediction({ requestId: id, error: error.message });
        }
      }, 0);
  }
  function acceptElements(values, source) {
    const next = usableElements(values);
    if (!next.every((omm) => fresh(omm)))
      throw new Error("Orbital elements need a refresh.");
    if (
      elements.length &&
      next.some((omm, i) => epochMs(omm) < epochMs(elements[i]))
    )
      return;
    if (elements.length && JSON.stringify(elements) === JSON.stringify(next)) {
      dataStatus.textContent =
        "CelesTrak · " +
        source +
        " · orbit epochs " +
        elements.map((o) => o.EPOCH.slice(0, 16) + " UTC").join(" / ");
      return;
    }
    elements = next;
    records = elements.map(json2satrec);
    globe?.setRecords(records);
    dataStatus.textContent =
      "CelesTrak · " +
      source +
      " · orbit epochs " +
      elements.map((o) => o.EPOCH.slice(0, 16) + " UTC").join(" / ");
    calculate();
    tick();
  }
  function choose(value) {
    if (!validSite(value)) return;
    clearTimeout(debounce);
    lookupId++;
    site = value;
    globe?.setSite(site);
    input.value = site.name;
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    document.getElementById("station-location").textContent = label(site);
    calculate();
    tick();
  }
  function showChoices(values) {
    choices = values;
    activeChoice = -1;
    suggestions.replaceChildren();
    values.forEach((value, index) => {
      const option = node("button", label(value));
      option.type = "button";
      option.id = "station-option-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.addEventListener("click", () => choose(value));
      suggestions.append(option);
    });
    suggestions.hidden = !values.length;
    input.setAttribute("aria-expanded", String(values.length > 0));
  }
  async function cities(query) {
    const normalized = query.toLowerCase().trim();
    const known = [DENVER, BOULDER].find(
      (s) => s.name.toLowerCase() === normalized,
    );
    if (known) return [known];
    const cached = readCache("dhp-city-" + normalized);
    if (cached?.length && cached.every(validSite)) return cached;
    const pieces = query.split(",").map((s) => s.trim()),
      data = await fetchJson(
        "https://geocoding-api.open-meteo.com/v1/search?name=" +
          encodeURIComponent(pieces[0]) +
          "&count=8&language=en&format=json",
      );
    let matches = (data.results || []).filter(validSite);
    if (pieces[1])
      matches = matches.filter((s) =>
        label(s).toLowerCase().includes(pieces[1].toLowerCase()),
      );
    if (!matches.length)
      throw new Error("No city found. Try a city name and region.");
    cache("dhp-city-" + normalized, matches);
    return matches;
  }
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const id = ++lookupId,
      query = input.value.trim();
    if (query.length < 2) {
      showChoices([]);
      return;
    }
    debounce = setTimeout(async () => {
      try {
        const values = await cities(query);
        if (id === lookupId) showChoices(values);
      } catch (error) {
        if (id === lookupId) {
          showChoices([]);
          status.textContent = error.message;
        }
      }
    }, 250);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearTimeout(debounce);
      lookupId++;
      showChoices([]);
      return;
    }
    if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      choices.length &&
      !suggestions.hidden
    ) {
      event.preventDefault();
      activeChoice =
        (activeChoice + (event.key === "ArrowDown" ? 1 : -1) + choices.length) %
        choices.length;
      input.setAttribute(
        "aria-activedescendant",
        "station-option-" + activeChoice,
      );
      [...suggestions.children].forEach((e, i) =>
        e.setAttribute("aria-selected", String(i === activeChoice)),
      );
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearTimeout(debounce);
    const id = ++lookupId,
      query = input.value.trim();
    if (!query) {
      status.textContent = "Enter a city name.";
      input.focus();
      return;
    }
    if (activeChoice >= 0 && !suggestions.hidden) {
      choose(choices[activeChoice]);
      return;
    }
    status.textContent = "Finding " + query + "…";
    try {
      const values = await cities(query);
      if (id === lookupId) {
        choose(values[0]);
        if (values.length > 1) showChoices(values);
      }
    } catch (error) {
      if (id === lookupId) status.textContent = error.message;
    }
  });
  section.querySelectorAll('input[name="station"]').forEach((input) =>
    input.addEventListener("change", () => {
      selected = Number(input.value);
      globe?.setSelected(selected);
      renderPasses();
    }),
  );
  section
    .querySelectorAll('input[name="station-pass-filter"]')
    .forEach((input) =>
      input.addEventListener("change", () => {
        filter = input.value;
        renderPasses();
      }),
    );
  function drawMap(now) {
    const context = map.getContext("2d"),
      w = 900,
      h = 450;
    context.clearRect(0, 0, w, h);
    context.fillStyle = "#152023";
    context.fillRect(0, 0, w, h);
    const xy = (lon, lat) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
    context.strokeStyle = "#314145";
    context.lineWidth = 0.6;
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = xy(lon, 0)[0];
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, h);
      context.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = xy(0, lat)[1];
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(w, y);
      context.stroke();
    }
    if (world) {
      context.fillStyle = "#6b7c78";
      world.coordinates.forEach((polygon) => {
        // Unwrap dateline-crossing rings, then clip their translated copies.
        const rings = polygon.map((ring) => {
          let previous = ring[0][0];
          return ring.map(([lon, lat]) => {
            while (lon - previous > 180) lon -= 360;
            while (lon - previous < -180) lon += 360;
            previous = lon;
            return xy(lon, lat);
          });
        });
        [-w, 0, w].forEach((offset) => {
          context.beginPath();
          rings.forEach((ring) => {
            ring.forEach(([x, y], i) => {
              if (!i) context.moveTo(x + offset, y);
              else context.lineTo(x + offset, y);
            });
            context.closePath();
          });
          context.fill("evenodd");
        });
      });
    }
    records.forEach((record, index) => {
      context.strokeStyle = STATIONS[index].color;
      context.lineWidth = 2.3;
      context.beginPath();
      let previous = null;
      for (let t = now; t <= now + 92 * 60000; t += 60000) {
        const p = position(record, t),
          point = xy(p.longitude, p.latitude);
        if (!previous || Math.abs(point[0] - previous[0]) > w / 2)
          context.moveTo(...point);
        else context.lineTo(...point);
        previous = point;
      }
      context.stroke();
      const p = position(record, now),
        point = xy(p.longitude, p.latitude);
      context.fillStyle = STATIONS[index].color;
      context.beginPath();
      context.arc(...point, 6, 0, 2 * Math.PI);
      context.fill();
      context.font = "600 15px system-ui";
      context.fillStyle = "#fff";
      context.fillText(
        STATIONS[index].name,
        Math.min(w - 155, point[0] + 10),
        Math.max(20, point[1] - 10),
      );
    });
    const [x, y] = xy(site.longitude, site.latitude);
    context.strokeStyle = "#fff";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 5, 0, 2 * Math.PI);
    context.stroke();
  }
  function tick() {
    if (!records.length || document.hidden) return;
    if (!elements.every((omm) => fresh(omm))) {
      globe?.setRecords([]);
      current.replaceChildren(
        node("p", "Orbital data expired. Reload to refresh."),
      );
      return;
    }
    current.replaceChildren();
    const now = Date.now();
    try {
      records.forEach((record, index) => {
        const p = position(record, now),
          look = sample(record, site, now),
          row = node("div", undefined, "station-now");
        row.append(
          node("strong", STATIONS[index].name),
          node(
            "span",
            p.latitude.toFixed(1) +
              "° lat · " +
              p.longitude.toFixed(1) +
              "° lon · " +
              Math.round(p.height) +
              " km",
          ),
          node(
            "span",
            (look.elevation > 0 ? "Above horizon" : "Below horizon") +
              " · " +
              Math.round(look.elevation) +
              "° elevation · " +
              bearing(look),
          ),
        );
        current.append(row);
      });
      if (view === "map") drawMap(now);
    } catch {
      dataStatus.textContent = "Orbit propagation temporarily unavailable.";
    }
  }
  const cached = readCache("dhp-stations-v1");
  if (cached) {
    try {
      acceptElements(cached, "cached elements");
    } catch {}
  }
  try {
    const snapshot = await fetchJson("data/stations.json");
    acceptElements(snapshot.elements, "bundled elements");
  } catch {}
  async function refreshElements() {
    try {
      const live = usableElements(await fetchJson(ORBITS));
      acceptElements(live, "fresh elements");
      cache("dhp-stations-v1", live);
    } catch {
      if (!elements.length) {
        status.textContent =
          "Fresh orbital data unavailable. Predictions are disabled until the data refreshes.";
        results.replaceChildren();
        dataStatus.textContent =
          "CelesTrak unavailable; no current orbit available.";
      }
    }
  }
  await refreshElements();
  setInterval(tick, 5000);
  setInterval(() => {
    if (elements.length) {
      if (elements.every((omm) => fresh(omm))) calculate();
      else {
        results.replaceChildren(
          node("p", "Orbital data expired. Reload to refresh."),
        );
      }
    }
  }, 5 * 60000);
  setInterval(() => {
    if (!document.hidden) refreshElements();
  }, 60 * 60000);
}

const section = document.querySelector(".home-mission");
let started = false;
function boot() {
  if (started) return;
  started = true;
  bootStations();
  bootApod();
}
if (section && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        boot();
      }
    },
    { rootMargin: "300px" },
  );
  observer.observe(section);
} else boot();
