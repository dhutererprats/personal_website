import * as THREE from "./vendor/three/three.mjs";
import { STATIONS, position } from "./station-orbits.mjs";
import {
  POLAR_SCALE,
  scenePoint,
  cityPoint,
  orbitPoints,
  sunDirection,
  behindEarth,
} from "./station-scene-math.mjs";

export function createStationGlobe(container, { onRotationChange, onError }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10171b");
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 30);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "station-globe-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Interactive three-dimensional Earth with live ISS and Tianhe positions and their orbital paths",
  );
  container.replaceChildren(canvas);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.3;
  controls.maxDistance = 6;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
  controls.autoRotateSpeed = 0.25;
  controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  onRotationChange(controls.autoRotate);

  const earthMaterial = new THREE.MeshPhongMaterial({
    color: "#ffffff",
    shininess: 8,
    specular: "#355560",
  });
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    earthMaterial,
  );
  earth.scale.y = POLAR_SCALE;
  scene.add(earth, new THREE.AmbientLight("#d4e7ef", 1.5));
  const sunlight = new THREE.DirectionalLight("#ffffff", 2.5);
  scene.add(sunlight);
  const texture = new THREE.TextureLoader().load(
    "images/station-globe/earth-blue-marble-2048.jpg",
    (image) => {
      image.colorSpace = THREE.SRGBColorSpace;
      image.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      earthMaterial.map = image;
      earthMaterial.needsUpdate = true;
      canvas.dataset.texture = "loaded";
    },
    undefined,
    () => {
      earthMaterial.color.set("#377c91");
      canvas.dataset.texture = "unavailable";
    },
  );

  const city = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 12),
    new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  );
  scene.add(city);
  const labels = [...STATIONS.map((s) => s.name), "Denver"].map((text) => {
    const label = document.createElement("span");
    label.className = "station-globe-label";
    label.textContent = text;
    label.hidden = true;
    container.append(label);
    return label;
  });
  const colors = ["#53e4d2", "#ffbe69"];
  const satellites = STATIONS.map((station, index) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 12),
      new THREE.MeshBasicMaterial({ color: colors[index] }),
    );
    marker.visible = false;
    scene.add(marker);
    const orbit = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: colors[index],
        transparent: true,
        opacity: 0.9,
      }),
    );
    scene.add(orbit);
    labels[index].style.color = colors[index];
    return { marker, orbit };
  });
  let records = [],
    site = null,
    selected = 25544,
    enabled = false,
    inView = false,
    frame = 0,
    lastFrame = 0,
    lastPosition = 0,
    lastOrbit = 0,
    renderCount = 0,
    failed = false;

  function reset() {
    const target = new THREE.Vector3(
      ...(site ? cityPoint(site) : [0.4, 0.5, 0.8]),
    ).normalize();
    camera.position.copy(target.multiplyScalar(3.65));
    controls.target.set(0, 0, 0);
    controls.update();
    canvas.dataset.camera = camera.position
      .toArray()
      .map((v) => v.toFixed(4))
      .join(",");
  }
  function zoom(factor) {
    const distance = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, camera.position.length() * factor),
    );
    camera.position.setLength(distance);
    controls.update();
  }
  function updatePosition(now) {
    if (!records.length) return;
    records.forEach((record, index) => {
      const p = position(record, now);
      satellites[index].marker.position.set(...scenePoint(p.ecf));
      satellites[index].marker.visible = true;
      if (!index)
        sunlight.position
          .set(...sunDirection(now, p.gmst))
          .normalize()
          .multiplyScalar(8);
    });
    canvas.dataset.positionTime = String(now);
  }
  function updateOrbits(now) {
    records.forEach((record, index) => {
      const points = orbitPoints(record, now).map(
        (point) => new THREE.Vector3(...point),
      );
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      const geometry = new THREE.TubeGeometry(curve, 180, 0.006, 6, false);
      satellites[index].orbit.geometry.dispose();
      satellites[index].orbit.geometry = geometry;
    });
  }
  function placeLabels() {
    const width = container.clientWidth,
      height = container.clientHeight,
      points = [...satellites.map((s) => s.marker.position), city.position],
      placed = [];
    points.forEach((point, index) => {
      const label = labels[index],
        projection = point.clone().project(camera);
      label.hidden =
        !records.length ||
        behindEarth(point.toArray(), camera.position.toArray()) ||
        projection.z > 1 ||
        Math.abs(projection.x) > 1 ||
        Math.abs(projection.y) > 1;
      if (label.hidden) return;
      const x = Math.max(
        8,
        Math.min(
          width - label.offsetWidth - 8,
          ((projection.x + 1) / 2) * width + 11,
        ),
      );
      let y = Math.max(
        10,
        Math.min(height - 32, ((1 - projection.y) / 2) * height - 10),
      );
      for (const other of placed)
        if (Math.abs(x - other.x) < 145 && Math.abs(y - other.y) < 25)
          y = Math.min(height - 28, y + 27);
      label.style.left = x + "px";
      label.style.top = y + "px";
      placed.push({ x, y });
    });
  }
  function active() {
    return enabled && inView && !document.hidden && !failed;
  }
  function animate(timestamp) {
    frame = 0;
    if (!active()) return;
    try {
      const delta = lastFrame
        ? Math.min((timestamp - lastFrame) / 1000, 0.1)
        : 0;
      lastFrame = timestamp;
      controls.update(delta);
      const now = Date.now();
      if (now - lastPosition > 1000) {
        updatePosition(now);
        lastPosition = now;
      }
      if (now - lastOrbit > 60000) {
        updateOrbits(now);
        lastOrbit = now;
      }
      renderer.render(scene, camera);
      placeLabels();
      renderCount++;
      if (renderCount % 30 === 1) {
        canvas.dataset.renderCount = String(renderCount);
        canvas.dataset.camera = camera.position
          .toArray()
          .map((v) => v.toFixed(4))
          .join(",");
      }
      frame = requestAnimationFrame(animate);
    } catch {
      failed = true;
      onError();
    }
  }
  function resume() {
    if (active() && !frame) {
      lastFrame = 0;
      frame = requestAnimationFrame(animate);
    } else if (!active() && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }
  function resize() {
    const width = container.clientWidth,
      height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    resume();
  }
  const visibility = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    resume();
  });
  visibility.observe(container);
  const sizing = new ResizeObserver(resize);
  sizing.observe(container);
  const onVisibility = () => resume();
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    failed = true;
    onError();
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.88);
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      zoom(1.12);
      return;
    }
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const angle = new THREE.Spherical().setFromVector3(camera.position);
    if (event.key === "ArrowLeft") angle.theta -= Math.PI / 24;
    if (event.key === "ArrowRight") angle.theta += Math.PI / 24;
    if (event.key === "ArrowUp")
      angle.phi = Math.max(0.08, angle.phi - Math.PI / 24);
    if (event.key === "ArrowDown")
      angle.phi = Math.min(Math.PI - 0.08, angle.phi + Math.PI / 24);
    camera.position.setFromSpherical(angle);
    controls.update();
  });
  reset();
  resize();
  return {
    setEnabled(value) {
      enabled = value;
      resize();
      resume();
    },
    setRecords(value) {
      records = value;
      lastOrbit = 0;
      lastPosition = 0;
      if (!value.length) {
        satellites.forEach((s) => {
          s.marker.visible = false;
          s.orbit.visible = false;
        });
        labels.forEach((label) => (label.hidden = true));
      } else satellites.forEach((s) => (s.orbit.visible = true));
    },
    setSite(value) {
      site = value;
      city.position.set(...cityPoint(site));
      labels[2].textContent = site.name;
      reset();
    },
    setSelected(value) {
      selected = value;
      satellites.forEach((s, index) => {
        s.orbit.material.opacity = STATIONS[index].id === selected ? 1 : 0.85;
      });
    },
    toggleRotation() {
      controls.autoRotate = !controls.autoRotate;
      onRotationChange(controls.autoRotate);
    },
    reset,
    zoom,
    dispose() {
      enabled = false;
      resume();
      visibility.disconnect();
      sizing.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.dispose();
      texture.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      renderer.dispose();
    },
  };
}
