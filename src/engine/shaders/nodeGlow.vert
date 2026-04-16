// Node Glow Vertex Shader
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vActivation;

attribute float activation;
attribute vec3 nodeColor;

varying vec3 vNodeColor;

void main() {
  vActivation = activation;
  vNodeColor = nodeColor;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;

  // Slight scale pulse based on activation
  vec3 pos = position * (1.0 + activation * 0.15);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
