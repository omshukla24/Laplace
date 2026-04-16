/**
 * HUD.js — Glassmorphism heads-up display controller.
 * Wires DOM elements to agent events and manages UI state.
 */
import { TypewriterEffect } from './TypewriterEffect.js';
import { MetricsCounter } from './MetricsCounter.js';

export class HUD {
  constructor(audioEngine) {
    this.audioEngine = audioEngine;
    this.elements = {
      overlay: document.getElementById('hud-overlay'),
      agentName: document.getElementById('agent-name'),
      agentStatus: document.getElementById('agent-status'),
      agentAvatar: document.getElementById('agent-avatar'),
      agentThoughts: document.getElementById('agent-thoughts'),
      agentProgressBar: document.getElementById('agent-progress-bar'),
      terminalOutput: document.getElementById('terminal-output'),
      terminalToggle: document.getElementById('terminal-toggle'),
      terminal: document.getElementById('command-terminal'),
      loadingScreen: document.getElementById('loading-screen'),
      loadingBarFill: document.querySelector('.loading-bar-fill'),
      loadingStatus: document.querySelector('.loading-status'),
      btnSettings: document.getElementById('btn-settings'),
      authModal: document.getElementById('auth-modal'),
      btnSaveKey: document.getElementById('btn-save-key'),
      btnCloseModal: document.getElementById('btn-close-modal'),
      apiKeyInput: document.getElementById('api-key-input'),
    };

    this.typewriter = new TypewriterEffect(this.elements.agentThoughts, this.audioEngine);
    this.metrics = new MetricsCounter();

    // Register metrics
    this.metrics.register('metric-nodes', 0);
    this.metrics.register('metric-edges', 0);
    this.metrics.register('metric-accuracy', 0, { suffix: '%', decimals: 1 });
    this.metrics.register('metric-evolution', 0);

    // Timeline steps
    this.timelineSteps = ['init', 'analyze', 'whatif', 'intervene', 'reveal', 'evolve'];
    this.currentStepIndex = 0;

    this.initTerminalToggle();
  }

  setupAuthModal(llmService, onKeySaved) {
    this.elements.btnSettings.addEventListener('click', () => {
      if (this.audioEngine) this.audioEngine.playClick();
      this.showAuthModal();
    });

    this.elements.btnCloseModal.addEventListener('click', () => {
      if (this.audioEngine) this.audioEngine.playClick();
      this.hideAuthModal();
    });

    this.elements.btnSaveKey.addEventListener('click', () => {
      const key = this.elements.apiKeyInput.value.trim();
      if (key) {
        llmService.setLocalKey(key);
        if (this.audioEngine) this.audioEngine.playSuccess();
        this.hideAuthModal();
        if (onKeySaved) onKeySaved();
      }
    });

    // Initialize input with existing key if any
    this.elements.apiKeyInput.value = llmService.localApiKey;
  }

  showAuthModal() {
    this.elements.authModal.classList.remove('hidden');
  }

  hideAuthModal() {
    this.elements.authModal.classList.add('hidden');
  }

  initTerminalToggle() {
    if (this.elements.terminalToggle) {
      this.elements.terminalToggle.addEventListener('click', () => {
        this.elements.terminal.classList.toggle('collapsed');
      });
    }
  }

  // ========= Loading Screen =========

  updateLoadingProgress(percent, statusText) {
    if (this.elements.loadingBarFill) {
      this.elements.loadingBarFill.style.width = `${percent}%`;
    }
    if (this.elements.loadingStatus && statusText) {
      this.elements.loadingStatus.textContent = statusText;
    }
  }

  hideLoadingScreen() {
    if (this.elements.loadingScreen) {
      this.elements.loadingScreen.classList.add('hidden');
    }
    if (this.elements.overlay) {
      this.elements.overlay.classList.add('visible');
    }
  }

  // ========= Agent Panel =========

