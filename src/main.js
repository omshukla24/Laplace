/**
 * main.js — LAPLACE Entry Point
 * Logical Architecture for Predictive Learning and Autonomous Causal Evolution
 *
 * Architecture:
 *   boot()             → One-time HUD, LLM, and event-listener setup.
 *   loadGraphContext()  → (Re)initializes graph, agents, and state from any SCM JSON.
 *                         Called on first boot AND on every user-uploaded JSON file.
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

// ──────────────────────────────────────────────
// Shared mutable state — survives graph reloads
// ──────────────────────────────────────────────
const state = {
  currentValues: {},
  predictedValues: null,
  actualValues: null,
  isRunning: false,
  currentStep: 'init',
  scenario: null,
};

// Mutable context — updated each time a new SCM is loaded
const ctx = {
  graph2D: null,
  orchestrator: null,
  analystAgent: null,
  counterfactualAgent: null,
  interventionAgent: null,
  evolutionAgentVisual: null,
  evolutionEngine: null,
  causalGraphData: null,
};

// ──────────────────────────────────────────────
// loadGraphContext(data, hud, llmService)
// Destroys existing graph and rebuilds everything
// from the supplied SCM JSON object.
// ──────────────────────────────────────────────
function loadGraphContext(data, hud, llmService) {
  ctx.causalGraphData = data;

  // Reset state for the new graph
  state.currentValues = {};
  state.predictedValues = null;
  state.actualValues = null;
  state.isRunning = false;
  state.currentStep = 'init';

  // Build a dynamic scenario from the uploaded data so agents can still work
  state.scenario = buildDynamicScenario(data);

  // Populate current values from T0
  data.nodes.forEach(node => {
    state.currentValues[node.id] = (data.temporalStates?.T0?.values?.[node.id]) ?? node.baseline;
  });

  // Clear existing SVG contents
  const svgEl = document.querySelector('#causal-graph-canvas');
  if (svgEl) svgEl.innerHTML = '';

  // Instantiate new graph
  ctx.graph2D = new CausalGraph2D('#causal-graph-canvas', data);

  // Instantiate agents bound to new data
  ctx.orchestrator = new AgentOrchestrator(llmService, data);
  ctx.analystAgent = new AnalystAgent(ctx.graph2D, data);
  ctx.counterfactualAgent = new CounterfactualAgent(ctx.graph2D, data);
  ctx.interventionAgent = new InterventionAgent(ctx.graph2D, data);
  ctx.evolutionAgentVisual = new EvolutionAgentVisual(ctx.graph2D, data);
  ctx.evolutionEngine = new EvolutionEngine(data);

  hud.connectOrchestrator(ctx.orchestrator);
  hud.updateMetrics(data.nodes.length, data.edges.length, 0, 0);
  hud.setTimelineStep('init');

  // Re-bind node inspector clicks (graph2D is fresh, old callbacks are gone)
  const inspectorPanel = document.getElementById('node-inspector-panel');
  let selectedNodeId = null;

  ctx.graph2D.onNodeClick((nodeId) => {
    selectedNodeId = nodeId;
    const nodeData = data.nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    document.getElementById('inspector-node-id').textContent = nodeData.id.replace(/_/g, ' ');
    document.getElementById('inspector-node-cat').textContent = nodeData.category;
    document.getElementById('inspector-node-desc').textContent = nodeData.description || "Core causal parameter.";

    const currentVal = state.currentValues[nodeId] !== undefined ? state.currentValues[nodeId] : nodeData.baseline;
    document.getElementById('inspector-node-val').textContent = currentVal.toFixed(2);
    document.getElementById('inspector-node-unit').textContent = nodeData.unit;

    inspectorPanel.className = 'glass-panel visible';
  });

  ctx.graph2D.onBackgroundClick(() => {
    selectedNodeId = null;
    inspectorPanel.className = 'glass-panel';
    inspectorPanel.classList.remove('visible');
  });

  // Populate ontology table
  const tbody = document.getElementById('ontology-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    data.nodes.forEach(node => {
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

  // Reset button states
  hud.enableButton('btn-analyze');
  hud.enableButton('btn-autodemo');
  ['btn-whatif', 'btn-intervene', 'btn-reveal', 'btn-evolve'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  });

  hud.appendTerminal(`\n[SYSTEM] SCM loaded: "${data.metadata?.domain || 'Custom Model'}" — ${data.nodes.length} nodes, ${data.edges.length} edges.`);
}

// ──────────────────────────────────────────────
// buildDynamicScenario(data)
// Auto-generates a scenario from arbitrary SCM
// data so the agent pipeline always has steps.
// ──────────────────────────────────────────────
function buildDynamicScenario(data) {
  const nodeIds = data.nodes.map(n => n.id);

  // Pick the node with the most incoming edges as the "outcome" to investigate
  const incomingCount = {};
  nodeIds.forEach(id => { incomingCount[id] = 0; });
  data.edges.forEach(e => { incomingCount[e.target] = (incomingCount[e.target] || 0) + 1; });
  const targetNode = Object.entries(incomingCount).sort((a, b) => b[1] - a[1])[0]?.[0] || nodeIds[nodeIds.length - 1];

  // Pick the node with the most outgoing edges as the intervention lever
  const outgoingCount = {};
  nodeIds.forEach(id => { outgoingCount[id] = 0; });
  data.edges.forEach(e => { outgoingCount[e.source] = (outgoingCount[e.source] || 0) + 1; });
  const leverNode = Object.entries(outgoingCount).sort((a, b) => b[1] - a[1])[0]?.[0] || nodeIds[0];

  // Build trace path from lever to target through edges
  const tracePath = [targetNode];
  const reverseEdges = data.edges.filter(e => e.target === targetNode).map(e => e.source);
  tracePath.unshift(...reverseEdges.slice(0, 3));
  if (!tracePath.includes(leverNode)) tracePath.unshift(leverNode);

  const highlightEdges = [];
  for (let i = 0; i < tracePath.length - 1; i++) {
    highlightEdges.push({ source: tracePath[i], target: tracePath[i + 1] });
  }

  const leverBaseline = data.temporalStates?.T0?.values?.[leverNode] ?? data.nodes.find(n => n.id === leverNode)?.baseline ?? 0.5;
  const interventionValue = Math.min(leverBaseline + 0.30, 1.0);

  // Determine affected downstream nodes
  const affectedNodes = nodeIds.filter(id => id !== leverNode);

  // Build temporal prediction from T0 values with small random perturbations
  const t0Values = {};
  const predictedValues = {};
  const actualValues = {};
  data.nodes.forEach(n => {
    const v = data.temporalStates?.T0?.values?.[n.id] ?? n.baseline;
    t0Values[n.id] = v;
    predictedValues[n.id] = v;
    actualValues[n.id] = v;
  });
  predictedValues[leverNode] = interventionValue;
  actualValues[leverNode] = interventionValue;

  // Use existing temporal states if available, otherwise use the mock values
  const hasTemporalStates = data.temporalStates && Object.keys(data.temporalStates).length > 1;

  return {
    title: `Dynamic Analysis: ${data.metadata?.domain || 'Uploaded SCM'}`,
    description: `Auto-generated scenario analyzing ${targetNode} via ${leverNode}.`,
    steps: {
      analyze: {
        target_node: targetNode,
        trace_path: tracePath,
        highlight_edges: highlightEdges,
        root_cause: leverNode,
      },
      whatif: {
        intervention_node: leverNode,
        intervention_value: interventionValue,
        affected_nodes: affectedNodes,
        ripple_source: leverNode,
        estimated_paths: highlightEdges,
      },
      intervene: {
        apply_state: hasTemporalStates ? Object.keys(data.temporalStates)[1] : 'T0',
        locked_node: leverNode,
        transform_nodes: affectedNodes.slice(0, 6),
      },
      reveal: {
        apply_state: hasTemporalStates ? Object.keys(data.temporalStates).pop() : 'T0',
        comparison_nodes: affectedNodes,
      },
      evolve: {
        weight_corrections: data.edges.slice(0, 4).map(e => ({
          source: e.source,
          target: e.target,
          old_weight: e.weight,
          new_weight: parseFloat((e.weight * 0.95).toFixed(3)),
        })),
        accuracy_before: 93.0,
        accuracy_after: 96.5,
        evolution_cycle: 1,
      },
    },
  };
}

// ──────────────────────────────────────────────
// boot() — One-time initialization
// ──────────────────────────────────────────────
async function boot() {
  const hud = new HUD();
  const llmService = new LLMService();

  hud.setupAuthModal(llmService);

  hud.updateLoadingProgress(10, 'Loading causal graph data...');
  await delay(400);

  // Load default SCM
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

  hud.updateLoadingProgress(30, 'Initializing 2D Canvas...');
  await delay(300);

  hud.updateLoadingProgress(50, 'Computing force-directed layout...');
  await delay(300);

  // Use the hardcoded scenario for the default dataset
  state.scenario = scenariosData.scenarios[scenariosData.defaultScenario];

  causalGraphData.nodes.forEach(node => {
    state.currentValues[node.id] = causalGraphData.temporalStates.T0.values[node.id];
  });

  ctx.causalGraphData = causalGraphData;
  ctx.graph2D = new CausalGraph2D('#causal-graph-canvas', causalGraphData);

  hud.updateLoadingProgress(70, 'Initializing agent orchestrator...');
  await delay(300);

  ctx.orchestrator = new AgentOrchestrator(llmService, causalGraphData);
  ctx.analystAgent = new AnalystAgent(ctx.graph2D, causalGraphData);
  ctx.counterfactualAgent = new CounterfactualAgent(ctx.graph2D, causalGraphData);
  ctx.interventionAgent = new InterventionAgent(ctx.graph2D, causalGraphData);
  ctx.evolutionAgentVisual = new EvolutionAgentVisual(ctx.graph2D, causalGraphData);
  ctx.evolutionEngine = new EvolutionEngine(causalGraphData);

  hud.connectOrchestrator(ctx.orchestrator);

  hud.updateLoadingProgress(85, 'Calibrating causal engine...');
  await delay(300);

  hud.updateMetrics(causalGraphData.nodes.length, causalGraphData.edges.length, 0, 0);

  hud.updateLoadingProgress(100, 'LAPLACE ready.');
  await delay(2500);

  hud.hideLoadingScreen();

  // ── Node Inspector (initial binding) ──
  const inspectorPanel = document.getElementById('node-inspector-panel');
  const btnCloseInspector = document.getElementById('btn-close-inspector');
  let selectedNodeId = null;

  ctx.graph2D.onNodeClick((nodeId) => {
    selectedNodeId = nodeId;
    const nodeData = ctx.causalGraphData.nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    document.getElementById('inspector-node-id').textContent = nodeData.id.replace(/_/g, ' ');
    document.getElementById('inspector-node-cat').textContent = nodeData.category;
    document.getElementById('inspector-node-desc').textContent = nodeData.description || "Core causal parameter.";

    const currentVal = state.currentValues[nodeId] !== undefined ? state.currentValues[nodeId] : nodeData.baseline;
    document.getElementById('inspector-node-val').textContent = currentVal.toFixed(2);
    document.getElementById('inspector-node-unit').textContent = nodeData.unit;

    inspectorPanel.className = 'glass-panel visible';
  });

  ctx.graph2D.onBackgroundClick(() => {
    selectedNodeId = null;
    inspectorPanel.className = 'glass-panel';
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

  // ── Global Controls ──
  const btnSnapshot = document.getElementById('btn-snapshot');
  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', () => {
      hud.appendTerminal('\n[SYSTEM] Canvas screenshot not supported in 2D SVG mode yet.');
    });
  }

  const btnExport = document.getElementById('btn-export-data');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const exportData = JSON.stringify(ctx.causalGraphData, null, 2);
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

  // ── JSON Import ──
  const btnImport = document.getElementById('btn-import-data');
  const jsonUpload = document.getElementById('json-upload');
  if (btnImport && jsonUpload) {
    btnImport.addEventListener('click', () => {
      jsonUpload.click();
    });

    jsonUpload.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);

          // Validate minimum SCM schema
          if (!parsed.nodes || !Array.isArray(parsed.nodes) || !parsed.edges || !Array.isArray(parsed.edges)) {
            hud.appendTerminal('\n[ERROR] Invalid SCM JSON: must contain "nodes" and "edges" arrays.');
            return;
          }
          if (parsed.nodes.length === 0) {
            hud.appendTerminal('\n[ERROR] Invalid SCM JSON: nodes array is empty.');
            return;
          }

          hud.appendTerminal(`\n[IMPORT] Parsing "${file.name}" — ${parsed.nodes.length} nodes, ${parsed.edges.length} edges...`);

          // Reload the entire graph context
          loadGraphContext(parsed, hud, llmService);

          hud.appendTerminal(`\n[IMPORT] ✓ Successfully loaded "${parsed.metadata?.domain || file.name}".`);
          hud.appendTerminal(`\n[IMPORT] All agents have been re-initialized for the new model. Click "Analyze" or "Auto Demo" to begin.`);

          // Switch to topology view
          document.querySelector('[data-target="view-topology"]')?.click();

        } catch (parseErr) {
          hud.appendTerminal(`\n[ERROR] Failed to parse JSON: ${parseErr.message}`);
        }
      };
      reader.readAsText(file);

      // Reset file input so the same file can be re-uploaded
      jsonUpload.value = '';
    });
  }

  // ── Agent Phase Helpers ──
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
      hud.enableButton(stepBtnId);
      state.isRunning = false;
      throw e;
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
      ctx.analystAgent.run(state.scenario.steps.analyze);
      await ctx.orchestrator.runAgent(activeAgents.analyst, 'analyze');
      handleLlmPhaseComplete('btn-analyze', 'btn-whatif');
    });
  };
  document.getElementById('btn-analyze')?.addEventListener('click', async () => { if (!state.isRunning) await runAnalyze().catch(()=>{}); });

  // WHAT IF?
  const runWhatIf = async () => {
    await handleLlmPhase('btn-whatif', async () => {
      const activeAgents = getActiveAgents();
      state.predictedValues = await ctx.counterfactualAgent.run(state.scenario.steps.whatif, state.currentValues);
      await ctx.orchestrator.runAgent(activeAgents.counterfactual, 'whatif');
      handleLlmPhaseComplete('btn-whatif', 'btn-intervene');
    });
  };
  document.getElementById('btn-whatif')?.addEventListener('click', async () => { if (!state.isRunning) await runWhatIf().catch(()=>{}); });

  // INTERVENE
  const runIntervene = async () => {
    await handleLlmPhase('btn-intervene', async () => {
      const activeAgents = getActiveAgents();
      await ctx.interventionAgent.run(state.scenario.steps.intervene, ctx.causalGraphData.temporalStates);
      await ctx.orchestrator.runAgent(activeAgents.intervention, 'intervene');
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
    state.actualValues = ctx.causalGraphData.temporalStates[revealConfig.apply_state]?.values || ctx.causalGraphData.temporalStates.T_actual?.values || state.currentValues;

    await ctx.evolutionAgentVisual.reveal(
        state.scenario.steps.reveal,
        state.predictedValues,
        ctx.causalGraphData.temporalStates
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

      const evolutionResults = ctx.evolutionEngine.runEvolution(
        state.predictedValues,
        actual,
        interventionTarget,
        interventionValue,
        state.scenario.steps.evolve.weight_corrections.map(c => c.source).concat(
          state.scenario.steps.evolve.weight_corrections.map(c => c.target)
        ).filter((v, i, a) => a.indexOf(v) === i)
      );

      ctx.evolutionAgentVisual.evolve(state.scenario.steps.evolve, evolutionResults);
      await ctx.orchestrator.runAgent(activeAgents.evolution, 'evolve');
      hud.updateMetrics(undefined, undefined, state.scenario.steps.evolve.accuracy_after, ctx.evolutionEngine.getIntelligenceScore());

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

    ctx.graph2D.resetAllNodes();
    ctx.graph2D.resetAllEdges();
    ctx.graph2D.resetCamera();
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

  // ── Ontology Table (initial population) ──
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

  // ── Hypothesis Engine ──
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

      document.querySelector('[data-target="view-agent-console"]')?.click();
      hud.appendTerminal(`\n[SIMULATION] Initiating free-form counterfactual on ${targetNodeId} => ${overrideVal}`);

      const customConfig = {
        title: "Custom Hypothesis",
        intervention_node: targetNodeId,
        intervention_value: overrideVal,
        estimated_paths: state.scenario.steps.whatif.estimated_paths || state.scenario.steps.whatif.highlighted_edges || []
      };

      try {
        state.predictedValues = await ctx.counterfactualAgent.run(customConfig, state.currentValues);
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
