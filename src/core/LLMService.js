/**
 * LLMService.js — Zero-dependency interface for Gemini API.
 * Uses REST API directly via fetch to maintain 0 project dependencies.
 */

export class LLMService {
  constructor() {
    this.primaryApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    this.localApiKey = localStorage.getItem('laplace_gemini_key') || '';
  }

  get activeKey() {
    // Prefer user API key from cache over build env key
    return (this.localApiKey && this.localApiKey.length > 5) ? this.localApiKey : this.primaryApiKey;
  }

  setLocalKey(key) {
    this.localApiKey = key;
    if (key) {
      localStorage.setItem('laplace_gemini_key', key);
    } else {
      localStorage.removeItem('laplace_gemini_key');
    }
  }

  isConfigured() {
    const key = this.activeKey;
    return !!key && key.length > 5;
  }

  async generateThoughts(agentIdentity, graphData, stepName) {
    if (!this.isConfigured()) return null;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.activeKey}`;

    const systemPrompt = `
You are the ${agentIdentity.name} in the LAPLACE Autonomous Causal Intelligence system.
Your role: ${agentIdentity.description}

You are currently executing the step: ${stepName}.
The current state of the system is a causal graph (Structural Causal Model) containing software metrics.

You must output your reasoning as a JSON array exactly matching this schema:
[
  { "type": "thinking", "text": "...", "delay": 800 },
  { "type": "action", "text": "...", "delay": 800 },
  { "type": "result", "text": "...", "delay": 0 }
]

Keep it concise, deeply analytical, and use 'delay' values between 600 and 1500 (in milliseconds). The final thought must be of type "result".
`;

    const contextData = {
       nodes: graphData.nodes,
       edges: graphData.edges,
       currentValues: graphData.temporalStates.T0.values
    };

    const payload = {
      contents: [{
        parts: [{ text: `Generate your agent thoughts based on the following system context:\n\n${JSON.stringify(contextData, null, 2)}` }]
      }],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[LLMService] API Error:', errText);
        // Throw specific error for orchestrator to catch and prompt UI
        if (response.status === 429) throw new Error('LLM_RATE_LIMIT');
        if (response.status === 400 || response.status === 403) throw new Error('LLM_AUTH_ERROR');
        return null; // Silent fallback for general errors
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      return JSON.parse(rawText);
    } catch (e) {
      if (e.message === 'LLM_RATE_LIMIT' || e.message === 'LLM_AUTH_ERROR') throw e;
      console.error('[LLMService] Failed to generate thoughts:', e);
      return null;
    }
  }
}
