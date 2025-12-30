// cc-display.js

import { CCValueElement } from './cc-value-element.js';

/*
 * Template preload at module scope
 * This runs once, before any instances exist
 */
const template = await fetch(
  new URL('./cc-display.html', import.meta.url)
).then(r => r.text());

class CCDisplay extends CCValueElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = template;
  }

  onValueReady(value) {
    this.shadowRoot.querySelector('.value').textContent =
      value.toString();
  }
}

customElements.define('cc-display', CCDisplay);
