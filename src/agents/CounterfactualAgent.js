/**
 * CounterfactualAgent.js — "What If?" simulation via causal propagation.
 * Animates the ripple of effects through the graph.
 */
import { CausalMath } from '../core/CausalMath.js';

export class CounterfactualAgent {
  constructor(graph3D, graphData) {
    this.graph3D = graph3D;
    this.graphData = graphData;
  }

  /**
   * Run counterfactual: propagate intervention effects through graph.
   * @param {Object} scenario - { intervention_node, intervention_value, affected_nodes, ripple_source }
   * @param {Object} currentValues - Current node values
   * @returns {Object} predicted values
   */
  async run(scenario, currentValues) {
    const { intervention_node, intervention_value, affected_nodes, ripple_source } = scenario;

    // Highlight the intervention node
    this.graph3D.highlightNode(intervention_node, '#ff006e', 2.5);
    this.graph3D.fireRipple(intervention_node, '#ff006e');

    await this.delay(600);

    // Compute the propagation
    const predictedValues = CausalMath.propagateIntervention(
      this.graphData, currentValues, intervention_node, intervention_value
    );

    // Animate each downstream node changing
    const downstream = CausalMath.getDownstreamNodes(this.graphData, intervention_node);

    for (const nodeId of downstream) {
      const validAffectedNodes = affected_nodes || downstream;
      if (!validAffectedNodes.includes(nodeId)) continue;

      await this.delay(300);

      const oldVal = currentValues[nodeId];
      const newVal = predictedValues[nodeId];
      const delta = newVal - oldVal;

      // Color based on improvement
      const color = delta < 0 ? '#00ff88' : delta > 0 ? '#ff3355' : '#8892a8';

      this.graph3D.highlightNode(nodeId, color, 1.5);
      this.graph3D.updateNodeValue(nodeId, newVal);
      this.graph3D.fireRipple(nodeId, color);
    }

    // Update intervention node value
    this.graph3D.updateNodeValue(intervention_node, intervention_value);

    return predictedValues;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
