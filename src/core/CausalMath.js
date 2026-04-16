/**
 * CausalMath.js — In-browser Structural Causal Model mathematics
 * Handles causal propagation, prediction error, and weight evolution.
 */

export class CausalMath {
  /**
   * Deep clone a graph state
   */
  static cloneState(values) {
    return { ...values };
  }

  /**
   * Propagate an intervention through the causal graph using linearized structural equations.
   * Uses topological sorting to ensure parents are computed before children.
   *
   * @param {Object} graph - The full causal graph (nodes, edges)
   * @param {Object} baseValues - Current node values { nodeId: number }
   * @param {string} interventionNode - The node being intervened on (do-operator)
   * @param {number} interventionValue - The new value for the intervention node
   * @returns {Object} New values for all nodes after propagation
   */
  static propagateIntervention(graph, baseValues, interventionNode, interventionValue) {
    const newValues = this.cloneState(baseValues);
    newValues[interventionNode] = interventionValue;

    // Build adjacency list
    const adjacency = {};
    const incomingEdges = {};
    graph.nodes.forEach(n => {
      adjacency[n.id] = [];
      incomingEdges[n.id] = [];
    });
    graph.edges.forEach(e => {
      adjacency[e.source].push(e);
      incomingEdges[e.target].push(e);
    });

    // Topological sort (Kahn's algorithm)
    const inDegree = {};
    graph.nodes.forEach(n => { inDegree[n.id] = 0; });
    graph.edges.forEach(e => { inDegree[e.target]++; });

    // Remove incoming edges to intervention node (do-operator severs incoming causes)
    incomingEdges[interventionNode] = [];
    graph.edges.forEach(e => {
      if (e.target === interventionNode) {
        inDegree[interventionNode] = Math.max(0, inDegree[interventionNode] - 1);
      }
    });

    const queue = [];
    graph.nodes.forEach(n => {
      if (inDegree[n.id] === 0) queue.push(n.id);
    });

    const sorted = [];
    while (queue.length > 0) {
      const node = queue.shift();
      sorted.push(node);
      adjacency[node].forEach(edge => {
        inDegree[edge.target]--;
        if (inDegree[edge.target] === 0) {
          queue.push(edge.target);
        }
      });
    }

    // Propagate in topological order
    for (const nodeId of sorted) {
      if (nodeId === interventionNode) continue; // Intervention is fixed

      const incoming = incomingEdges[nodeId];
      if (incoming.length === 0) continue;

      // Linear structural equation: Y = baseline + Σ(weight_i * (X_i - baseline_i))
      const baseNode = graph.nodes.find(n => n.id === nodeId);
      let delta = 0;
      incoming.forEach(edge => {
        const sourceBaseline = graph.nodes.find(n => n.id === edge.source).baseline;
        const sourceDelta = newValues[edge.source] - sourceBaseline;
        delta += edge.weight * sourceDelta;
      });

      newValues[nodeId] = Math.max(0, Math.min(1, baseNode.baseline + delta));
    }

    return newValues;
  }

  /**
   * Compute per-node prediction error (absolute difference)
   * @param {Object} predicted - { nodeId: number }
   * @param {Object} actual - { nodeId: number }
   * @param {string[]} nodeIds - Nodes to compare
   * @returns {Object} { nodeId: error }
   */
  static computeNodeErrors(predicted, actual, nodeIds) {
    const errors = {};
    nodeIds.forEach(id => {
      errors[id] = Math.abs((predicted[id] || 0) - (actual[id] || 0));
    });
    return errors;
  }

  /**
   * Compute per-edge prediction error based on the downstream node errors
   * @param {Object} graph - The causal graph
   * @param {Object} nodeErrors - { nodeId: error }
   * @returns {Object[]} Array of { source, target, error, direction }
   */
  static computeEdgeErrors(graph, nodeErrors) {
    return graph.edges.map(edge => {
      const targetError = nodeErrors[edge.target] || 0;
      // Attribute error proportionally based on edge weight
      const contribution = Math.abs(edge.weight);
      return {
        source: edge.source,
        target: edge.target,
        error: targetError * contribution,
        direction: targetError > 0 ? 'over' : 'under',
        currentWeight: edge.weight,
      };
    });
  }

  /**
   * Compute overall prediction accuracy as a percentage
   * @param {Object} predicted
   * @param {Object} actual
   * @param {string[]} nodeIds
   * @returns {number} Accuracy percentage (0-100)
   */
  static computeAccuracy(predicted, actual, nodeIds) {
    const errors = this.computeNodeErrors(predicted, actual, nodeIds);
    const totalError = Object.values(errors).reduce((sum, e) => sum + e, 0);
    const meanError = totalError / nodeIds.length;
    return Math.max(0, Math.min(100, (1 - meanError) * 100));
  }

  /**
   * Evolve edge weights using gradient-descent-style correction
   * @param {Object} graph - The causal graph (mutated in place)
   * @param {Object} predicted - Predicted values
   * @param {Object} actual - Actual values
   * @param {number} learningRate - How aggressively to correct (default: 0.1)
   * @returns {Object[]} Array of corrections applied { source, target, oldWeight, newWeight }
   */
  static evolveWeights(graph, predicted, actual, learningRate = 0.1) {
    const corrections = [];
    const nodeErrors = {};
    graph.nodes.forEach(n => {
      nodeErrors[n.id] = (actual[n.id] || 0) - (predicted[n.id] || 0);
    });

    graph.edges.forEach(edge => {
      const targetError = nodeErrors[edge.target] || 0;
      if (Math.abs(targetError) < 0.001) return; // Skip negligible errors

      const sourceDelta = (predicted[edge.source] || 0) - (graph.nodes.find(n => n.id === edge.source)?.baseline || 0);
      if (Math.abs(sourceDelta) < 0.001) return;

      // Gradient: dError/dWeight ≈ sourceDelta * sign(targetError)
      const gradient = sourceDelta * Math.sign(targetError);
      const oldWeight = edge.weight;
      edge.weight += learningRate * gradient;

      // Clamp weights to [-1, 1]
      edge.weight = Math.max(-1, Math.min(1, edge.weight));

      // Round for display
      edge.weight = Math.round(edge.weight * 100) / 100;

      if (Math.abs(oldWeight - edge.weight) > 0.001) {
        corrections.push({
          source: edge.source,
          target: edge.target,
          oldWeight,
          newWeight: edge.weight,
        });
      }
    });

    return corrections;
  }

  /**
   * Get all nodes downstream of a given node (BFS)
   */
  static getDownstreamNodes(graph, nodeId) {
    const adjacency = {};
    graph.nodes.forEach(n => { adjacency[n.id] = []; });
    graph.edges.forEach(e => { adjacency[e.source].push(e.target); });

    const visited = new Set();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      (adjacency[current] || []).forEach(child => {
        if (!visited.has(child)) queue.push(child);
      });
    }
    visited.delete(nodeId); // Don't include the source itself
    return Array.from(visited);
  }

  /**
   * Trace the causal path backward from a target node (BFS backward)
   */
  static traceBackward(graph, targetNodeId) {
    const parentMap = {};
    graph.nodes.forEach(n => { parentMap[n.id] = []; });
    graph.edges.forEach(e => { parentMap[e.target].push(e.source); });

    const visited = new Set();
    const path = [];
    const queue = [targetNodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      path.push(current);
      (parentMap[current] || []).forEach(parent => {
        if (!visited.has(parent)) queue.push(parent);
      });
    }
    return path;
  }
}
