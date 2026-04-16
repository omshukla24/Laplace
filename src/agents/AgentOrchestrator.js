/**
 * AgentOrchestrator.js — Sequences agent actions with realistic "thinking" delays.
 * Event-driven API for the HUD to consume.
 */
export class AgentOrchestrator {
  constructor(llmService, graphData) {
    this.llmService = llmService;
    this.graphData = graphData;
    this.listeners = {
      agentStart: [],
      agentThinking: [],
      agentAction: [],
      agentResult: [],
      agentComplete: [],
      stepComplete: [],
    };
    this.isRunning = false;
    this.currentAgent = null;
    this.abortController = null;
  }

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  /**
   * Run an agent script (from agent-scripts.json or Gemini)
   * @param {Object} agentIdentity - { name, icon, class, thoughts: [...] }
   * @param {string} stepName - e.g., 'analyze', 'whatif'
   * @returns {Promise} resolves when agent finishes
   */
  async runAgent(agentIdentity, stepName) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentAgent = agentIdentity;
    this.abortController = new AbortController();

    this.emit('agentStart', {
      name: agentIdentity.name,
      icon: agentIdentity.icon,
      agentClass: agentIdentity.class,
      step: stepName,
    });

    let thoughts = agentIdentity.thoughts;

    // IF LLM is configured, dynamically generate thoughts instead of using static ones
    if (this.llmService && this.llmService.isConfigured()) {
      this.emit('agentThinking', { text: "Connecting to Deepmind LLM core...", progress: 0.1, index: 0 });
      const dynamicThoughts = await this.llmService.generateThoughts(agentIdentity, this.graphData, stepName);
      if (dynamicThoughts && Array.isArray(dynamicThoughts)) {
        thoughts = dynamicThoughts;
      }
    }
    const totalThoughts = thoughts.length;

    for (let i = 0; i < thoughts.length; i++) {
      if (this.abortController.signal.aborted) break;

      const thought = thoughts[i];
      const progress = (i + 1) / totalThoughts;

      // Wait for the thought delay
      if (thought.delay > 0) {
        await this.delay(thought.delay, this.abortController.signal);
      }

      if (this.abortController.signal.aborted) break;

      // Emit the appropriate event
      switch (thought.type) {
        case 'thinking':
          this.emit('agentThinking', { text: thought.text, progress, index: i });
          break;
        case 'action':
          this.emit('agentAction', { text: thought.text, progress, index: i });
          break;
        case 'result':
          this.emit('agentResult', { text: thought.text, progress: 1, index: i });
          break;
      }
    }

    this.isRunning = false;
    this.currentAgent = null;
    this.emit('agentComplete', { step: stepName });
    this.emit('stepComplete', { step: stepName });
  }

  /**
   * Run the full auto-demo pipeline
   * @param {Object} agentScripts - All agent scripts
   * @param {Function} onStepAction - Called before each step with (stepName) to trigger graph animations
   */
  async runAutoDemo(agentScripts, onStepAction) {
    const steps = [
      { key: 'analyst', step: 'analyze' },
      { key: 'counterfactual', step: 'whatif' },
      { key: 'intervention', step: 'intervene' },
      { key: 'evolution', step: 'reveal' },  // reveal is triggered before evolution
      { key: 'evolution', step: 'evolve' },
    ];

    for (const { key, step } of steps) {
      if (this.abortController?.signal.aborted) break;

      // Trigger the step's graph action
      if (onStepAction) {
        await onStepAction(step);
      }

      // Run the agent if it corresponds
      if (step === 'reveal') {
        // Reveal doesn't use a separate agent — it's handled by onStepAction
        await this.delay(2000);
        continue;
      }

      const script = agentScripts[key];
      if (script) {
        await this.runAgent(script, step);
        // Pause between agents
        await this.delay(1500);
      }
    }
  }

  /**
   * Abort current agent run
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
    this.currentAgent = null;
  }

  /**
   * Promise-based delay with abort support
   */
  delay(ms, signal = null) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve(); // Resolve instead of reject to allow graceful cleanup
        });
      }
    });
  }
}
