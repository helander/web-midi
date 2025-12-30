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
  }

  disconnectedCallback() {
    this._track.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  onInitialValue(value) {
    this._value = this._clamp(value);
    this._render();
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
    const ratio = x / rect.width;
    const value = Math.round(ratio * 127);

    const clamped = this._clamp(value);
    if (clamped !== this._value) {
      this._value = clamped;
      this._render();

      // Send continuously while moving
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

    this._thumb.style.left = `${percent}%`;
  }

  _clamp(v) {
    return Math.max(0, Math.min(127, v | 0));
  }
}

customElements.define('cc-hslider', CCHSlider);
