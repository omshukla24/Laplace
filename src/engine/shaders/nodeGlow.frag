// Node Glow Fragment Shader
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vActivation;
varying vec3 vNodeColor;

uniform float uTime;

void main() {
  // Fresnel effect for edge glow
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = 1.0 - abs(dot(viewDir, vNormal));
  fresnel = pow(fresnel, 2.5);

  // Pulsing glow
  float pulse = 0.8 + 0.2 * sin(uTime * 2.0 + vActivation * 6.28);

  // Base color with fresnel rim
  vec3 baseColor = vNodeColor * 0.6;
  vec3 rimColor = vNodeColor * 1.5;
  vec3 color = mix(baseColor, rimColor, fresnel * pulse);

  // Core brightness based on activation
  float coreBright = 0.3 + vActivation * 0.7;
  color += vNodeColor * coreBright * (1.0 - fresnel);

  // Alpha with fresnel
  float alpha = 0.7 + fresnel * 0.3;

  gl_FragColor = vec4(color, alpha);
}
