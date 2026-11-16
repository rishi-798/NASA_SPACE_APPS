(() => {
  // Hourly geometric ephemerides generated from the archive's JPL DE440 kernels.
  const years = window.BRAHMOS_EPHEMERIS = Object.create(null);
  const pending = new Map();
  const hour = 3_600_000;
  const lower = Date.UTC(2024, 0, 1);
  const upper = Date.UTC(2031, 0, 1);
  const radians = Math.PI / 180;
  const mu = 398600.435507;
  const earthRadius = 6378.1363;
  const moonRadius = 1737.4;
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magnitude = (a) => Math.hypot(...a);
  const scale = (a, factor) => a.map((value) => value * factor);
  const add = (a, b) => a.map((value, index) => value + b[index]);
  const subtract = (a, b) => a.map((value, index) => value - b[index]);
  const unit = (a) => scale(a, 1 / magnitude(a));
  const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];

  function loadYear(year) {
    if (pending.has(year)) return pending.get(year);
    const load = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `media/ephemeris-${year}.js`;
      script.onload = () => {
        script.remove();
        const table = years[year];
        if (!table) { reject(new Error("The ephemeris file is unreadable.")); return; }
        let bytes;
        if (Uint8Array.fromBase64) bytes = Uint8Array.fromBase64(table.data);
        else {
          const raw = atob(table.data);
          bytes = new Uint8Array(raw.length);
          for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
        }
        table.rows = new Float32Array(bytes.buffer);
        delete table.data;
        resolve();
      };
      script.onerror = () => { script.remove(); reject(new Error("The local ephemeris file could not be loaded.")); };
      document.head.append(script);
    });
    pending.set(year, load);
    load.catch(() => pending.delete(year));
    return load;
  }

  async function prepare(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Enter a valid UTC date range.");
    if (start < lower || end >= upper) throw new Error("The bundled ephemeris covers UTC dates from 2024 through 2030.");
    const first = new Date(start).getUTCFullYear();
    const last = new Date(end).getUTCFullYear();
    await Promise.all(Array.from({ length: last - first + 1 }, (_, index) => loadYear(first + index)));
  }

  function sample(time) {
    const table = years[new Date(time).getUTCFullYear()];
    const cursor = (time - table.start) / table.step;
    const index = Math.floor(cursor) * 12;
    const fraction = cursor % 1;
    return Array.from({ length: 12 }, (_, offset) =>
      table.rows[index + offset] * (1 - fraction) + table.rows[index + offset + 12] * fraction);
  }

  function horizonAt(profile, azimuth) {
    if (!profile) return 0;
    const index = azimuth / profile.azimuth_step;
    const left = Math.floor(index);
    const fraction = index - left;
    return profile.horizon[left] * (1 - fraction) + profile.horizon[(left + 1) % profile.horizon.length] * fraction;
  }

  async function visibility(site, start, end, minutes, terrain) {
    if (end <= start) throw new Error("End time must follow start time.");
    const step = minutes * 60_000;
    if (!Number.isInteger(minutes) || minutes < 1 || Math.floor((end - start) / step) + 1 > 2000) {
      throw new Error("Choose a sampling interval that gives at most 2,000 observations.");
    }
    await prepare(start, end);
    const lat = site.latitude * radians;
    const lon = site.longitude * radians;
    const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    const east = [-Math.sin(lon), Math.cos(lon), 0];
    const north = cross(up, east);
    const observer = scale(up, moonRadius);
    function angles(center) {
      const vector = subtract(center, observer);
      const azimuth = (Math.atan2(dot(vector, east), dot(vector, north)) / radians + 360) % 360;
      const elevation = Math.atan2(dot(vector, up), Math.hypot(dot(vector, east), dot(vector, north))) / radians;
      const horizon = horizonAt(terrain, azimuth);
      return { azimuth, elevation, horizon, visible: elevation > horizon };
    }
    const results = [];
    for (let time = start; time <= end; time += step) {
      const state = sample(time);
      results.push({ time, earth: angles(state.slice(6, 9)), sun: angles(state.slice(9, 12)) });
    }
    return results;
  }

  function stumpff(z) {
    if (Math.abs(z) < 1e-4) return [.5 - z / 24 + z * z / 720, 1 / 6 - z / 120 + z * z / 5040];
    const root = Math.sqrt(Math.abs(z));
    if (z > 0) return [(1 - Math.cos(root)) / z, (root - Math.sin(root)) / root ** 3];
    return [(Math.cosh(root) - 1) / -z, (Math.sinh(root) - root) / root ** 3];
  }

  function endpointVelocity(start, end, seconds) {
    const r1 = magnitude(start);
    const r2 = magnitude(end);
    const cosine = dot(start, end) / (r1 * r2);
    const A = Math.sqrt(r1 * r2 * (1 + cosine));
    if (Math.abs(cosine) > 1 - 1e-9 || A === 0) return null;
    function residual(z) {
      const [C, S] = stumpff(z);
      const y = r1 + r2 + A * (z * S - 1) / Math.sqrt(C);
      if (y < 0) return { y, seconds: -Infinity };
      return { y, seconds: ((y / C) ** 1.5 * S + A * Math.sqrt(y)) / Math.sqrt(mu) };
    }
    const limit = 4 * Math.PI ** 2 - 1e-4;
    let lo = -limit;
    let hi = limit;
    if (residual(lo).seconds > seconds || residual(hi).seconds < seconds) return null;
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (residual(mid).seconds >= seconds) hi = mid;
      else lo = mid;
    }
    const { y } = residual(hi);
    const g = A * Math.sqrt(y / mu);
    const departure = scale(subtract(end, scale(start, 1 - y / r1)), 1 / g);
    const arrival = scale(subtract(scale(end, 1 - y / r2), start), 1 / g);
    if (![...departure, ...arrival].every(Number.isFinite)) return null;
    return { departure, arrival };
  }

  function propagate(position, velocity) {
    const radius = magnitude(position);
    const alpha = 2 / radius - dot(velocity, velocity) / mu;
    const rootMu = Math.sqrt(mu);
    const beta = dot(position, velocity) / rootMu;
    function timeAt(x) {
      const [C, S] = stumpff(alpha * x * x);
      return (beta * x * x * C + (1 - alpha * radius) * x ** 3 * S + radius * x) / rootMu;
    }
    return (seconds) => {
      let lo = 0;
      let hi = 1;
      while (timeAt(hi) < seconds && hi < 131072) hi *= 2;
      for (let i = 0; i < 55; i++) {
        const middle = (lo + hi) / 2;
        if (timeAt(middle) > seconds) hi = middle;
        else lo = middle;
      }
      const x = (lo + hi) / 2;
      const [C, S] = stumpff(alpha * x * x);
      return add(scale(position, 1 - x * x / radius * C), scale(velocity, seconds - x ** 3 / rootMu * S));
    };
  }

  function segmentDistance(a, b) {
    const movement = subtract(b, a);
    const lengthSquared = dot(movement, movement);
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -dot(a, movement) / lengthSquared)) : 0;
    return magnitude(add(a, scale(movement, fraction)));
  }

  async function transfer(start, end, altitude) {
    const duration = (end - start) / 1000;
    if (!Number.isFinite(duration) || duration < 24 * 3600 || duration > 240 * 3600) throw new Error("Transfer time must be 24–240 hours.");
    if (!Number.isFinite(altitude) || altitude < 160 || altitude > 2000) throw new Error("Parking orbit altitude must be 160–2,000 km.");
    await prepare(start, end);
    const departureMoon = sample(start).slice(0, 3);
    const target = sample(end);
    const arrivalMoon = target.slice(0, 3);
    const lunarVelocity = target.slice(3, 6);
    const axis = unit(arrivalMoon);
    const tangent = unit(cross(unit(cross(arrivalMoon, lunarVelocity)), axis));
    const endpoint = subtract(arrivalMoon, scale(axis, moonRadius + 1000));
    const radius = earthRadius + altitude;
    const speed = Math.sqrt(mu / radius);
    const candidates = [];
    for (let angle = 100; angle <= 175; angle += 5) {
      const theta = angle * radians;
      const departure = scale(subtract(scale(axis, Math.cos(theta)), scale(tangent, Math.sin(theta))), radius);
      const parking = scale(add(scale(axis, Math.sin(theta)), scale(tangent, Math.cos(theta))), speed);
      const state = endpointVelocity(departure, endpoint, duration);
      if (!state || dot(departure, state.departure) < -1e-6) continue;
      const deltaV = magnitude(subtract(state.departure, parking));
      candidates.push({ departure, state, deltaV });
    }
    candidates.sort((a, b) => a.deltaV - b.deltaV);
    for (const { departure, state, deltaV } of candidates) {
      const evaluate = propagate(departure, state.departure);
      const closure = magnitude(subtract(evaluate(duration), endpoint));
      if (!Number.isFinite(closure) || closure > .01) continue;
      const points = Array.from({ length: 257 }, (_, index) => index ? evaluate(duration * index / 256) : departure);
      let minimumRadius = magnitude(departure);
      let closest = Infinity;
      let previous = subtract(departure, departureMoon);
      for (let index = 1; index < points.length; index++) {
        const relative = subtract(points[index], sample(start + (end - start) * index / 256).slice(0, 3));
        closest = Math.min(closest, segmentDistance(previous, relative));
        minimumRadius = Math.min(minimumRadius, magnitude(points[index]));
        previous = relative;
      }
      if (closest < moonRadius + 100 || minimumRadius < earthRadius + 120) continue;
      return {
        points: points.map((point) => [dot(point, axis), dot(point, tangent)]),
        duration: duration / 3600,
        deltaV, arrivalSpeed: magnitude(subtract(state.arrival, lunarVelocity)), closure,
        departureDistance: magnitude(departureMoon), arrivalDistance: magnitude(arrivalMoon),
        lunarMovement: Math.acos(Math.max(-1, Math.min(1, dot(unit(departureMoon), axis)))) / radians,
        minEarthAltitude: minimumRadius - earthRadius,
      };
    }
    throw new Error("No Earth-clear short-way transfer met the endpoint constraints for these inputs.");
  }

  window.BRAHMOS_FLIGHT = { visibility, transfer, startDate: "2024-01-01", endDate: "2030-12-31" };
})();
