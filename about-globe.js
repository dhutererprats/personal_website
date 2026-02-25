(function () {
  var STOPS = [
    {
      id: "milan",
      flag: "🇮🇹",
      name: "Milan, Italy",
      lat: 45.4642,
      lon: 9.19,
      short: "Born and lived first 4 years.",
      details: "Born in Milan and lived there for the first four years.",
      links: [
        { label: "City", url: "https://www.google.com/maps/place/Milan,+Metropolitan+City+of+Milan,+Italy" }
      ]
    },
    {
      id: "moedling",
      flag: "🇦🇹",
      name: "Moedling, Austria",
      lat: 48.0867,
      lon: 16.2892,
      short: "Childhood years.",
      details: "Spent most of childhood years in Moedling, Austria.",
      links: [
        { label: "City", url: "https://www.google.com/maps/place/Modling,+Austria" }
      ]
    },
    {
      id: "riyadh",
      flag: "🇸🇦",
      name: "Riyadh, Saudi Arabia",
      lat: 24.7136,
      lon: 46.6753,
      short: "High school period.",
      details: "Moved to Saudi Arabia and completed high school there.",
      links: [
        { label: "City", url: "https://www.google.com/maps/place/Riyadh+Saudi+Arabia" }
      ]
    },
    {
      id: "abudhabi",
      flag: "🇦🇪",
      name: "Abu Dhabi, UAE",
      lat: 24.4539,
      lon: 54.3773,
      short: "BSc Physics at NYU Abu Dhabi.",
      details: "Completed undergraduate studies in Physics at NYU Abu Dhabi.",
      links: [
        { label: "NYU Abu Dhabi", url: "https://nyuad.nyu.edu/" }
      ]
    },
    {
      id: "nyc",
      flag: "🇺🇸",
      name: "New York City, USA",
      lat: 40.7128,
      lon: -74.006,
      short: "Study-away semester at NYU.",
      details: "Completed a study-away semester in New York City with NYU.",
      links: [
        { label: "NYU", url: "https://www.nyu.edu/" }
      ]
    },
    {
      id: "barcelona",
      flag: "🇪🇸",
      name: "Barcelona, Spain",
      lat: 41.3874,
      lon: 2.1686,
      short: "Master's in Aerospace.",
      details: "Completed a Master's in Aerospace Science and Technology in Barcelona.",
      links: [
        { label: "UPC", url: "https://www.upc.edu/en" }
      ]
    },
    {
      id: "toulouse",
      flag: "🇫🇷",
      name: "Toulouse, France",
      lat: 43.6047,
      lon: 1.4442,
      short: "Aerospace consultant and GNC roles.",
      details: "Worked in the aerospace sector in Toulouse as an aerospace consultant and GNC/systems engineer.",
      links: [
        { label: "ALTEN", url: "https://www.alten.com/" },
        { label: "Infinite Orbits", url: "https://www.infiniteorbits.io/" }
      ]
    },
    {
      id: "boulder",
      flag: "🇺🇸",
      name: "Boulder, Colorado, USA",
      lat: 40.015,
      lon: -105.2705,
      short: "PhD at CU Boulder.",
      details: "Current base for PhD research in Aerospace Engineering at CU Boulder AVS Lab.",
      links: [
        { label: "CU Aerospace", url: "https://www.colorado.edu/aerospace/" },
        { label: "AVS Lab", url: "https://hanspeterschaub.info/AVS/index.html" }
      ]
    }
  ];

  var STOP_BY_ID = Object.create(null);
  STOPS.forEach(function (stop) {
    STOP_BY_ID[stop.id] = stop;
  });

  function updateDetail(stop, buttonNodes, titleEl, textEl, linksEl) {
    if (!stop) {
      return;
    }

    titleEl.textContent = stop.flag + " " + stop.name;
    textEl.textContent = stop.details;
    linksEl.innerHTML = "";

    (stop.links || []).forEach(function (link) {
      var anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.textContent = link.label;
      linksEl.appendChild(anchor);
    });

    buttonNodes.forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-location") === stop.id);
    });
  }

  function initDetailPanelOnly() {
    var titleEl = document.getElementById("journey-detail-title");
    var textEl = document.getElementById("journey-detail-text");
    var linksEl = document.getElementById("journey-detail-links");
    var buttonNodes = Array.prototype.slice.call(document.querySelectorAll(".journey-stop[data-location]"));

    if (!titleEl || !textEl || !linksEl || !buttonNodes.length) {
      return;
    }

    buttonNodes.forEach(function (button) {
      button.addEventListener("click", function () {
        var stop = STOP_BY_ID[button.getAttribute("data-location")];
        updateDetail(stop, buttonNodes, titleEl, textEl, linksEl);
      });
    });

    updateDetail(STOP_BY_ID.boulder || STOPS[0], buttonNodes, titleEl, textEl, linksEl);
  }

  function initGlobe() {
    if (!window.d3 || !window.topojson) {
      initDetailPanelOnly();
      return;
    }

    var svgNode = document.getElementById("journey-globe");
    var tooltip = document.getElementById("globe-tooltip");
    var titleEl = document.getElementById("journey-detail-title");
    var textEl = document.getElementById("journey-detail-text");
    var linksEl = document.getElementById("journey-detail-links");
    var buttonNodes = Array.prototype.slice.call(document.querySelectorAll(".journey-stop[data-location]"));

    if (!svgNode || !titleEl || !textEl || !linksEl || !buttonNodes.length) {
      return;
    }

    svgNode.style.touchAction = "none";

    var width = 760;
    var height = 460;
    var projection = d3.geoOrthographic()
      .scale(205)
      .translate([width / 2, height / 2])
      .clipAngle(90)
      .precision(0.3)
      .rotate([18, -22, 0]);

    var path = d3.geoPath(projection);
    var svg = d3.select(svgNode);
    svg.selectAll("*").remove();

    var defs = svg.append("defs");
    var oceanGradient = defs.append("radialGradient")
      .attr("id", "oceanGradient")
      .attr("cx", "42%")
      .attr("cy", "34%");

    oceanGradient.append("stop").attr("offset", "0%").attr("stop-color", "#6bc2ff");
    oceanGradient.append("stop").attr("offset", "45%").attr("stop-color", "#2f7ac4");
    oceanGradient.append("stop").attr("offset", "100%").attr("stop-color", "#153f77");

    var globeLayer = svg.append("g");
    var sphere = globeLayer.append("path")
      .datum({ type: "Sphere" })
      .attr("fill", "url(#oceanGradient)")
      .attr("stroke", "rgba(255,255,255,0.45)")
      .attr("stroke-width", 1.2);

    var graticule = globeLayer.append("path")
      .datum(d3.geoGraticule10())
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.24)")
      .attr("stroke-width", 0.55);

    var countries = globeLayer.append("path")
      .attr("fill", "rgba(225, 180, 120, 0.86)")
      .attr("stroke", "rgba(20, 40, 55, 0.8)")
      .attr("stroke-width", 0.52);

    var dotGroup = globeLayer.append("g").attr("class", "journey-dots");
    var selectedStopId = null;
    var countryGeo = null;

    function projectStop(stop) {
      return projection([stop.lon, stop.lat]);
    }

    function positionTooltip(event) {
      if (!tooltip || tooltip.hasAttribute("hidden")) {
        return;
      }

      var panelRect = svgNode.getBoundingClientRect();
      tooltip.style.left = (event.clientX - panelRect.left) + "px";
      tooltip.style.top = (event.clientY - panelRect.top) + "px";
    }

    function showTooltip(event, stop) {
      if (!tooltip) {
        return;
      }
      tooltip.textContent = stop.flag + " " + stop.name + " — " + stop.short;
      tooltip.removeAttribute("hidden");
      positionTooltip(event);
    }

    function hideTooltip() {
      if (tooltip) {
        tooltip.setAttribute("hidden", "");
      }
    }

    var dots = dotGroup.selectAll("circle")
      .data(STOPS)
      .enter()
      .append("circle")
      .attr("r", 4.8)
      .attr("stroke", "rgba(7,12,21,0.88)")
      .attr("stroke-width", 0.85)
      .style("cursor", "pointer")
      .on("mouseenter", function (event, stop) {
        showTooltip(event, stop);
      })
      .on("mousemove", function (event) {
        positionTooltip(event);
      })
      .on("mouseleave", function () {
        hideTooltip();
      })
      .on("click", function (event, stop) {
        event.preventDefault();
        focusStop(stop);
      });

    function renderDots() {
      dots
        .style("display", function (stop) {
          return projectStop(stop) ? null : "none";
        })
        .attr("cx", function (stop) {
          var point = projectStop(stop);
          return point ? point[0] : -9999;
        })
        .attr("cy", function (stop) {
          var point = projectStop(stop);
          return point ? point[1] : -9999;
        })
        .attr("fill", function (stop) {
          return stop.id === selectedStopId ? "#ff8f40" : "#ffe97a";
        })
        .attr("r", function (stop) {
          return stop.id === selectedStopId ? 6.4 : 4.8;
        });
    }

    function render() {
      sphere.attr("d", path);
      graticule.attr("d", path);

      if (countryGeo) {
        countries.style("display", null).datum(countryGeo).attr("d", path);
      } else {
        countries.style("display", "none");
      }

      renderDots();
    }

    function focusStop(stop) {
      if (!stop) {
        return;
      }
      projection.rotate([-stop.lon, -stop.lat, 0]);
      selectedStopId = stop.id;
      render();
      updateDetail(stop, buttonNodes, titleEl, textEl, linksEl);
    }

    buttonNodes.forEach(function (button) {
      button.addEventListener("click", function () {
        var stop = STOP_BY_ID[button.getAttribute("data-location")];
        focusStop(stop);
      });
    });

    svg.call(
      d3.drag().on("drag", function (event) {
        hideTooltip();
        var rotate = projection.rotate();
        var sensitivity = 0.34;
        var nextLambda = rotate[0] + event.dx * sensitivity;
        var nextPhi = Math.max(-85, Math.min(85, rotate[1] - event.dy * sensitivity));
        projection.rotate([nextLambda, nextPhi, rotate[2]]);
        render();
      })
    );

    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(function (world) {
        if (world && world.objects && world.objects.countries) {
          countryGeo = topojson.feature(world, world.objects.countries);
        }
        render();
        focusStop(STOP_BY_ID.boulder || STOPS[0]);
      })
      .catch(function () {
        render();
        focusStop(STOP_BY_ID.boulder || STOPS[0]);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobe);
  } else {
    initGlobe();
  }
})();
