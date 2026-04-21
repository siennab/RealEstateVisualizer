import { LitElement, html, css } from 'lit'
import { eraFor } from '../store.js'

customElements.define('hero-counter', class extends LitElement {
  static styles = css`
    :host { display: block; }
    .counter {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      padding: 14px 22px 6px;
    }
    .left {}
    .era-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .era-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .year-display {
      font-family: 'Fraunces', 'Cormorant Garamond', Georgia, serif;
      font-size: 72px;
      line-height: 0.92;
      font-weight: 500;
      letter-spacing: -0.02em;
      margin-top: 2px;
      font-feature-settings: "ss01";
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .year-input {
      font-family: 'Fraunces', 'Cormorant Garamond', Georgia, serif;
      font-size: 72px;
      line-height: 0.92;
      font-weight: 500;
      letter-spacing: -0.02em;
      margin-top: 2px;
      font-feature-settings: "ss01";
      border: none;
      background: transparent;
      width: 180px;
      padding: 0;
      outline: 2px solid currentColor;
      border-radius: 4px;
      padding: 0 8px;
      user-select: text;
      -webkit-user-select: text;
      -moz-appearance: textfield;
      appearance: textfield;
    }
    .year-input::-webkit-outer-spin-button,
    .year-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .right {
      text-align: right;
      padding-bottom: 8px;
    }
    .count-num {
      font-size: 30px;
      font-weight: 700;
      font-family: 'Fraunces', Georgia, serif;
      letter-spacing: -0.02em;
    }
    .count-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .pinned-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 4px;
      margin-top: 4px;
      opacity: 0.85;
    }
    .pinned-icon {
      font-size: 11px;
      line-height: 1;
    }
  `

  static properties = {
    year:  { type: Number },
    count: { type: Number },
    hasClusters: { type: Boolean },
    theme: { type: Object },
    pinnedYear: { type: Number },
  }

  #editMode = false
  #lastTap = 0

  #handleYearTap(e) {
    const now = Date.now()
    const timeSinceLastTap = now - this.#lastTap
    
    if (timeSinceLastTap < 300) {
      // Double tap detected
      e.preventDefault()
      this.#editMode = true
      this.requestUpdate()
      this.updateComplete.then(() => {
        const input = this.shadowRoot.querySelector('.year-input')
        if (input) {
          input.focus()
          input.select()
        }
      })
    }
    this.#lastTap = now
  }

  #handleYearInput(e) {
    if (e.key === 'Enter') {
      const value = parseInt(e.target.value, 10)
      if (value >= 1800 && value <= 2026) {
        this.dispatchEvent(new CustomEvent('year-changed', {
          detail: { year: value, exact: true },
          bubbles: true,
          composed: true,
        }))
      }
      this.#editMode = false
      this.requestUpdate()
    } else if (e.key === 'Escape') {
      this.#editMode = false
      this.requestUpdate()
    }
  }

  #handleYearBlur() {
    this.#editMode = false
    this.requestUpdate()
  }

  render() {
    const t = this.theme || {}
    const era = eraFor(this.year || 1800)

    return html`
      <div class="counter">
        <div class="left">
          <div class="era-label" style="color:${t.inkSoft}">
            <span class="era-dot" style="background:${era.color}"></span>
            ${era.label}
          </div>
          ${this.#editMode ? html`
            <input
              type="number"
              class="year-input"
              style="color:${t.ink}"
              .value="${this.year || 1800}"
              min="1800"
              max="2026"
              @keydown=${this.#handleYearInput}
              @blur=${this.#handleYearBlur}
            />
          ` : html`
            <div
              class="year-display"
              style="color:${t.ink}"
              @click=${this.#handleYearTap}
              @touchstart=${this.#handleYearTap}
            >
              ${this.year || 1800}
            </div>
          `}
          ${this.pinnedYear ? html`
            <div class="pinned-badge" style="background:${t.accent}22;color:${t.accent}">
              <span class="pinned-icon">&#x1F4CC;</span> Only ${this.pinnedYear}
            </div>
          ` : ''}
        </div>
        ${!this.hasClusters ? html`
          <div class="right">
            <div class="count-num" style="color:${t.ink}">
              ${(this.count || 0).toLocaleString()}
            </div>
            <div class="count-label" style="color:${t.inkSoft}">
              homes built
            </div>
          </div>
        ` : ''}
      </div>
    `
  }
})
