/**
 * CausalGraph2D.js — 2D SVG force-directed causal graph renderer.
 * Using d3-force to render nodes and animated flowing lines on a flat canvas.
 * Implements the Ultimate Dark Mode aesthetic.
 */
import * as d3 from 'd3';

export class CausalGraph2D {
  constructor(svgSelector, graphData, audioEngine) {
    this.audioEngine = audioEngine;
    this.graphData = graphData;
    this.nodeMap = new Map();
    this.edgeMap = new Map();
    this.callbacks = {
      nodeClick: null,
      backgroundClick: null
    };

    // Colors from categories (Updated for Vercel/Linear Dark Mode)
    this.categoryColors = graphData.categoryColors || {
      "strategic": "#00A3FF", // Cyan/Blue
      "external": "#FF6363",  // Red
      "market": "#F2B600",    // Gold
      "internal": "#5E6AD2",  // Indigo
      "kpi": "#34D59A"        // Green
    };

    this.svg = d3.select(svgSelector);
    if (this.svg.empty()) throw new Error(`SVG Element not found: ${svgSelector}`);

    this.width = this.svg.node().parentNode.clientWidth;
    this.height = this.svg.node().parentNode.clientHeight;

    this.zoomLayer = this.svg.append('g').attr('class', 'zoom-layer');

    // Create D3 Zoom behavior
    this.zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        this.zoomLayer.attr('transform', event.transform);
      });
    
    this.svg.call(this.zoomBehavior);

    // Setup groups for proper z-indexing in SVG (edges below nodes)
    this.edgeGroup = this.zoomLayer.append('g').attr('class', 'edges');
    this.glowGroup = this.zoomLayer.append('g').attr('class', 'glow-edges');
    this.nodeGroup = this.zoomLayer.append('g').attr('class', 'nodes');
    this.labelGroup = this.zoomLayer.append('g').attr('class', 'labels');

    // Handle background clicks
    this.svg.on('click', (event) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (event.target === this.svg.node()) {
        if (this.callbacks.backgroundClick) this.callbacks.backgroundClick();
      }
    });

    this.buildGraph();
    
    // Handle Window Resize
    window.addEventListener('resize', () => {
      this.width = this.svg.node().parentNode.clientWidth;
      this.height = this.svg.node().parentNode.clientHeight;
      this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
      this.simulation.alpha(0.3).restart();
    });
  }

  buildGraph() {
    this.simNodes = this.graphData.nodes.map(n => ({ id: n.id, ...n }));
    this.simLinks = this.graphData.edges.map(e => ({ source: e.source, target: e.target, weight: e.weight }));

    // Edge bindings
    this.linkElements = this.edgeGroup.selectAll('.link-line')
      .data(this.simLinks)
      .enter().append('line')
      .attr('class', 'link-line')
      .attr('stroke-width', d => 1 + (d.weight * 2))
      .attr('id', d => `edge-${d.source.id || d.source}-${d.target.id || d.target}`);

    this.glowElements = this.glowGroup.selectAll('.link-glow')
      .data(this.simLinks)
      .enter().append('line')
      .attr('class', 'link-glow')
      .attr('stroke-width', d => 3 + (d.weight * 2))
      .attr('id', d => `glow-${d.source.id || d.source}-${d.target.id || d.target}`);

    // Node bindings
    this.nodeElements = this.nodeGroup.selectAll('.node-circle')
      .data(this.simNodes)
      .enter().append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => 8 + (d.baseline || 0.5) * 8)
      .attr('fill', d => this.categoryColors[d.category] || '#EDEDED')
      .attr('stroke', '#0a0a0a')
      .attr('stroke-width', 2)
      .attr('id', d => `node-${d.id}`)
      .call(d3.drag()
        .on('start', (event, d) => this.dragstarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragended(event, d))
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        if (this.callbacks.nodeClick) this.callbacks.nodeClick(d.id);
      })
      .on('mouseenter', (event, d) => {
        if (this.audioEngine) this.audioEngine.playHover();
      });

    // Label bindings
    this.labelElements = this.labelGroup.selectAll('.node-label')
      .data(this.simNodes)
      .enter().append('text')
      .attr('class', 'node-label')
      .text(d => d.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      .attr('dx', d => 12 + (d.baseline || 0.5) * 8)
      .attr('dy', 4);

    // D3 Force Simulation
    this.simulation = d3.forceSimulation(this.simNodes)
      .force('link', d3.forceLink(this.simLinks).id(d => d.id).distance(120).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collide', d3.forceCollide().radius(d => 12 + (d.baseline || 0) * 8).iterations(2))
      .on('tick', () => this.tick());

    // Map instances for agents
    this.simNodes.forEach(n => this.nodeMap.set(n.id, d3.select(`#node-${n.id}`)));
    this.simLinks.forEach(l => {
      this.edgeMap.set(`${l.source.id}-${l.target.id}`, d3.select(`#edge-${l.source.id}-${l.target.id}`));
    });

    // Center layout
    this.resetCamera();
  }

  tick() {
    this.linkElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    this.glowElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    this.nodeElements
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    this.labelElements
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  }

  dragstarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  dragended(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // --- External API (Bindings from main.js) ---

  onNodeClick(callback) {
    this.callbacks.nodeClick = callback;
  }

  onBackgroundClick(callback) {
    this.callbacks.backgroundClick = callback;
  }

  resetCamera() {
    this.svg.transition().duration(750).call(
      this.zoomBehavior.transform,
      d3.zoomIdentity.translate(0, 0).scale(1)
    );
  }

  resetAllNodes() {
    this.nodeGroup.selectAll('.node-circle')
      .transition().duration(400)
      .attr('fill', d => this.categoryColors[d.category] || '#EDEDED')
      .attr('stroke', '#0a0a0a')
      .attr('r', d => 8 + (d.baseline || 0.5) * 8);
  }

  resetAllEdges() {
    this.edgeGroup.selectAll('.link-line')
      .transition().duration(400)
      .attr('stroke', 'var(--color-border)')
      .style('opacity', 1);

    this.glowGroup.selectAll('.link-glow')
      .transition().duration(400)
      .style('opacity', 0);
  }

  pulseNode(nodeId, colorHex) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    // Simulate pulse by expanding and shrinking standard circle
    const baseR = parseFloat(node.attr('r'));
    node.transition()
      .duration(300)
      .attr('r', baseR * 1.5)
      .attr('stroke', colorHex)
      .attr('stroke-width', 4)
      .transition()
      .duration(600)
      .attr('r', baseR)
      .attr('stroke-width', 2);
  }

  highlightEdge(sourceId, targetId, colorHex) {
    const edgeId = `#edge-${sourceId}-${targetId}`;
    const glowId = `#glow-${sourceId}-${targetId}`;
    
    d3.select(edgeId)
      .transition()
      .duration(400)
      .attr('stroke', colorHex);

    d3.select(glowId)
      .attr('stroke', colorHex)
      .transition()
      .duration(400)
      .style('opacity', 0.6)
      .transition()
      .delay(1000)
      .duration(1000)
      .style('opacity', 0);
  }

  setNodeValue(nodeId, value, baseline) {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      // Modify radius slightly based on current value relative to baseline
      const sizeMult = Math.max(0.2, (value / baseline)); 
      const newR = (8 + baseline * 8) * (0.8 + sizeMult * 0.2);
      
      node.transition()
        .duration(800)
        .attr('r', newR);
    }
  }

  hideEdgesExcept(edgePaths) {
    // Dim all edges
    this.edgeGroup.selectAll('.link-line')
      .transition().duration(400)
      .style('opacity', 0.1);

    // Highlight specific paths
    edgePaths.forEach(pathSeg => {
      const edge = d3.select(`#edge-${pathSeg.source}-${pathSeg.target}`);
      if (!edge.empty()) {
        edge.transition().duration(400)
          .style('opacity', 1)
          .attr('stroke', '#00A3FF'); // Analyst Cyan highlight
      }
    });
  }

  // --- Polyfills for 3D Agent Methods ---
  highlightNode(nodeId, colorHex, scaleBase) {
    this.pulseNode(nodeId, colorHex);
  }

  transitionNodeColor(nodeId, colorHex) {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      node.transition().duration(400).attr('fill', colorHex);
    }
  }

  updateNodeValue(nodeId, newVal) {
    this.setNodeValue(nodeId, newVal, 1.0);
  }

  fireRipple(nodeId, colorHex) {
    this.pulseNode(nodeId, colorHex);
  }

  focusOnNode(nodeId) {
    const nodeData = this.simNodes.find(n => n.id === nodeId);
    if (nodeData) {
      this.svg.transition().duration(750).call(
        this.zoomBehavior.transform,
        d3.zoomIdentity.translate(this.width / 2 - nodeData.x * 2, this.height / 2 - nodeData.y * 2).scale(2)
      );
    }
  }

  fireTracerBeam(pathArr, colorHex) {
    for (let i = 0; i < pathArr.length - 1; i++) {
      this.highlightEdge(pathArr[i], pathArr[i+1], colorHex);
    }
  }

  flashEdge(source, target, colorHex, weight) {
    this.highlightEdge(source, target, colorHex);
  }
}
