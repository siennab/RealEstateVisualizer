import { LitElement, html, css } from 'lit'
import { ERAS, eraFor } from '../store.js'

customElements.define('era-rail', class extends LitElement {
  static styles = css`
    :host { display: block; }
    .rail {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0 16px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .rail::-webkit-scrollbar { display: none; }
    .chip {
      flex-shrink: 0;
      padding: 7px 14px 7px 12px;
      border-radius: 999px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-family: 'Geist', -apple-system, sans-serif;
      white-space: nowrap;
      transition: transform 180ms, background 180ms;
    }
    .chip-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `

  static properties = {
    year:  { type: Number },
    theme: { type: Object },
  }

  updated(changed) {
    if (changed.has('year')) {
      this.#scrollToActive()
    }
  }

  #scrollToActive() {
    const rail = this.shadowRoot?.querySelector('.rail')
    if (!rail) return
    const current = eraFor(this.year || 1850)
    const el = rail.querySelector(`[data-era="${current.id}"]`)
    if (el) {
      const off = el.offsetLeft - rail.offsetWidth / 2 + el.offsetWidth / 2
      rail.scrollTo({ left: off, behavior: 'smooth' })
    }
  }

  #onChipClick(era) {
    this.dispatchEvent(new CustomEvent('era-selected', {
      detail: { era },
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    const t = this.theme || {}
    const current = eraFor(this.year || 1850)

    return html`
      <div class="rail">
        ${ERAS.map(era => {
          const active = era.id === current.id
          return html`
            <button
              class="chip"
              data-era="${era.id}"
              @click=${() => this.#onChipClick(era)}
              style="
                background: ${active ? t.ink : t.chip};
                color: ${active ? t.bg : t.ink};
                box-shadow: ${active
                  ? '0 4px 14px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)'};
                transform: ${active ? 'scale(1.04)' : 'scale(1)'};
              "
            >
              <span
                class="chip-dot"
                style="
                  background: ${era.color};
                  box-shadow: ${active ? `0 0 0 2px ${t.bg}` : 'none'};
                "
              ></span>
              ${era.label}
            </button>
          `
        })}
      </div>
    `
  }
})
