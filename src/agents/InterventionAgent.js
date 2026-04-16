/**
 * InterventionAgent.js — Deploys the recommended fix to the live causal graph.
 * Applies T1_predicted state with dramatic animations.
 */

export class InterventionAgent {
  constructor(graph3D, graphData) {
    this.graph3D = graph3D;
    this.graphData = graphData;
  }

  /**
   * Deploy the intervention.
   * @param {Object} scenario - { apply_state, locked_node, transform_nodes }
   * @param {Object} temporalStates - From causal-graph.json
   * @returns {Object} The applied state values
   */
  async run(scenario, temporalStates) {
    const { apply_state, locked_node, transform_nodes } = scenario;
    const targetValues = temporalStates[apply_state]?.values || {};

    // Lock the intervention node with a special color
    this.graph3D.highlightNode(locked_node, '#00ff88', 2.0);
    this.graph3D.transitionNodeColor(locked_node, '#00ff88');

    await this.delay(600);

    // Dramatic "deployment" sequence — transform each node
    for (const nodeId of transform_nodes) {
      await this.delay(400);

      const newVal = targetValues[nodeId];
      if (newVal === undefined) continue;

      // Flash the node
      this.graph3D.highlightNode(nodeId, '#00f0ff', 2.0);
      this.graph3D.updateNodeValue(nodeId, newVal);

      // Transition to "deployed" color
      setTimeout(() => {
        this.graph3D.transitionNodeColor(nodeId, '#00f0ff');
      }, 200);

      this.graph3D.fireRipple(nodeId, '#00f0ff');
    }

    await this.delay(600);

    // All nodes settle to a calm deployed state
    this.graph3D.resetAllNodes();

    return targetValues;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
