/**
 * TypewriterEffect.js — Character-by-character text reveal with cursor blink.
 */
export class TypewriterEffect {
  constructor(container, options = {}) {
    this.container = container;
    this.speed = options.speed || 25; // ms per character
    this.queue = [];
    this.isTyping = false;
  }

  /**
   * Add a thought line to the agent panel.
   * @param {string} text - The text to type
   * @param {string} type - 'thinking' | 'action' | 'result'
   * @returns {Promise} resolves when typing is complete
   */
  async addLine(text, type = 'thinking') {
    return new Promise((resolve) => {
      const line = document.createElement('div');
      line.className = `thought-line ${type}`;

      const prefix = document.createElement('span');
      prefix.className = 'thought-prefix';
      prefix.textContent = type === 'action' ? '▶' : type === 'result' ? '★' : '>';

      const textSpan = document.createElement('span');
      textSpan.className = 'thought-text';

      line.appendChild(prefix);
      line.appendChild(textSpan);
      this.container.appendChild(line);

      // Auto-scroll
      this.container.scrollTop = this.container.scrollHeight;

      // Type character by character
      let i = 0;
      const typeChar = () => {
        if (i < text.length) {
          textSpan.textContent += text[i];
          i++;
          this.container.scrollTop = this.container.scrollHeight;
          setTimeout(typeChar, this.speed);
        } else {
          resolve();
        }
      };

      typeChar();
    });
  }

  /**
   * Clear all lines
   */
  clear() {
    // Keep the initial line
    const children = Array.from(this.container.children);
    children.forEach((child, idx) => {
      if (idx > 0) child.remove();
    });
  }
}
