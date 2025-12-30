import { CCValueElement } from './cc-value-element.js';

const template = await fetch(
  new URL('./cc-step-button.html', import.meta.url)
).then(r => r.text());

class CCStepButton extends CCValueElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = template;

    this._steps = [];
    this._values = []; // mapped 0–127 values
    this._currentIndex = 0;
    this._button = null;

    this._onClick = this._onClick.bind(this);
  }

  static get observedAttributes() {
    return ['step'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'step') this._parseSteps();
    this._render();
  }

  connectedCallback() {
    super.connectedCallback();
    this._button = this.shadowRoot.querySelector('button');
    this._parseSteps();
    this._button.addEventListener('click', this._onClick);
    this._render();
  }

  disconnectedCallback() {
    this._button.removeEventListener('click', this._onClick);
  }

  _parseSteps() {
    const attr = this.getAttribute('step');
    this._steps = attr?.split(',').map(s => s.trim()).filter(Boolean) || [''];
    this._currentIndex = 0;

    // compute evenly distributed values 0–127
    const n = this._steps.length;
    this._values = this._steps.map((_, i) =>
      n > 1 ? Math.round((i / (n - 1)) * 127) : 0
    );
  }

  _onClick() {
    this._currentIndex = (this._currentIndex + 1) % this._steps.length;
    this._render();

    const value = this._values[this._currentIndex];
    this.setValue(value).catch(console.error);
  }

  _render() {
    if (!this._button) return;
    const label = this._steps[this._currentIndex];
    this._button.textContent = label;

    const style = getComputedStyle(this._button);
    const firstColor = style.getPropertyValue('--first-step-color').trim() || '#4caf50';
    const otherColor = style.getPropertyValue('--other-step-color').trim() || '#2196f3';

    this._button.style.backgroundColor = (this._currentIndex === 0) ? firstColor : otherColor;
  }
}

customElements.define('cc-step-button', CCStepButton);
