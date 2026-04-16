// Ripple Fragment Shader
varying vec2 vUv;

uniform float uTime;
uniform float uProgress;
uniform vec3 uColor;

void main() {
  vec2 center = vec2(0.5);
  float dist = distance(vUv, center) * 2.0;

  // Ring pattern that expands
  float ring = smoothstep(uProgress - 0.08, uProgress, dist) *
               smoothstep(uProgress + 0.08, uProgress, dist);

  // Fade out as it expands
  float fade = 1.0 - uProgress;
  fade = fade * fade; // quadratic falloff

  vec3 color = uColor * ring * fade * 2.0;
  float alpha = ring * fade * 0.8;

  gl_FragColor = vec4(color, alpha);
}
