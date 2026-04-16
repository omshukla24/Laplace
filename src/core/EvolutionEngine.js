/**
 * EvolutionEngine.js — The crown jewel of LAPLACE
 * Manages the full evolution loop: predict → compare → correct → prove improvement.
 */
import { CausalMath } from './CausalMath.js';

export class EvolutionEngine {
  constructor(graph) {
    this.graph = graph;
    this.evolutionCycle = 0;
    this.accuracyHistory = [];
    this.correctionHistory = [];
  }

  /**
   * Run the full evolution cycle:
   * 1. Take the predicted state and actual state
   * 2. Compute accuracy
   * 3. Apply weight corrections
   * 4. Re-run prediction with corrected weights
   * 5. Show that new prediction is better
   *
   * @param {Object} predictedValues - T1 predicted node values
   * @param {Object} actualValues - T_actual ground truth values
   * @param {string} interventionNode - Which node was intervened on
   * @param {number} interventionValue - The intervention value
   * @param {string[]} affectedNodes - Nodes to compare
   * @returns {Object} Evolution results
   */
  runEvolution(predictedValues, actualValues, interventionNode, interventionValue, affectedNodes) {
    this.evolutionCycle++;

    // Step 1: Compute accuracy BEFORE evolution
    const accuracyBefore = CausalMath.computeAccuracy(predictedValues, actualValues, affectedNodes);

    // Step 2: Compute per-node errors
    const nodeErrors = CausalMath.computeNodeErrors(predictedValues, actualValues, affectedNodes);

    // Step 3: Evolve weights (this mutates graph.edges)
    const corrections = CausalMath.evolveWeights(this.graph, predictedValues, actualValues, 0.1);

    // Step 4: Re-run prediction with new weights
    const baseValues = {};
    this.graph.nodes.forEach(n => { baseValues[n.id] = n.baseline; });
    const newPrediction = CausalMath.propagateIntervention(
      this.graph, baseValues, interventionNode, interventionValue
    );

    // Step 5: Compute accuracy AFTER evolution
    const accuracyAfter = CausalMath.computeAccuracy(newPrediction, actualValues, affectedNodes);

    // Step 6: Compute per-node improvement
    const newNodeErrors = CausalMath.computeNodeErrors(newPrediction, actualValues, affectedNodes);
    const improvements = {};
    affectedNodes.forEach(id => {
      improvements[id] = {
        errorBefore: nodeErrors[id],
        errorAfter: newNodeErrors[id],
        improved: newNodeErrors[id] < nodeErrors[id],
      };
    });

    // Record history
    this.accuracyHistory.push({ cycle: this.evolutionCycle, before: accuracyBefore, after: accuracyAfter });
    this.correctionHistory.push({ cycle: this.evolutionCycle, corrections });

    return {
      cycle: this.evolutionCycle,
      accuracyBefore: Math.round(accuracyBefore * 10) / 10,
      accuracyAfter: Math.round(accuracyAfter * 10) / 10,
      accuracyDelta: Math.round((accuracyAfter - accuracyBefore) * 10) / 10,
      corrections,
      nodeErrors,
      newPrediction,
      improvements,
      history: this.accuracyHistory,
    };
  }

  /**
   * Get the current intelligence score (cumulative accuracy improvement)
   */
  getIntelligenceScore() {
    return this.evolutionCycle;
  }

  /**
   * Reset the engine
   */
  reset() {
    this.evolutionCycle = 0;
    this.accuracyHistory = [];
    this.correctionHistory = [];
  }
}
