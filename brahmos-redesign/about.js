(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const water = document.querySelector(".about__water");
  const canvas = water.querySelector("canvas");
  let draw;
  let initialized = false;
  let visible = false;
  let frame = 0;
  let previousDraw = 0;
  let cursor = 0;

  function scheduleWater() {
    if (!visible || frame || document.hidden || document.documentElement.hasAttribute("data-scrolling")) return;
    frame = requestAnimationFrame((time) => {
      frame = 0;
      if (!initialized) {
        initialized = true;
        draw = createCrestWater(canvas);
      }
      if (draw && (reduced.matches || time - previousDraw > 42)) {
        previousDraw = time;
        draw(reduced.matches ? 0 : time * .00045, cursor);
      }
    });
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    scheduleWater();
  }, { threshold: .16 }).observe(water);
  const section = water.closest(".about");
  section.addEventListener("pointermove", (event) => {
    if (!fine.matches || reduced.matches || !visible) return;
    cursor = (event.clientX / innerWidth - .5) * 2;
    scheduleWater();
  });
  for (const event of ["visibilitychange", "brahmos:scrollstate"]) document.addEventListener(event, scheduleWater);
  window.addEventListener("resize", scheduleWater, { passive: true });
  reduced.addEventListener("change", scheduleWater);

  // The Crest water's expanding rings, broad swell, and horizon shimmer are
  // adapted here as a single shallow projection behind the About panels.
  function createCrestWater(target) {
    const gl = target.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;

    const vertex = `
      attribute vec2 a_position;
      void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
    `;
    const fragment = `
      precision mediump float;
      uniform vec2 u_size;
      uniform float u_time;
      uniform float u_cursor;
      const float tau = 6.2831853;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 a = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), a.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), a.x), a.y);
      }

      float height(vec2 p) {
        float t = u_time * .43;
        vec2 center = vec2(.65 + u_cursor * .52, 7.0);
        float r = length(p - center);
        float pulse = .5 + .5 * cos(tau * (t - r / 1.14 - 1.75) / 3.0);
        float ring = sin(tau * (r - t * 1.14) / 3.4) * (.05 + .12 * pulse);
        float swell = noise(p * vec2(.34, .5) + vec2(cos(t), sin(t)) * .7) - .5;
        return ring * exp(-r * .16) + swell * (.16 * exp(-r * .09) + .05)
          + sin(p.x * .23 + p.y * 1.1 + t * 1.05) * .013
          + (noise(p * vec2(.9, 2.2) - vec2(t * .15, t * .35)) - .5) * .028;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_size;
        float horizon = .68;
        float d = horizon - uv.y;
        float x = uv.x - .54;
        float haze = exp(-d * d * 1220.0) * exp(-x * x * 13.0);
        vec3 glow = vec3(1.0, .60, .31);
        if (d <= .005) {
          gl_FragColor = vec4(glow, haze * .18);
          return;
        }
        float distance = 2.35 / (d + .037);
        vec2 p = vec2(x * (u_size.x / u_size.y) * distance * .86, distance);
        float h = height(p);
        float slope = (height(p + vec2(0.0, .18)) - h) / .18;
        float band = pow(max(0.0, .64 + slope * 2.7), 4.3);
        float pool = exp(-pow(abs(p.x - .65 - u_cursor * .52) * .20, 1.7))
          * exp(-abs(p.y - 9.0) * .041);
        float chop = .40 + .60 * noise(p * vec2(.23, 1.65));
        float edge = smoothstep(0.0, .13, d) * (1.0 - smoothstep(.39, .68, d));
        float shimmer = min(1.0, band * chop * 1.35) * pool * edge;
        gl_FragColor = vec4(mix(glow, vec3(1.0, .79, .51), shimmer),
          min(.64, shimmer * .75 + haze * .19));
      }
    `;

    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      return gl.getShaderParameter(result, gl.COMPILE_STATUS) ? result : null;
    }

    const vertexShader = shader(gl.VERTEX_SHADER, vertex);
    const fragmentShader = shader(gl.FRAGMENT_SHADER, fragment);
    if (!vertexShader || !fragmentShader) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const size = gl.getUniformLocation(program, "u_size");
    const time = gl.getUniformLocation(program, "u_time");
    const pointer = gl.getUniformLocation(program, "u_cursor");

    function resize() {
      const width = Math.min(820, Math.round(target.clientWidth * .72));
      const height = Math.min(330, Math.round(target.clientHeight * .65));
      if (!width || !height) return;
      target.width = width;
      target.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(size, width, height);
    }

    const observer = new ResizeObserver(() => { resize(); scheduleWater(); });
    observer.observe(target);
    resize();
    target.addEventListener("webglcontextlost", () => {
      draw = null;
      observer.disconnect();
      target.removeAttribute("data-rendered");
    });
    return (seconds, x) => {
      gl.uniform1f(time, seconds);
      gl.uniform1f(pointer, x);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!target.hasAttribute("data-rendered")) target.setAttribute("data-rendered", "");
    };
  }
})();
