(() => {
  const vertexSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    uniform highp vec2 u_rotation;
    varying vec3 v_surface;
    varying vec3 v_normal;

    vec3 rotate(vec3 point) {
      float cy = cos(u_rotation.y), sy = sin(u_rotation.y);
      float cx = cos(u_rotation.x), sx = sin(u_rotation.x);
      vec3 yaw = vec3(cy * point.x + sy * point.z, point.y, cy * point.z - sy * point.x);
      return vec3(yaw.x, cx * yaw.y - sx * yaw.z, sx * yaw.y + cx * yaw.z);
    }

    void main() {
      vec3 view = rotate(a_position);
      v_surface = a_position;
      v_normal = rotate(a_normal);
      gl_Position = vec4(view.xy * 0.961, -view.z * 0.55, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform sampler2D u_albedo;
    uniform sampler2D u_elevation;
    uniform highp vec2 u_rotation;
    uniform vec2 u_gaze;
    uniform vec2 u_elevationStep;
    varying vec3 v_surface;
    varying vec3 v_normal;

    vec3 rotate(vec3 point) {
      float cy = cos(u_rotation.y), sy = sin(u_rotation.y);
      float cx = cos(u_rotation.x), sx = sin(u_rotation.x);
      vec3 yaw = vec3(cy * point.x + sy * point.z, point.y, cy * point.z - sy * point.x);
      return vec3(yaw.x, cx * yaw.y - sx * yaw.z, sx * yaw.y + cx * yaw.z);
    }

    void main() {
      const float pi = 3.14159265;
      vec3 point = normalize(v_surface);
      vec2 uv = vec2(0.5 + atan(point.x, point.z) / (2.0 * pi), 0.5 - asin(clamp(point.y, -1.0, 1.0)) / pi);
      vec3 albedo = texture2D(u_albedo, uv).rgb;
      vec3 base = normalize(v_normal);
      vec3 east = normalize(vec3(point.z, 0.0001, -point.x));
      vec3 north = normalize(cross(point, east));
      vec2 du = vec2(u_elevationStep.x, 0.0);
      vec2 dv = vec2(0.0, u_elevationStep.y);
      float slopeX = texture2D(u_elevation, uv + du).r - texture2D(u_elevation, uv - du).r;
      float slopeY = texture2D(u_elevation, uv + dv).r - texture2D(u_elevation, uv - dv).r;
      float relief = 1.0 - smoothstep(0.80, 0.98, abs(point.y));
      vec3 normal = normalize(base + rotate(-slopeX * east + slopeY * north) * relief * 2.5);
      vec3 key = normalize(vec3(-0.93 + u_gaze.x * 0.26, 0.66 - u_gaze.y * 0.19, 0.69));
      float incident = dot(normal, key);
      float direct = pow(max(incident, 0.0), 0.83) * smoothstep(-0.04, 0.13, dot(base, key));

      float gray = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
      vec3 rock = pow(mix(albedo, vec3(gray), 0.7), vec3(0.82));
      float edge = pow(1.0 - max(base.z, 0.0), 5.5);
      float backlight = smoothstep(0.21, 0.89, dot(base, normalize(vec3(0.72, 0.36, -0.51))));
      vec3 keyColor = vec3(1.30, 1.22, 1.10) * direct;
      vec3 fillColor = vec3(0.064, 0.053, 0.044);
      vec3 rim = vec3(0.54, 0.25, 0.094) * edge * backlight;
      gl_FragColor = vec4(rock * (keyColor + fillColor) + rim, 1.0);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function unpack(base64, ArrayType) {
    const binary = Uint8Array.fromBase64 ? Uint8Array.fromBase64(base64) :
      Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return new ArrayType(binary.buffer);
  }

  async function decodeImage(source) {
    const image = new Image();
    image.src = source;
    await image.decode();
    return image;
  }

  function bindMap(gl, program, image, unit, uniform) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(gl.getUniformLocation(program, uniform), unit);
  }

  async function createMoon(canvas, asset) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return null;

    const [image, elevation] = await Promise.all([decodeImage(asset.texture), decodeImage(asset.elevation)]);

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const vertices = unpack(asset.vertices, Float32Array);
    const indices = unpack(asset.indices, Uint16Array);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    [ "a_position", "a_normal" ].forEach((name, index) => {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, index * 12);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    bindMap(gl, program, image, 0, "u_albedo");
    bindMap(gl, program, elevation, 1, "u_elevation");
    gl.uniform2f(gl.getUniformLocation(program, "u_elevationStep"), 1 / elevation.width, 1 / elevation.height);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    const rotation = gl.getUniformLocation(program, "u_rotation");
    const gaze = gl.getUniformLocation(program, "u_gaze");
    let side = 0;
    function sizeCanvas(width) {
      const pixels = Math.min(620, Math.round(width * Math.min(window.devicePixelRatio, 1.45)));
      if (!pixels || pixels === side) return;
      side = pixels;
      canvas.width = side;
      canvas.height = side;
      gl.viewport(0, 0, side, side);
    }
    new ResizeObserver(([entry]) => sizeCanvas(entry.contentRect.width)).observe(canvas);
    sizeCanvas(canvas.clientWidth);

    return (pitch, yaw, gazeX, gazeY) => {
      if (!side || gl.isContextLost()) return false;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(rotation, pitch, yaw);
      gl.uniform2f(gaze, gazeX, gazeY);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      return true;
    };
  }
  window.createBrahmosMoon = createMoon;
})();
