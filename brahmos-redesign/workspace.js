(() => {
  const data = window.BRAHMOS_DATA;
  const flight = window.BRAHMOS_FLIGHT;
  const query = new URLSearchParams(location.search);
  const views = {
    analyze: ["Analyze a site", "Calculate lunar sunlight and Earth visibility for a UTC observation window.", "Observation setup", "Site coordinates", "Visibility timeline", "Terrain horizon"],
    trip: ["Plan a trip", "Choose a departure pad and model a preliminary Earth–Moon transfer.", "Transfer setup", "Flight plan", "Calculated transfer", "Launch vehicle"],
    phases: ["Flight phases", "Explore the reference stages from liftoff to lunar descent.", "Flight sequence", "Reference telemetry", "Milestones", "Engineering"],
    missions: ["Missions", "Explore the CLPS and Artemis mission archive.", "Mission catalogue", "Mission record", "Payloads and objective", "Mission sources"],
  };
  const view = Object.hasOwn(views, query.get("view")) ? query.get("view") : "analyze";
  const [title, subtitle, setupTitle, detailTitle, readoutTitle, linkTitle] = views[view];
  const get = (id) => document.getElementById(id);
  const form = get("workspace-form");
  const detail = get("workspace-detail");
  const readout = get("workspace-readout");
  const secondary = get("workspace-link");
  const label = document.querySelector(".workspace-scene-label");
  const day = 86_400_000;
  const firstDay = Date.parse(flight.startDate);
  const lastDay = Date.parse(flight.endDate);
  const now = Math.max(firstDay, Math.min(lastDay - 4 * day, Date.now()));
  const epoch = Date.parse(query.get("time") ?? "");
  const formatTime = (value) => new Date(value).toISOString().slice(0, 16);
  const parseTime = (value) => Date.parse(value + "Z");
  const displayTime = (value) => formatTime(value).replace("T", " ") + " UTC";
  const format = (value, digits = 0) => value.toLocaleString("en-US", { maximumFractionDigits: digits });
  const coordinate = (value, positive, negative) => `${Math.abs(value).toFixed(2)}° ${value < 0 ? negative : positive}`;
  const coordinates = ({ latitude, longitude }) => `${coordinate(latitude, "N", "S")} · ${coordinate(longitude, "E", "W")}`;
  const pick = (records, id) => records.find((item) => item.id === id) ?? records[0];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const pairs = (items) => '<dl class="workspace-pairs">' + items.filter(([, value]) => value != null && value !== "")
    .map(([name, value]) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`).join("") + "</dl>";
  const select = (name, text, records, selected, display = ({ name }) => name) =>
    `<label><span id="label-${name}">${text}</span><select name="${name}" aria-labelledby="label-${name}">${records.map((record) =>
      `<option value="${escape(record.id)}"${record.id === selected ? " selected" : ""}>${escape(display(record))}</option>`).join("")}</select></label>`;
  const timeField = (name, text, value) => `<label>${text}<input type="datetime-local" name="${name}"
    min="${flight.startDate}T00:00" max="${flight.endDate}T23:59" value="${formatTime(value)}" required></label>`;
  const numberField = (name, text, value, min, max, step = 1) => `<label>${text}<input type="number" name="${name}" min="${min}" max="${max}" step="${step}" value="${escape(value)}" required></label>`;
  const link = (url, text) => `<a class="workspace-link" href="${escape(url)}">${escape(text)}</a>`;
  const paragraph = (text) => `<p>${escape(text)}</p>`;
  const list = (items) => '<ul class="workspace-sublist">' + items.map((item) => `<li>${escape(item)}</li>`).join("") + "</ul>";
  const action = (text) => `<button class="control-button workspace-form-action" type="submit">${text}</button>`;
  const announce = (cue) => document.dispatchEvent(new CustomEvent("brahmos:voice", { detail: cue }));

  document.body.dataset.view = view;
  document.title = `${title} · BRAHMOS`;
  get("workspace-title").textContent = title;
  get("workspace-subtitle").textContent = subtitle;
  get("setup-title").textContent = setupTitle;
  get("detail-title").textContent = detailTitle;
  get("readout-title").textContent = readoutTitle;
  get("link-title").textContent = linkTitle;
  for (const item of document.querySelectorAll(`[data-view-link="${view}"]`)) item.setAttribute("aria-current", "page");
  for (const item of document.querySelectorAll(".workspace-nav a")) window.setUpBrahmosLabel(item, item, 620);
  form.addEventListener("submit", (event) => event.preventDefault());

  if (view !== "missions") {
    const visual = document.querySelector(".workspace-visual");
    const scene = visual.querySelector(".workspace-scene");
    const sceneSlot = document.querySelector(".workspace-view");
    const narrow = matchMedia("(max-width: 760px)");
    const placeScene = () => (narrow.matches ? sceneSlot : visual).prepend(scene);
    placeScene();
    narrow.addEventListener("change", placeScene);
    const image = new Image();
    image.className = view === "analyze" ? "workspace-moon" : "workspace-earth";
    image.width = image.height = 900;
    image.alt = "";
    image.src = view === "analyze" ? "media/moon-fallback.jpg" : "media/earth-globe.webp";
    scene.append(image);
  }

  const catalogue = [...data.sites, ...data.historicalSites.map((site) => ({ ...site, source: site.sourceUrl }))];
  function graph(points, width = 480, height = 100) {
    return `<svg class="workspace-graph" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline points="${points}"/></svg>`;
  }

  function renderHorizon(terrain, site) {
    if (!terrain) {
      secondary.innerHTML = paragraph(site.horizon_note || "Flat-horizon model. A local terrain profile is unavailable for this point.");
      return;
    }
    const values = terrain.horizon;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const points = values.map((value, index) => `${(index * 400 / (values.length - 1)).toFixed(2)},${(52 - (value - min) * 48 / (max - min)).toFixed(2)}`).join(" ");
    secondary.innerHTML = `
      <div class="workspace-horizon">
        <label>Azimuth <input id="terrain-azimuth" type="range" min="0" max="359.5" step="0.5" value="90"></label>
        <output for="terrain-azimuth"></output>
        <svg viewBox="0 0 400 57" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"/><line y1="0" y2="57"/></svg>
      </div>
      <p>${terrain.max_distance_m / 1000} km coverage · ${terrain.pixel_resolution_m} m DEM · ${terrain.observer_height_m} m observer</p>`;
    const range = secondary.querySelector("input");
    const output = secondary.querySelector("output");
    const marker = secondary.querySelector("line");
    function inspect() {
      const azimuth = range.valueAsNumber;
      const horizon = values[Math.round(azimuth / terrain.azimuth_step)];
      output.textContent = `${azimuth.toFixed(1)}° azimuth · ${horizon.toFixed(2)}° horizon`;
      const position = azimuth / 359.5 * 400;
      marker.setAttribute("x1", position);
      marker.setAttribute("x2", position);
    }
    range.addEventListener("input", inspect);
    inspect();
  }

  function analyze() {
    const custom = { id: "custom", name: "Custom coordinates" };
    const initial = catalogue.find((site) => site.id === query.get("site"));
    const queryLat = Number(query.get("lat"));
    const queryLon = Number(query.get("lon"));
    const customLink = !initial && query.has("lat") && query.has("lon") &&
      Number.isFinite(queryLat) && Number.isFinite(queryLon) && Math.abs(queryLat) <= 90 && Math.abs(queryLon) <= 180;
    const startDate = Number.isFinite(epoch) && epoch >= firstDay && epoch < lastDay ? epoch : now;
    form.innerHTML = select("site", "Landing site", [...catalogue, custom], customLink ? "custom" : initial?.id || "athena-im2") +
      '<fieldset><legend>Planetocentric coordinates</legend>' +
      numberField("latitude", "Latitude (°)", customLink ? queryLat : "", -90, 90, "any") +
      numberField("longitude", "Longitude (° east)", customLink ? queryLon : "", -180, 180, "any") + "</fieldset>" +
      timeField("start", "Start (UTC)", startDate) + timeField("end", "End (UTC)", startDate + day) +
      select("interval", "Sampling interval", [15, 30, 60, 120].map((id) => ({ id: String(id), name: id + " min" })), "30") +
      action("Run visibility analysis");
    const fields = form.elements;
    const coordinatesField = form.querySelector("fieldset");
    let request = 0;
    let site;
    let terrain;
    function reset() {
      request++;
      const isCustom = fields.site.value === "custom";
      coordinatesField.hidden = coordinatesField.disabled = !isCustom;
      site = isCustom ? { name: "Custom coordinates", latitude: fields.latitude.valueAsNumber, longitude: fields.longitude.valueAsNumber } :
        pick(catalogue, fields.site.value);
      terrain = data.terrain[site.id];
      const valid = Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
      label.textContent = valid ? coordinates(site) : "Enter a lunar coordinate";
      detail.innerHTML = `<h3>${escape(site.mission || site.name)}</h3>` + pairs([
        ["Latitude", valid ? coordinate(site.latitude, "N", "S") : "—"],
        ["Longitude", valid ? coordinate(site.longitude, "E", "W") : "—"],
        ["Visibility horizon", terrain ? "Athena LOLA terrain" : "Flat horizon"],
        ["Profile DEM elevation", terrain ? `${format(terrain.site_elevation_m, 1)} m` : null],
      ]) + (site.coordinate_source ? paragraph(site.coordinate_source) : "") + (site.source ? link(site.source, "Site source") : "");
      renderHorizon(terrain, site);
      readout.innerHTML = paragraph("Choose the UTC window and run the analysis. Bundled DE440 ephemeris covers 2024–2030.");
    }
    form.addEventListener("change", (event) => {
      reset();
      if (event.target === fields.site) {
        const cues = { "athena-im2": "site_athena", "odysseus-im1": "site_odysseus", custom: "site_custom" };
        if (cues[site.id || fields.site.value]) announce(cues[site.id || fields.site.value]);
      }
    });
    form.addEventListener("submit", async () => {
      const id = ++request;
      const minutes = Number(fields.interval.value);
      const start = parseTime(fields.start.value);
      const end = parseTime(fields.end.value);
      readout.innerHTML = '<p class="workspace-pending" role="status">Calculating visibility…</p>';
      announce("analysis_start");
      try {
        const values = await flight.visibility(site, start, end, minutes, terrain);
        if (id !== request) return;
        const totals = [0, 0, 0];
        let darkness = 0;
        let blackout = 0;
        let longestDarkness = 0;
        let longestBlackout = 0;
        for (const value of values) {
          const held = Math.min(minutes * 60_000, end - value.time);
          if (value.sun.visible) totals[0] += held;
          if (value.earth.visible) totals[1] += held;
          if (value.sun.visible && value.earth.visible) totals[2] += held;
          darkness = value.sun.visible ? 0 : darkness + held;
          blackout = value.earth.visible ? 0 : blackout + held;
          longestDarkness = Math.max(longestDarkness, darkness);
          longestBlackout = Math.max(longestBlackout, blackout);
        }
        const percentages = totals.map((total) => total / (end - start) * 100);
        readout.innerHTML = `<p>${values.length} observations · ${minutes} minute sample interval</p>
          <div class="workspace-segments">${["Sun", "Earth", "Both"].map((name, index) =>
            `<div><span>${name}</span><meter aria-label="${name} visibility" min="0" max="100" value="${percentages[index]}"></meter><span>${format(percentages[index], 1)}%</span></div>`).join("")}</div>
          ${pairs([["Longest darkness", `${format(longestDarkness / 3_600_000, 2)} h`], ["Longest Earth-hidden window", `${format(longestBlackout / 3_600_000, 2)} h`]])}
          <label class="workspace-scrub">Inspect observation time <input type="range" min="0" max="${values.length - 1}" value="0" aria-label="Inspect observation time"></label>
          <div class="workspace-observation"></div>
          <p>Geometric DE440 positions interpolated from hourly samples. Visibility durations hold each observation until the next sample or the window ends.</p>`;
        const slider = readout.querySelector("input");
        const observation = readout.querySelector(".workspace-observation");
        function inspect() {
          const current = values[slider.valueAsNumber];
          observation.innerHTML = paragraph(displayTime(current.time)) + pairs([["Sun", observationBody(current.sun)], ["Earth", observationBody(current.earth)]]);
        }
        slider.addEventListener("input", inspect);
        inspect();
        announce("analysis_done");
      } catch (error) {
        if (id !== request) return;
        readout.innerHTML = `<p role="alert">${escape(error.message)}</p>`;
        announce("analysis_failed");
      }
    });
    reset();
  }

  function observationBody(body) {
    return `${body.visible ? "Visible" : "Below horizon"} · Az ${body.azimuth.toFixed(2)}° · El ${body.elevation.toFixed(2)}°`;
  }

  function trip() {
    form.innerHTML = select("pad", "Departure pad", data.pads, "kennedy-39a", (pad) => `${pad.name} · ${pad.pad}`) +
      '<div id="rocket-field"></div>' + select("destination", "Observation site", catalogue, "athena-im2") +
      timeField("depart", "Transfer departure (UTC)", now) + timeField("arrival", "Reference arrival (UTC)", now + 4 * day) +
      numberField("altitude", "Parking orbit altitude (km)", 200, 160, 2000, "any") + action("Calculate transfer");
    const fields = form.elements;
    let request = 0;
    let destination;
    function rockets() {
      const pad = pick(data.pads, fields.pad.value);
      const previous = fields.rocket?.value;
      const available = data.rockets.slice().sort((a, b) => Number(pad.rockets.includes(b.id)) - Number(pad.rockets.includes(a.id)));
      const selected = pad.rockets.includes(previous) ? previous : pad.rockets[0];
      get("rocket-field").innerHTML = select("rocket", "Launch vehicle", available, selected, (rocket) =>
        pad.rockets.includes(rocket.id) ? rocket.name + " · pad catalogue" : rocket.name);
    }
    function reset() {
      request++;
      const pad = pick(data.pads, fields.pad.value);
      const rocket = pick(data.rockets, fields.rocket.value);
      destination = pick(catalogue, fields.destination.value);
      label.textContent = `${pad.pad} · ${pad.country}`;
      detail.innerHTML = `<h3>${escape(pad.name)}</h3>` + pairs([
        ["Launch pad", pad.pad], ["Country", pad.country], ["Earth coordinates", coordinates(pad)],
        ["Observation site", destination.mission || destination.name], ["Lunar coordinates", coordinates(destination)],
      ]) + (pad.historical ? paragraph("Historical launch site.") : "") + link(pad.source, "Pad source");
      secondary.innerHTML = `<h3>${escape(rocket.name)}</h3>` + pairs([
        ["Programme / role", rocket.mission], ["Category", rocket.category], ["Payload to TLI (reference)", rocket.specs.payloadTli],
        ["Thrust at liftoff", rocket.specs.liftoffThrust], ["Stages", rocket.specs.stages], ["Propellants", rocket.specs.propellants],
        ["Pad catalogue", pad.rockets.includes(rocket.id) ? "Listed at selected pad" : "Reference vehicle only"],
      ]) + link(rocket.source, "Vehicle source");
      readout.innerHTML = paragraph("Calculate a 24–240 hour short-way transfer using the bundled JPL DE440 ephemeris.");
    }
    rockets();
    reset();
    form.addEventListener("change", (event) => {
      if (event.target === fields.pad) rockets();
      reset();
      const cues = { pad: "departure", rocket: "rocket", destination: "destination" };
      if (cues[event.target.name]) announce(cues[event.target.name]);
    });
    form.addEventListener("submit", async () => {
      const id = ++request;
      const end = parseTime(fields.arrival.value);
      readout.innerHTML = '<p class="workspace-pending" role="status">Solving transfer…</p>';
      try {
        const result = await flight.transfer(parseTime(fields.depart.value), end, fields.altitude.valueAsNumber);
        if (id !== request) return;
        const xMax = Math.max(...result.points.map(([x]) => x));
        const yMax = Math.max(...result.points.map(([, y]) => Math.abs(y)));
        const points = result.points.map(([x, y]) => `${(33 + x / xMax * 427).toFixed(2)},${(20 - y / yMax * 67).toFixed(2)}`).join(" ");
        const follow = new URLSearchParams({ view: "analyze", site: destination.id, time: new Date(end).toISOString() });
        readout.innerHTML = graph(points) + pairs([
          ["Flight time", `${format(result.duration, 2)} h`], ["Injection Δv", `${format(result.deltaV, 4)} km/s`],
          ["Moon-relative reference speed", `${format(result.arrivalSpeed, 4)} km/s`],
          ["Earth–Moon distance at departure", `${format(result.departureDistance)} km`],
          ["Earth–Moon distance at arrival", `${format(result.arrivalDistance)} km`],
          ["Lunar angular movement", `${format(result.lunarMovement, 2)}°`],
          ["Minimum sampled Earth altitude", `${format(result.minEarthAltitude, 2)} km`],
          ["Numerical endpoint closure", `${format(result.closure * 1000, 3)} m`],
        ]) + paragraph("Preliminary two-body model targeting a reference point 1,000 km above the Moon’s Earth-facing side. Landing and launch feasibility require separate analysis.") +
          link("workspace.html?" + follow, "Analyze destination at arrival");
        announce("trip_done");
      } catch (error) {
        if (id === request) readout.innerHTML = `<p role="alert">${escape(error.message)}</p>`;
      }
    });
  }

  function phases() {
    form.innerHTML = select("phase", "Flight phase", data.phases, data.phases[0].id, ({ shortName }) => shortName) +
      '<ol class="workspace-steps" aria-label="Flight phase shortcuts">' + data.phases.map((phase) =>
        `<li><button type="button" value="${escape(phase.id)}">${escape(phase.shortName)}</button></li>`).join("") + "</ol>";
    const phaseField = form.elements.phase;
    function update(speak = false) {
      const phase = pick(data.phases, phaseField.value);
      label.textContent = "Earth · Reference flight";
      for (const button of form.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.value === phase.id));
      detail.innerHTML = `<h3>${escape(phase.name)}</h3>` + paragraph(phase.tagline) +
        pairs([["Time span", phase.durationLabel], ["Reference Δv budget", `${format(phase.deltaVBudgetMS, 2)} m/s`],
          ["Altitude", `${format(phase.initialAltitudeKm)} → ${format(phase.finalAltitudeKm)} km`],
          ["Velocity", `${format(phase.initialVelocityKmS, 3)} → ${format(phase.finalVelocityKmS, 3)} km/s`],
          [phase.telemetryProfile.primaryMetric, phase.telemetryProfile.primaryValue], ["Engine", phase.telemetryProfile.engineStatus],
          ["Gravity", phase.telemetryProfile.gravitationalDominance]]) + paragraph(phase.overview);
      readout.innerHTML = '<ul class="workspace-milestones">' + phase.milestones.map((event) =>
        `<li><span>${escape(event.timeMet)}</span><div><strong>${escape(event.name)}</strong><p>${escape(event.description)}</p>${pairs([
          ["Altitude", `${event.altitudeKm} km`], ["Velocity", `${event.velocityKmS} km/s`],
        ])}</div></li>`).join("") + "</ul>";
      secondary.innerHTML = paragraph("Educational reference values from the archive's flight phase dataset.") +
        '<details><summary>Orbital mechanics and engineering challenges</summary>' + paragraph(phase.orbitalMechanics) +
        paragraph(phase.engineeringChallenges) + '</details><details><summary>Equations</summary>' +
        phase.keyEquations.map((equation) => `<h3>${escape(equation.name)}</h3>${paragraph(equation.formula)}${paragraph(equation.meaning)}
          ${pairs(equation.variables.map(({ symbol, label }) => [symbol, label]))}`).join("") + "</details>";
      if (speak) announce(`phase_${phase.id}`);
    }
    form.addEventListener("change", () => update(true));
    form.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      phaseField.value = button.value;
      update(true);
    });
    update();
  }

  function missions() {
    const types = { surface: "Lunar surface", flyby: "Lunar flyby", "orbital-demo": "Earth-orbit demonstration" };
    form.innerHTML = select("type", "Mission type", [{ id: "all", name: "All mission types" },
      ...Object.entries(types).map(([id, name]) => ({ id, name }))], "all") + '<div id="mission-field"></div>';
    const fields = form.elements;
    function records() {
      const matching = data.missions.filter((mission) => fields.type.value === "all" || mission.missionType === fields.type.value);
      get("mission-field").innerHTML = select("mission", "Mission record", matching, fields.mission?.value);
    }
    function update(speak = false) {
      const mission = pick(data.missions, fields.mission.value);
      if (!mission) {
        detail.textContent = "No mission records are available in this snapshot.";
        readout.replaceChildren();
        secondary.replaceChildren();
        return;
      }
      const location = mission.explorationContext || mission;
      const facts = data.missionFacts.find((record) => record.siteId === mission.siteId);
      const events = data.missionEvents.filter((record) => record.siteId === mission.siteId);
      detail.innerHTML = `<h3>${escape(mission.name)}</h3>${paragraph(mission.description)}` + pairs([
        ["Provider", mission.provider], ["Type", types[mission.missionType]], ["Status", mission.status],
        [mission.dateLabel || "Date", mission.landingDate || mission.year], ["Launch vehicle", mission.launchVehicle],
        ["Spacecraft", mission.lander], ["Landing area", mission.landingArea], ["Archive verified", mission.lastVerified],
      ]) + paragraph(mission.scheduleNote);
      readout.innerHTML = paragraph(mission.objective) +
        (mission.payloads?.length ? list(mission.payloads) : paragraph("The archive does not list payloads for this record.")) +
        (facts ? "<h3>Outcome</h3>" + paragraph(facts.outcome) : "");
      const params = new URLSearchParams({ view: "analyze" });
      let analysis = "";
      if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
        if (mission.siteId) params.set("site", mission.siteId);
        else { params.set("lat", location.latitude); params.set("lon", location.longitude); }
        if (mission.explorationEpoch) params.set("time", mission.explorationEpoch);
        analysis = link("workspace.html?" + params, "Analyze this location");
      }
      secondary.innerHTML = (mission.explorationNote ? paragraph(mission.explorationNote) : "") + analysis +
        (mission.sources ?? []).map((url, index) => link(url, index ? `Supporting source ${index}` : "Primary mission source")).join(" ") +
        (events.length ? '<details><summary>Dated mission events</summary><ul class="workspace-sublist">' +
          events.map((event) => `<li><time datetime="${escape(event.time)}">${escape(event.time.slice(0, 10))}</time>${event.approximate ? " (approximate)" : ""} ·
            ${escape(event.label)} · <a href="${escape(event.source.url)}">${escape(event.source.name)}</a></li>`).join("") + "</ul></details>" : "");
      if (speak) announce(`archive_${mission.id}`);
    }
    records();
    update();
    form.addEventListener("change", (event) => {
      if (event.target === fields.type) records();
      update(true);
    });
  }

  ({ analyze, trip, phases, missions }[view])();
})();
