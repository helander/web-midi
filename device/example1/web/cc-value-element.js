// cc-value-element.js

export class CCValueElement extends HTMLElement {
  constructor() {
    super();
    this._ready = false;
    this._value = null;
  }

  connectedCallback() {
    if (this._ready) return;
    this._ready = true;

    const channel = this.getIntAttr('channel');
    const cc = this.getIntAttr('cc');

    if (channel === null || cc === null) {
      console.warn('Missing or invalid channel/cc', this);
      return;
    }

    this.fetchValue(channel, cc)
      .then(value => {
        this._value = value;
        this.onInitialValue(value);
      })
      .catch(err => this.onFetchError(err));
  }

  /**
   * Reads a required integer attribute.
   */
  getIntAttr(name) {
    const v = this.getAttribute(name);
    if (v === null) return null;
    if (!/^-?\d+$/.test(v)) return null;
    return Number(v);
  }

  /**
   * GET /get?channel=…&cc=…
   */
  async fetchValue(channel, cc) {
    const url = new URL('/get', location.origin);
    url.searchParams.set('channel', channel);
    url.searchParams.set('cc', cc);

    const res = await fetch(url);
    const text = await res.text();

    const trimmed = text.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`Invalid integer response: "${text}"`);
    }

    return Number(trimmed);
  }

  /**
   * SET /set?channel=…&cc=…&value=…
   * Write-only operation. Does NOT update local state.
   */
  async setValue(value) {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Value must be integer, got ${value}`);
    }

    const channel = this.getIntAttr('channel');
    const cc = this.getIntAttr('cc');

    if (channel === null || cc === null) {
      throw new Error('Cannot set value: missing channel/cc');
    }

    const url = new URL('/set', location.origin);
    url.searchParams.set('channel', channel);
    url.searchParams.set('cc', cc);
    url.searchParams.set('value', value);

    await fetch(url);
  }

  /**
   * Called exactly once, after the initial GET completes.
   * Subclasses override to render.
   */
  onInitialValue(_value) {
    // subclasses override
  }

  onFetchError(err) {
    console.error(err);
  }
}
