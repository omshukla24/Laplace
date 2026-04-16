/**
 * main.js — LAPLACE Entry Point
 * Logical Architecture for Predictive Learning and Autonomous Causal Evolution
 */
import { CausalGraph2D } from './engine/CausalGraph2D.js';
import { AgentOrchestrator } from './agents/AgentOrchestrator.js';
import { AnalystAgent } from './agents/AnalystAgent.js';
import { CounterfactualAgent } from './agents/CounterfactualAgent.js';
import { InterventionAgent } from './agents/InterventionAgent.js';
import { EvolutionAgentVisual } from './agents/EvolutionAgent.js';
import { CausalMath } from './core/CausalMath.js';
import { EvolutionEngine } from './core/EvolutionEngine.js';
import { LLMService } from './core/LLMService.js';
import { HUD } from './ui/HUD.js';

import agentScriptsData from './data/agent-scripts.json';
import scenariosData from './data/scenarios.json';

const state = {
  currentValues: {},
  predictedValues: null,
  actualValues: null,
  isRunning: false,
  currentStep: 'init',
  scenario: null,
};

async function boot() {
  const hud = new HUD();
  const llmService = new LLMService();

  hud.setupAuthModal(llmService);

  hud.updateLoadingProgress(10, 'Loading causal graph data...');
  await delay(400);

  // Dynamic Data Ingestion
  let causalGraphData;
  try {
    const response = await fetch('/default-causal-graph.json');
    if (!response.ok) throw new Error('Failed to fetch default JSON target.');
    causalGraphData = await response.json();
  } catch (err) {
    console.error(err);
    const status = document.querySelector('.loading-status');
    if (status) status.textContent = `Data Ingestion Error: Cannot load Structural Causal Model.`;
    return;
  }

  state.scenario = scenariosData.scenarios[scenariosData.defaultScenario];

  causalGraphData.nodes.forEach(node => {
    state.currentValues[node.id] = causalGraphData.temporalStates.T0.values[node.id];
  });

  hud.updateLoadingProgress(30, 'Initializing 2D Canvas...');
  await delay(300);

  hud.updateLoadingProgress(50, 'Computing force-directed layout...');
  await delay(300);

  const graph2D = new CausalGraph2D('#causal-graph-canvas', causalGraphData);

  hud.updateLoadingProgress(70, 'Initializing agent orchestrator...');
  await delay(300);

  const orchestrator = new AgentOrchestrator(llmService, causalGraphData);
  const analystAgent = new AnalystAgent(graph2D, causalGraphData);
  const counterfactualAgent = new CounterfactualAgent(graph2D, causalGraphData);
  const interventionAgent = new InterventionAgent(graph2D, causalGraphData);
  const evolutionAgentVisual = new EvolutionAgentVisual(graph2D, causalGraphData);
  const evolutionEngine = new EvolutionEngine(causalGraphData);

  hud.connectOrchestrator(orchestrator);

  hud.updateLoadingProgress(85, 'Calibrating causal engine...');
  await delay(300);

  hud.updateMetrics(causalGraphData.nodes.length, causalGraphData.edges.length, 0, 0);

  hud.updateLoadingProgress(100, 'LAPLACE ready.');
  await delay(2500); // Extended delay to show the exact loading screen requested

  hud.hideLoadingScreen();

  // Phase 4: Node Inspector Bindings
  const inspectorPanel = document.getElementById('node-inspector-panel');
  const btnCloseInspector = document.getElementById('btn-close-inspector');
  let selectedNodeId = null;

  graph2D.onNodeClick((nodeId) => {
    selectedNodeId = nodeId;
    const nodeData = causalGraphData.nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    document.getElementById('inspector-node-id').textContent = nodeData.id.replace(/_/g, ' ');
    document.getElementById('inspector-node-cat').textContent = nodeData.category;
    document.getElementById('inspector-node-desc').textContent = nodeData.description || "Core causal parameter.";
    
    const currentVal = state.currentValues[nodeId] !== undefined ? state.currentValues[nodeId] : nodeData.baseline;
    document.getElementById('inspector-node-val').textContent = currentVal.toFixed(2);
    document.getElementById('inspector-node-unit').textContent = nodeData.unit;

    // Slide in using class
    inspectorPanel.className = 'glass-panel visible';
  });

  graph2D.onBackgroundClick(() => {
    selectedNodeId = null;
    inspectorPanel.className = 'glass-panel';
    // Removed style.right = '-400px', we now use CSS classes if needed or stick to styles
    inspectorPanel.classList.remove('visible');
  });

  if (btnCloseInspector) {
    btnCloseInspector.addEventListener('click', () => {
      selectedNodeId = null;
      inspectorPanel.classList.remove('visible');
    });
  }

  // Node controls
  document.getElementById('btn-intervene-node')?.addEventListener('click', () => {
    if (selectedNodeId) {
      document.getElementById('hypothesis-node').value = selectedNodeId;
      document.querySelector('[data-target="view-hypothesis"]').click();
      inspectorPanel.classList.remove('visible');
    }
  });

  // Phase 5: Global Controls
  const btnSnapshot = document.getElementById('btn-snapshot');
  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', () => {
      hud.appendTerminal('\n[SYSTEM] Canvas screenshot not supported in 2D SVG mode yet.');
    });
  }

  const btnExport = document.getElementById('btn-export-data');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const exportData = JSON.stringify(causalGraphData, null, 2);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LAPLACE_SCM_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      hud.appendTerminal('\n[SYSTEM] Causal graph exported to JSON.');
    });
  }

  const btnPause = document.getElementById('btn-pause-agents');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      state.isRunning = false;
      hud.enableButton('btn-analyze');
      hud.enableButton('btn-autodemo');
      hud.appendTerminal('\n[SYSTEM] Orchestrator halted. Agents paused.');
    });
  }



  const getActiveAgents = () => agentScriptsData.agents || agentScriptsData['incident_spike'] || agentScriptsData;

  const handleLlmPhase = async (stepBtnId, executionLogic) => {
    state.isRunning = true;
    hud.disableAllButtons();
    hud.setButtonRunning(stepBtnId, true);

    try {
      await executionLogic();
    } catch(e) {
      if (e.message === 'LLM_RATE_LIMIT' || e.message === 'LLM_AUTH_ERROR') {
        hud.appendTerminal(`\n[SYSTEM ERR] Gemini API limit or auth error. Please provide API Key to continue.`);
        hud.showAuthModal(true);
      } else {
        hud.appendTerminal(`\n[SYSTEM FATAL] ${e.message}`);
      }
      hud.setButtonRunning(stepBtnId, false);
      hud.enableButton(stepBtnId); // Re-enable current to try again
      state.isRunning = false;
      throw e; // Throw up to caller
    }
  };

  const handleLlmPhaseComplete = (stepBtnId, nextBtnId) => {
    hud.setButtonRunning(stepBtnId, false);
    hud.enableButton(nextBtnId);
    state.isRunning = false;
  };

  // ANALYZE
  const runAnalyze = async () => {
    await handleLlmPhase('btn-analyze', async () => {
      const activeAgents = getActiveAgents();
      analystAgent.run(state.scenario.steps.analyze);
      await orchestrator.runAgent(activeAgents.analyst, 'analyze');
      handleLlmPhaseComplete('btn-analyze', 'btn-whatif');
    });
  };
  document.getElementById('btn-analyze')?.addEventListener('click', async () => { if (!state.isRunning) await runAnalyze().catch(()=>{}); });

  // WHAT IF?
  const runWhatIf = async () => {
    await handleLlmPhase('btn-whatif', async () => {
      const activeAgents = getActiveAgents();
      state.predictedValues = await counterfactualAgent.run(state.scenario.steps.whatif, state.currentValues);
      await orchestrator.runAgent(activeAgents.counterfactual, 'whatif');
      handleLlmPhaseComplete('btn-whatif', 'btn-intervene');
    });
  };
  document.getElementById('btn-whatif')?.addEventListener('click', async () => { if (!state.isRunning) await runWhatIf().catch(()=>{}); });

  // INTERVENE
  const runIntervene = async () => {
    await handleLlmPhase('btn-intervene', async () => {
      const activeAgents = getActiveAgents();
      await interventionAgent.run(state.scenario.steps.intervene, causalGraphData.temporalStates);
      await orchestrator.runAgent(activeAgents.intervention, 'intervene');
      handleLlmPhaseComplete('btn-intervene', 'btn-reveal');
    });
  };
  document.getElementById('btn-intervene')?.addEventListener('click', async () => { if (!state.isRunning) await runIntervene().catch(()=>{}); });

  // REVEAL
  const runReveal = async () => {
    state.isRunning = true;
    hud.disableAllButtons();
    hud.setButtonRunning('btn-reveal', true);
    hud.setTimelineStep('reveal');

    const revealConfig = state.scenario.steps.reveal;
    state.actualValues = causalGraphData.temporalStates[revealConfig.apply_state]?.values || causalGraphData.temporalStates.T_actual.values;

    await evolutionAgentVisual.reveal(
        state.scenario.steps.reveal,
        state.predictedValues,
        causalGraphData.temporalStates
    );

    const accuracy = CausalMath.computeAccuracy(
      state.predictedValues,
      state.actualValues,
      state.scenario.steps.reveal.comparison_nodes
    );
    hud.updateMetrics(undefined, undefined, accuracy, undefined);
    hud.appendTerminal(`\n[REVEAL] Ground truth ingested. Prediction accuracy: ${accuracy.toFixed(1)}%`);
    hud.completeTimelineStep('reveal');

    hud.setButtonRunning('btn-reveal', false);
    hud.enableButton('btn-evolve');
    state.isRunning = false;
  };
  document.getElementById('btn-reveal')?.addEventListener('click', () => { if (!state.isRunning) runReveal(); });

  // EVOLVE
  const runEvolve = async () => {
    await handleLlmPhase('btn-evolve', async () => {
      const actual = state.actualValues;
      const interventionTarget = state.scenario.steps.whatif.intervention_node;
      const interventionValue = state.scenario.steps.whatif.intervention_value;
      const activeAgents = getActiveAgents();

      const evolutionResults = evolutionEngine.runEvolution(
        state.predictedValues,
        actual,
        interventionTarget,
        interventionValue,
        state.scenario.steps.evolve.weight_corrections.map(c => c.source).concat(
          state.scenario.steps.evolve.weight_corrections.map(c => c.target)
        ).filter((v, i, a) => a.indexOf(v) === i)
      );

      evolutionAgentVisual.evolve(state.scenario.steps.evolve, evolutionResults);
      await orchestrator.runAgent(activeAgents.evolution, 'evolve');
      hud.updateMetrics(undefined, undefined, state.scenario.steps.evolve.accuracy_after, evolutionEngine.getIntelligenceScore());

      hud.setButtonRunning('btn-evolve', false);
      hud.enableButton('btn-analyze');
      hud.enableButton('btn-autodemo');
      state.isRunning = false;
    });
  };
  document.getElementById('btn-evolve')?.addEventListener('click', async () => { if (!state.isRunning) await runEvolve().catch(()=>{}); });

  // AUTO DEMO
  document.getElementById('btn-autodemo')?.addEventListener('click', async () => {
    if (state.isRunning) return;
    
    graph2D.resetAllNodes();
    graph2D.resetAllEdges();
    graph2D.resetCamera();
    hud.setTimelineStep('init');

    hud.disableAllButtons();
    hud.setButtonRunning('btn-autodemo', true);

    try {
      await delay(500);
      await runAnalyze();
      await delay(1200);
      await runWhatIf();
      await delay(1200);
      await runIntervene();
      await delay(1500);
      await runReveal();
      await delay(1500);
      await runEvolve();
    } catch(e) {
      console.warn("Auto demo aborted due to error:", e);
    }

    hud.setButtonRunning('btn-autodemo', false);
    hud.enableButton('btn-analyze');
    hud.enableButton('btn-autodemo');
  });

  // --- PHASE 2: NEW DASHBOARD LOGIC ---

  // Populate Ontology Table
  const tbody = document.getElementById('ontology-tbody');
  if (tbody) {
    causalGraphData.nodes.forEach(node => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); color: var(--color-cyan);">${node.id}</td>
        <td><span style="background: var(--color-surface-hover); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${node.category}</span></td>
        <td style="font-family: var(--font-mono);">${node.baseline.toFixed(2)}</td>
        <td style="color: var(--color-text-muted);">${node.unit}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Bind Hypothesis Engine
  const btnHypothesis = document.getElementById('btn-run-hypothesis');
  if (btnHypothesis) {
    btnHypothesis.addEventListener('click', async () => {
      const targetNodeId = document.getElementById('hypothesis-node').value.trim();
      const overrideVal = parseFloat(document.getElementById('hypothesis-value').value);

      if (!targetNodeId || isNaN(overrideVal)) {
        hud.appendTerminal('\n[ERR] Hypothesis Engine: Invalid node ID or value.');
        return;
      }

      if (!state.currentValues[targetNodeId]) {
        hud.appendTerminal(`\n[ERR] Node '${targetNodeId}' not found in SCM.`);
        return;
      }

      btnHypothesis.textContent = "Running...";
      btnHypothesis.disabled = true;

      // Jump to console view
      document.querySelector('[data-target="view-agent-console"]')?.click();
      hud.appendTerminal(`\n[SIMULATION] Initiating free-form counterfactual on ${targetNodeId} => ${overrideVal}`);

      // Temporary scenario override
      const customConfig = {
        title: "Custom Hypothesis",
        intervention_node: targetNodeId,
        intervention_value: overrideVal,
        estimated_paths: state.scenario.steps.whatif.estimated_paths // Re-use general paths for llm context
      };

      try {
        state.predictedValues = await counterfactualAgent.run(customConfig, state.currentValues);
        hud.appendTerminal(`\n[SIMULATION] Counterfactual successfully computed.`);
      } catch (e) {
        hud.appendTerminal(`\n[ERR] Hypothesis Simulation Failed: ${e.message}`);
      }

      btnHypothesis.textContent = "Run Counterfactual Simulation";
      btnHypothesis.disabled = false;
    });
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

boot().catch(err => {
  console.error('[LAPLACE] Fatal boot error:', err);
  const status = document.querySelector('.loading-status');
  if (status) status.textContent = `Error: ${err.message}`;
});
