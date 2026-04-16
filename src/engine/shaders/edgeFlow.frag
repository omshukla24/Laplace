// Edge Flow Fragment Shader
varying vec3 vEdgeColor;
varying float vProgress;

uniform float uTime;

void main() {
  // Animated flow pattern
  float flow = fract(vProgress - uTime * 0.5);
  float pulse = smoothstep(0.0, 0.15, flow) * smoothstep(0.5, 0.35, flow);

  vec3 color = vEdgeColor * (0.3 + pulse * 0.7);
  float alpha = 0.2 + pulse * 0.6;

  gl_FragColor = vec4(color, alpha);
}
