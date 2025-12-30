import { CCValueElement } from './cc-value-element.js';

const template = await fetch(
  new URL('./cc-hslider.html', import.meta.url)
).then(r => r.text());

class CCHSlider extends CCValueElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = template;

    this._value = 0;
    this._dragging = false;

    this._stopValues = [];
    this._stopLabels = [];

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();

    this._track = this.shadowRoot.querySelector('.track');
    this._trackLow = this.shadowRoot.querySelector('.track-low');
    this._trackHigh = this.shadowRoot.querySelector('.track-high');
    this._thumb = this.shadowRoot.querySelector('.thumb');

    this._track.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    this._parseSteps();
    this._renderStops();
  }

  disconnectedCallback() {
    this._track.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  onInitialValue(value) {
    this._value = this._clamp(value);
    if (this._stopValues.length) this._value = this._snapToStop(this._value);
    this._render();
  }

  _parseSteps() {
    const attr = this.getAttribute('step');
    if (!attr) {
      this._stopLabels = [];
      this._stopValues = [];
      return;
    }
    const labels = attr.split(',').map(s => s.trim()).filter(Boolean);
    if (!labels.length) {
      this._stopLabels = [];
      this._stopValues = [];
      return;
    }
    this._stopLabels = labels;
    const n = labels.length;
    const interval = n > 1 ? 127 / (n - 1) : 0;
    this._stopValues = labels.map((_, i) => Math.round(i * interval));
  }

  _renderStops() {
    const oldLabels = this.shadowRoot.querySelectorAll('.label');
    oldLabels.forEach(l => l.remove());

    this._stopLabels.forEach((label, i) => {
      const div = document.createElement('div');
      div.textContent = label;
      div.className = 'label';

      const ratio = this._stopValues[i] / 127;
      div.style.bottom = `100%`;
      div.style.left = `calc(${ratio * 100}% - 0.5em)`;
      this.shadowRoot.querySelector('.container').appendChild(div);
    });
  }

  _snapToStop(value) {
    if (!this._stopValues.length) return value;
    let closest = this._stopValues[0];
    let minDist = Math.abs(value - closest);
    for (const v of this._stopValues) {
      const dist = Math.abs(value - v);
      if (dist < minDist) {
        minDist = dist;
        closest = v;
      }
    }
    return closest;
  }

  _onPointerDown(e) {
    this._dragging = true;
    this._updateFromPointer(e);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    this._updateFromPointer(e);
  }

  _onPointerUp() {
    this._dragging = false;
  }

  _updateFromPointer(e) {
    const rect = this._track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let value = Math.round((x / rect.width) * 127);
    value = this._clamp(value);
    value = this._snapToStop(value);

    if (value !== this._value) {
      this._value = value;
      this._render();
      this.setValue(this._value).catch(console.error);
    }
  }

  _render() {
    const ratio = this._value / 127;
    const percent = ratio * 100;

    this._trackLow.style.width = `${percent}%`;
    this._trackHigh.style.width = `${100 - percent}%`;

    this._trackLow.style.left = '0';
    this._trackHigh.style.right = '0';

    // center thumb on track
    this._thumb.style.left = `${percent}%`;
  }

  _clamp(v) {
    return Math.max(0, Math.min(127, v | 0));
  }
}

customElements.define('cc-hslider', CCHSlider);
