/**
 * EvolutionAgent.js — Compares predictions to ground truth and evolves the model.
 * The visual manifestation of L.A.P.L.A.C.E.'s self-improvement.
 */

export class EvolutionAgentVisual {
  constructor(graph3D, graphData) {
    this.graph3D = graph3D;
    this.graphData = graphData;
  }

  /**
   * Reveal ground truth: show actual values vs predicted.
   * @param {Object} scenario - { apply_state, comparison_nodes }
   * @param {Object} predictedValues - T1 predicted values
   * @param {Object} temporalStates - From causal-graph.json
   */
  async reveal(scenario, predictedValues, temporalStates) {
    const { comparison_nodes } = scenario;
    const actualValues = temporalStates.T_actual?.values || {};

    this.graph3D.resetAllNodes();

    for (const nodeId of comparison_nodes) {
      await this.delay(400);

      const predicted = predictedValues[nodeId];
      const actual = actualValues[nodeId];
      const error = Math.abs(predicted - actual);

      // Color by accuracy: green if close, yellow if moderate, red if off
      let color;
      if (error < 0.03) color = '#00ff88';       // Accurate
      else if (error < 0.06) color = '#ffd700';   // Close
      else color = '#ff3355';                      // Off

      this.graph3D.highlightNode(nodeId, color, 1.5);
      this.graph3D.updateNodeValue(nodeId, actual);
      this.graph3D.fireRipple(nodeId, color);
    }
  }

  /**
   * Animate the evolution: flash corrected edges, show weight changes.
   * @param {Object} scenario - { weight_corrections }
   * @param {Object} evolutionResults - From EvolutionEngine.runEvolution()
   */
  async evolve(scenario, evolutionResults) {
    const { corrections } = evolutionResults;

    // Flash each corrected edge
    for (const correction of corrections) {
      await this.delay(500);
      this.graph3D.flashEdge(correction.source, correction.target, '#ff3355', correction.newWeight);
    }

    await this.delay(800);

    // Reset graph to a calm "evolved" state with golden glow
    this.graph3D.nodeMap.forEach((mesh, nodeId) => {
      this.graph3D.transitionNodeColor(nodeId, '#ffd700');
    });

    await this.delay(500);

    // Settle back to original category colors
    this.graphData.nodes.forEach(node => {
      const color = this.graphData.categoryColors[node.category] || '#00f0ff';
      setTimeout(() => {
        this.graph3D.transitionNodeColor(node.id, color);
      }, 300);
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
