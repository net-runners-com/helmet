// Comic-book filter: every video frame goes through this shader (flat colours,
// inked edges, halftone shadows, anime speed lines) before the panels crop it.
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uFocus;
uniform float uSpeed;
uniform float uTime;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float lumaAt(vec2 uv) { return luma(texture2D(uTex, uv).rgb); }
float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 px = 1.5 / uRes;
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = luma(c);

  // ink: Sobel on luminance
  float tl = lumaAt(vUv + px * vec2(-1.0, 1.0)), t = lumaAt(vUv + px * vec2(0.0, 1.0)), tr = lumaAt(vUv + px * vec2(1.0, 1.0));
  float ml = lumaAt(vUv + px * vec2(-1.0, 0.0)), mr = lumaAt(vUv + px * vec2(1.0, 0.0));
  float bl = lumaAt(vUv + px * vec2(-1.0, -1.0)), b = lumaAt(vUv + px * vec2(0.0, -1.0)), br = lumaAt(vUv + px * vec2(1.0, -1.0));
  float edge = length(vec2(-tl - 2.0 * ml - bl + tr + 2.0 * mr + br, -bl - 2.0 * b - br + tl + 2.0 * t + tr));

  // punchy flat colour: saturate, add contrast, then a handful of levels
  c = mix(vec3(l), c, 1.6);
  c = (c - 0.5) * 1.25 + 0.64;
  c = floor(clamp(c, 0.0, 1.0) * 5.0 + 0.5) / 5.0;

  // Ben-Day dots where the picture is dark
  vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (vUv * uRes) / 6.0;
  float radius = (1.0 - l) * 0.6;
  float dots = 1.0 - smoothstep(radius - 0.12, radius, length(fract(g) - 0.5));
  c *= 1.0 - dots * 0.3 * smoothstep(0.8, 0.25, l);

  c = mix(c, vec3(0.03, 0.02, 0.06), smoothstep(0.25, 0.6, edge));

  // speed lines: white streaks racing in from the edges toward the car
  vec2 d = vUv - uFocus;
  d.x *= uRes.x / uRes.y;
  float a = atan(d.y, d.x) * 70.0 / 6.28318;
  float seed = hash(floor(a) * 1.7 + floor(uTime * 14.0) * 31.0);
  float thin = 1.0 - smoothstep(0.1, 0.45, abs(fract(a) - 0.5) * 2.0);
  float reach = smoothstep(0.18 + seed * 0.2, 0.75, length(d));
  c = mix(c, vec3(1.0), step(0.62, seed) * thin * reach * uSpeed);

  gl_FragColor = vec4(c, 1.0);
}`;

export function createComic(width = 720, height = 1280) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, alpha: false, antialias: false });
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (e) {
    console.error("comic shader:", e);
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  const u = Object.fromEntries(["uRes", "uFocus", "uSpeed", "uTime"].map((n) => [n, gl.getUniformLocation(program, n)]));
  gl.uniform2f(u.uRes, width, height);
  gl.viewport(0, 0, width, height);

  let last = null;
  return {
    canvas,
    // focus is in image coordinates (0,0 = top-left)
    render(img, { speed = 0, time = 0, focus = [0.5, 0.5] } = {}) {
      if (img !== last) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        last = img;
      }
      gl.uniform2f(u.uFocus, focus[0], 1 - focus[1]);
      gl.uniform1f(u.uSpeed, speed);
      gl.uniform1f(u.uTime, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