  setAgent(name, agentClass, statusText = 'Processing...') {
    if (this.elements.agentName) this.elements.agentName.textContent = name;
    if (this.elements.agentStatus) {
      this.elements.agentStatus.textContent = statusText;
      this.elements.agentStatus.classList.add('active');
    }
    if (this.elements.agentAvatar) {
      this.elements.agentAvatar.className = 'agent-avatar ' + agentClass;
    }

    // Clear previous thoughts
    this.typewriter.clear();

    // Reset progress
    this.setAgentProgress(0);
  }

  async addThought(text, type = 'thinking') {
    await this.typewriter.addLine(text, type);
  }

  setAgentProgress(percent) {
    if (this.elements.agentProgressBar) {
      this.elements.agentProgressBar.style.width = `${percent * 100}%`;
    }
  }

  resetAgent() {
    if (this.elements.agentName) this.elements.agentName.textContent = 'System Idle';
    if (this.elements.agentStatus) {
      this.elements.agentStatus.textContent = 'Awaiting command';
      this.elements.agentStatus.classList.remove('active');
    }
    this.setAgentProgress(0);
  }

  // ========= Terminal =========

  appendTerminal(text) {
    if (this.elements.terminalOutput) {
      this.elements.terminalOutput.textContent += '\n' + text;
      const body = document.getElementById('terminal-body');
      if (body) body.scrollTop = body.scrollHeight;
    }
  }

  // ========= Metrics =========

  updateMetrics(nodes, edges, accuracy, evolutionCycle) {
    if (nodes !== undefined) this.metrics.animateTo('metric-nodes', nodes);
    if (edges !== undefined) this.metrics.animateTo('metric-edges', edges);
    if (accuracy !== undefined) this.metrics.animateTo('metric-accuracy', accuracy);
    if (evolutionCycle !== undefined) this.metrics.animateTo('metric-evolution', evolutionCycle);
  }

  // ========= Timeline =========

  setTimelineStep(stepName) {
    const stepIndex = this.timelineSteps.indexOf(stepName);
    if (stepIndex === -1) return;

    this.timelineSteps.forEach((step, i) => {
      const el = document.getElementById(`tl-${step}`);
      if (!el) return;

      el.classList.remove('completed', 'active');
      if (i < stepIndex) el.classList.add('completed');
      else if (i === stepIndex) el.classList.add('active');
    });

    this.currentStepIndex = stepIndex;
  }

  completeTimelineStep(stepName) {
    const el = document.getElementById(`tl-${stepName}`);
    if (el) {
      el.classList.remove('active');
      el.classList.add('completed');
    }
  }

  // ========= Buttons =========

  enableButton(id) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = false;
  }

  disableButton(id) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  }

  setButtonRunning(id, running) {
    const btn = document.getElementById(id);
    if (btn) {
      if (running) btn.classList.add('running');
      else btn.classList.remove('running');
    }
  }

  disableAllButtons() {
    ['btn-analyze', 'btn-whatif', 'btn-intervene', 'btn-reveal', 'btn-evolve', 'btn-autodemo'].forEach(id => {
      this.disableButton(id);
    });
  }

  /**
   * Wire orchestrator events to HUD updates.
   */
  connectOrchestrator(orchestrator) {
    orchestrator.on('agentStart', (data) => {
      this.setAgent(data.name, data.agentClass);
      this.setTimelineStep(data.step);
      this.appendTerminal(`\n[${data.step.toUpperCase()}] ${data.name} activated`);
    });

    orchestrator.on('agentThinking', (data) => {
      this.addThought(data.text, 'thinking');
      this.setAgentProgress(data.progress);
      this.appendTerminal(`  > ${data.text}`);
    });

    orchestrator.on('agentAction', (data) => {
      this.addThought(data.text, 'action');
      this.setAgentProgress(data.progress);
      this.appendTerminal(`  ▶ ${data.text}`);
    });

    orchestrator.on('agentResult', (data) => {
      this.addThought(data.text, 'result');
      this.setAgentProgress(1);
      this.appendTerminal(`  ★ ${data.text}`);
    });

    orchestrator.on('agentComplete', (data) => {
      this.completeTimelineStep(data.step);
      this.resetAgent();
    });
  }
}
