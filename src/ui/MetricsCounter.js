/**
 * MetricsCounter.js — Smooth animated number transitions for the dashboard.
 */
export class MetricsCounter {
  constructor() {
    this.counters = new Map();
  }

  /**
   * Register a metric element for animated counting.
   * @param {string} id - DOM element ID
   * @param {number} initialValue - Starting value
   * @param {Object} options - { suffix, decimals, duration }
   */
  register(id, initialValue = 0, options = {}) {
    const el = document.querySelector(`#${id} .metric-value`);
    if (!el) return;

    this.counters.set(id, {
      element: el,
      currentValue: initialValue,
      targetValue: initialValue,
      suffix: options.suffix || '',
      decimals: options.decimals || 0,
      duration: options.duration || 800,
      animating: false,
    });

    this.render(id);
  }

  /**
   * Animate a metric to a new value.
   * @param {string} id
   * @param {number} newValue
   */
  animateTo(id, newValue) {
    const counter = this.counters.get(id);
    if (!counter) return;

    const card = document.getElementById(id);

    counter.targetValue = newValue;
    const startValue = counter.currentValue;
    const delta = newValue - startValue;
    const startTime = performance.now();

    // Add pulse class
    if (card) {
      card.classList.add('pulse');
      setTimeout(() => card.classList.remove('pulse'), 600);
    }

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / counter.duration, 1);

      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      counter.currentValue = startValue + delta * ease;
      this.render(id);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        counter.currentValue = newValue;
        this.render(id);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Render the current value to the DOM.
   */
  render(id) {
    const counter = this.counters.get(id);
    if (!counter) return;

    const displayValue = counter.decimals > 0
      ? counter.currentValue.toFixed(counter.decimals)
      : Math.round(counter.currentValue);

    const suffix = counter.suffix
      ? `<span class="metric-unit">${counter.suffix}</span>`
      : '';

    counter.element.innerHTML = `${displayValue}${suffix}`;
  }
}
