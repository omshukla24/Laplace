// Edge Flow Vertex Shader
attribute float edgeProgress;
attribute vec3 edgeColor;

varying vec3 vEdgeColor;
varying float vProgress;

void main() {
  vEdgeColor = edgeColor;
  vProgress = edgeProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
