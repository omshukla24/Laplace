/**
 * main.js — L.A.P.L.A.C.E. Entry Point
 * Logical Architecture for Predictive Learning and Autonomous Causal Evolution
 */
import { SceneManager } from './engine/SceneManager.js';
import { CausalGraph3D } from './engine/CausalGraph3D.js';
import { AudioEngine } from './engine/AudioEngine.js';
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
  const audioEngine = new AudioEngine();
  const hud = new HUD(audioEngine);
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

  hud.updateLoadingProgress(30, 'Initializing Three.js renderer...');
  await delay(300);

  const container = document.getElementById('canvas-container');
  const sceneManager = new SceneManager(container);

  hud.updateLoadingProgress(50, 'Computing force-directed layout...');
  await delay(300);

  const graph3D = new CausalGraph3D(sceneManager, causalGraphData, audioEngine);

  hud.updateLoadingProgress(70, 'Initializing agent orchestrator...');
  await delay(300);

  const orchestrator = new AgentOrchestrator(llmService, causalGraphData);
  const analystAgent = new AnalystAgent(graph3D, causalGraphData);
  const counterfactualAgent = new CounterfactualAgent(graph3D, causalGraphData);
  const interventionAgent = new InterventionAgent(graph3D, causalGraphData);
  const evolutionAgentVisual = new EvolutionAgentVisual(graph3D, causalGraphData);
  const evolutionEngine = new EvolutionEngine(causalGraphData);

  hud.connectOrchestrator(orchestrator);

  hud.updateLoadingProgress(85, 'Calibrating causal engine...');
  await delay(300);

  hud.updateMetrics(causalGraphData.nodes.length, causalGraphData.edges.length, 0, 0);

  hud.updateLoadingProgress(100, 'L.A.P.L.A.C.E. ready.');
  await delay(600);

  sceneManager.start();
  hud.hideLoadingScreen();

  const allowAudio = () => {
    audioEngine.resume();
    audioEngine.startAmbient();
    document.removeEventListener('click', allowAudio);
  };
  document.addEventListener('click', allowAudio);

  document.querySelectorAll('button, select, input').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (!el.disabled) audioEngine.playHover();
    });
  });

  const getActiveAgents = () => agentScriptsData.agents || agentScriptsData['incident_spike'] || agentScriptsData;

  const handleLlmPhase = async (stepBtnId, executionLogic) => {
    audioEngine.playClick();
    state.isRunning = true;
    hud.disableAllButtons();
    hud.setButtonRunning(stepBtnId, true);

    try {
      await executionLogic();
    } catch(e) {
      if (e.message === 'LLM_RATE_LIMIT' || e.message === 'LLM_AUTH_ERROR') {
        hud.appendTerminal(`\n[SYSTEM ERR] Gemini API limit or auth error. Please provide API Key to continue.`);
        hud.showAuthModal();
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
      audioEngine.playSuccess();
      handleLlmPhaseComplete('btn-intervene', 'btn-reveal');
    });
  };
  document.getElementById('btn-intervene')?.addEventListener('click', async () => { if (!state.isRunning) await runIntervene().catch(()=>{}); });

  // REVEAL
  const runReveal = async () => {
    audioEngine.playClick();
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

      audioEngine.playSuccess();
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
    audioEngine.playClick();
    
    graph3D.resetAllNodes();
    graph3D.resetAllEdges();
    graph3D.resetCamera();
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
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

boot().catch(err => {
  console.error('[L.A.P.L.A.C.E.] Fatal boot error:', err);
  const status = document.querySelector('.loading-status');
  if (status) status.textContent = `Error: ${err.message}`;
});
