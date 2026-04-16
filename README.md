# L.A.P.L.A.C.E.

**L**ogical **A**rchitecture for **P**redictive **L**earning and **A**utonomous **C**ausal **E**volution.

L.A.P.L.A.C.E. is an autonomous causal intelligence platform that transcends traditional predictive dashboards. Built with a zero-dependency cinematic WebGL engine, it visualizes complex systems as **Structural Causal Models (SCMs)** and deploys multi-agent reasoning to identify root causes, simulate counterfactuals ("What-Ifs"), and evolve system knowledge in real-time.

![L.A.P.L.A.C.E. Interface](https://via.placeholder.com/1200x600/050810/00f0ff?text=L.A.P.L.A.C.E.+Autonomous+Causal+Intelligence) <!-- Replace with real screenshot url after hosting -->

---

## Architecture & Causal Engine

At its core, L.A.P.L.A.C.E. operates on the principles of **Pearl's Do-Calculus**. Instead of identifying mere correlations, the system models directed causal pathways (e.g., `Code Churn -> Bug Density -> Incident Rate`). 

The architecture is driven by a specialized **Multi-Agent Pipeline** powered by **Gemini 2.5 Flash**:

1. **Analyst Agent**: Scans the 3D causal graph to identify anomalous nodes and performs recursive backward traces to isolate root causes.
2. **Counterfactual Agent**: Simulates interventions using the `do()` operator (e.g., *What if we strictly forced Test Coverage to 85%?*), propagating predicted outcomes across the entire network.
3. **Intervention Agent**: Deploys structural recommendations and locks causal boundaries.
4. **Evolution Agent**: Ingests ground-truth data post-intervention, computes prediction accuracy, and updates the neural weights of the causal graph via gradient descent—allowing the intelligence schema to self-evolve.

---

## Tech Stack & Project Philosophy

L.A.P.L.A.C.E. was built with an extreme **Zero-Dependency** philosophy for maximum stability, performance, and cinematic aesthetics.

- **Graphics:** Raw WebGL via `Three.js` and `d3-force-3d`. 
- **Sound:** Procedural Web Audio API engine. No external MP3/WAV assets. 
- **Framework:** Vanilla JS + CSS Glassmorphism + Vite. **No React, no bloated frameworks.**
- **AI Backend:** Direct REST API calls to `Gemini 2.5 Flash` with a client-side localized pipeline. No intermediary Node.js server required.

---

## Getting Started

### Local Deployment
1. Clone the repository: `git clone https://github.com/omshukla24/Laplace.git`
2. Install minimal build tools: `npm install`
3. Start the Vite server: `npm run dev`

### Bring Your Own Key (BYOK) Security
The platform features an enterprise-grade BYOK implementation. Your LLM API key stays entirely on your local machine.

- Drop a `.env` file in the root containing `VITE_GEMINI_API_KEY="your_key_here"`
- **Or**, simply hit the Settings gear in the L.A.P.L.A.C.E. HUD to input your key directly into local browser storage. The app will never leak your key to a backend server.

---

## Hacking / Data Ingestion

L.A.P.L.A.C.E. natively ingests schema topologies via URL. It currently hits `/default-causal-graph.json`. You can hook this dynamically to parse metrics out of Jira, PagerDuty, or Datadog by replacing the fetch path in `src/main.js`.
