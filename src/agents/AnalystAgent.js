/**
 * AnalystAgent.js — Root-cause analysis via backward causal trace.
 * Highlights the causal chain in the 3D graph.
 */
import { CausalMath } from '../core/CausalMath.js';

export class AnalystAgent {
  constructor(graph3D, graphData) {
    this.graph3D = graph3D;
    this.graphData = graphData;
  }

  /**
   * Run the analysis: trace backward from the target node and animate the path.
   * @param {Object} scenario - The scenario step config
   * @returns {Promise}
   */
  async run(scenario) {
    const { target_node, trace_path, highlight_edges, root_cause } = scenario;

    // Reset any previous highlights
    this.graph3D.resetAllNodes();
    this.graph3D.resetAllEdges();

    // Focus on the problem node
    this.graph3D.focusOnNode(target_node);
    this.graph3D.highlightNode(target_node, '#ff3355', 2.0);
    this.graph3D.fireRipple(target_node, '#ff3355');

    await this.delay(800);

    // Fire tracer beam along the causal chain
    const reversedPath = [...trace_path];
    this.graph3D.fireTracerBeam(reversedPath, '#00f0ff');

    // Highlight each edge in sequence
    for (const edge of highlight_edges) {
      await this.delay(500);
      this.graph3D.highlightEdge(edge.source, edge.target, '#00f0ff');
      this.graph3D.highlightNode(edge.source, null, 1.2);
    }

    await this.delay(400);

    // Highlight the root cause
    this.graph3D.highlightNode(root_cause, '#ffd700', 2.5);
    this.graph3D.fireRipple(root_cause, '#ffd700');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
