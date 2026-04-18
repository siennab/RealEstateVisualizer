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
  `

  static properties = {
    year:  { type: Number },
    count: { type: Number },
    theme: { type: Object },
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
          <div class="year-display" style="color:${t.ink}">
            ${this.year || 1800}
          </div>
        </div>
        <div class="right">
          <div class="count-num" style="color:${t.ink}">
            ${(this.count || 0).toLocaleString()}
          </div>
          <div class="count-label" style="color:${t.inkSoft}">
            homes built
          </div>
        </div>
      </div>
    `
  }
})
