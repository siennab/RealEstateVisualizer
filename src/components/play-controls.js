import { LitElement, html, css } from 'lit'

customElements.define('play-controls', class extends LitElement {
  static styles = css`
    :host { display: block; }
    .row {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 14px 20px 20px;
    }
    .play-btn {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
      flex-shrink: 0;
      transition: transform 120ms;
    }
    .play-btn:active { transform: scale(0.94); }
    .info { flex: 1; }
    .info-title {
      font-size: 13px;
      font-weight: 600;
      font-family: 'Geist', -apple-system, sans-serif;
    }
    .info-sub {
      font-size: 11px;
      margin-top: 1px;
      font-family: 'Geist', -apple-system, sans-serif;
    }
    .reset-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 120ms;
    }
    .reset-btn:active { transform: scale(0.94); }
  `

  static properties = {
    playing:      { type: Boolean },
    year:         { type: Number },
    newThisYear:  { type: Number },
    theme:        { type: Object },
  }

  #onPlay() {
    this.dispatchEvent(new CustomEvent('play-toggled', { bubbles: true, composed: true }))
  }

  #onReset() {
    this.dispatchEvent(new CustomEvent('play-reset', { bubbles: true, composed: true }))
  }

  render() {
    const t = this.theme || {}
    const year = this.year || 1850
    const newCount = this.newThisYear || 0
    const playing = this.playing

    const titleText = playing
      ? 'Watching the city grow\u2026'
      : year >= 2026 ? 'Present day' : 'Tap play to time-travel'

    const subText = newCount > 0
      ? `+${newCount} home${newCount === 1 ? '' : 's'} built in ${year}`
      : `No new construction in ${year}`

    return html`
      <div class="row">
        <button
          class="play-btn"
          style="background:${t.ink}"
          @click=${this.#onPlay}
          aria-label="${playing ? 'Pause' : 'Play'}"
        >
          ${playing
            ? html`<svg width="16" height="16" viewBox="0 0 16 16">
                <rect x="3" y="2" width="4" height="12" rx="1" fill="${t.bg}"/>
                <rect x="9" y="2" width="4" height="12" rx="1" fill="${t.bg}"/>
              </svg>`
            : html`<svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M3 2 L14 8 L3 14 Z" fill="${t.bg}"/>
              </svg>`
          }
        </button>

        <div class="info">
          <div class="info-title" style="color:${t.ink}">${titleText}</div>
          <div class="info-sub" style="color:${t.inkSoft}">${subText}</div>
        </div>

        <button
          class="reset-btn"
          style="background:${t.chip}"
          @click=${this.#onReset}
          title="Reset to 1850"
          aria-label="Reset to 1850"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M2 4 A5 5 0 1 1 3 10" fill="none" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M2 1 L2 4.5 L5.5 4.5" fill="none" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `
  }
})
