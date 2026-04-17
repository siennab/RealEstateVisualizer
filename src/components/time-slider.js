import { LitElement, html, css } from 'lit'
import { ERAS } from '../store.js'
import { HOMES } from '../data/sample-data.js'

const MIN = 1850
const MAX = 2026

// Pre-compute cumulative counts for sparkline
function buildCounts() {
  const arr = []
  let c = 0
  for (let y = MIN; y <= MAX; y++) {
    c += HOMES.filter(h => h.year === y).length
    if (y % 2 === 0) arr.push({ year: y, cumulative: c })
  }
  return arr
}
const COUNTS = buildCounts()

function buildSparkPath() {
  if (!COUNTS.length) return ''
  const max = COUNTS[COUNTS.length - 1].cumulative
  const W = 100, H = 14
  return COUNTS.map((c, i) => {
    const x = ((c.year - MIN) / (MAX - MIN)) * W
    const y = H - (c.cumulative / max) * H
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}
const SPARK_PATH = buildSparkPath()

customElements.define('time-slider', class extends LitElement {
  static styles = css`
    :host { display: block; }
    .wrap { padding: 0 20px; }
    .era-zones { position: relative; height: 4px; margin-bottom: 2px; }
    .era-zone {
      position: absolute;
      top: 0;
      height: 4px;
      opacity: 0.45;
      border-radius: 2px;
    }
    .track-wrap {
      position: relative;
      height: 44px;
      cursor: pointer;
      touch-action: none;
      user-select: none;
    }
    .sparkline {
      position: absolute;
      top: 6px;
      left: 0;
      width: 100%;
      height: 14px;
      opacity: 0.25;
      pointer-events: none;
    }
    .track-base {
      position: absolute;
      top: 21px;
      left: 0;
      right: 0;
      height: 3px;
      border-radius: 2px;
    }
    .track-fill {
      position: absolute;
      top: 21px;
      left: 0;
      height: 3px;
      border-radius: 2px;
    }
    .tick {
      position: absolute;
      top: 19px;
      width: 1px;
      height: 7px;
      transform: translateX(-50%);
    }
    .thumb {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 30px;
      height: 30px;
      border-radius: 50%;
      box-shadow: 0 3px 10px rgba(0,0,0,0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .thumb-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .year-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      font-weight: 500;
      letter-spacing: 0.05em;
      margin-top: -4px;
    }
  `

  static properties = {
    year:  { type: Number },
    theme: { type: Object },
  }

  #dragging = false

  connectedCallback() {
    super.connectedCallback()
    this._onMove = this.#handleMove.bind(this)
    this._onUp = () => { this.#dragging = false }
    window.addEventListener('mousemove', this._onMove)
    window.addEventListener('mouseup', this._onUp)
    window.addEventListener('touchmove', this._onMove, { passive: false })
    window.addEventListener('touchend', this._onUp)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('mousemove', this._onMove)
    window.removeEventListener('mouseup', this._onUp)
    window.removeEventListener('touchmove', this._onMove)
    window.removeEventListener('touchend', this._onUp)
  }

  #handleMove(e) {
    if (!this.#dragging) return
    if (e.cancelable) e.preventDefault()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    this.#computeYear(clientX)
  }

  #computeYear(clientX) {
    const track = this.shadowRoot?.querySelector('.track-wrap')
    if (!track) return
    const rect = track.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const year = Math.round(MIN + x * (MAX - MIN))
    this.dispatchEvent(new CustomEvent('year-changed', {
      detail: { year },
      bubbles: true,
      composed: true,
    }))
  }

  #onDown(e) {
    this.#dragging = true
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    this.#computeYear(clientX)
  }

  render() {
    const t = this.theme || {}
    const year = this.year || MIN
    const pct = (year - MIN) / (MAX - MIN)

    return html`
      <div class="wrap">
        <!-- era zones -->
        <div class="era-zones">
          ${ERAS.map(era => {
            const a = Math.max(0, (era.start - MIN) / (MAX - MIN))
            const b = Math.min(1, (era.end - MIN) / (MAX - MIN))
            return html`
              <div
                class="era-zone"
                style="left:${a * 100}%;width:${(b - a) * 100}%;background:${era.color}"
              ></div>
            `
          })}
        </div>

        <!-- track -->
        <div
          class="track-wrap"
          @mousedown=${this.#onDown}
          @touchstart=${this.#onDown}
        >
          <!-- sparkline -->
          <svg
            class="sparkline"
            viewBox="0 0 100 14"
            preserveAspectRatio="none"
          >
            <path d="${SPARK_PATH}" fill="none" stroke="${t.ink}" stroke-width="0.6"/>
            <path d="${SPARK_PATH} L100 14 L0 14 Z" fill="${t.ink}" opacity="0.1"/>
          </svg>

          <!-- base track -->
          <div class="track-base" style="background:${t.inkMuted}"></div>
          <!-- filled portion -->
          <div class="track-fill" style="width:${pct * 100}%;background:${t.ink}"></div>

          <!-- decade ticks -->
          ${[1850, 1875, 1900, 1925, 1950, 1975, 2000, 2025].map(y => {
            const p = (y - MIN) / (MAX - MIN)
            return html`
              <div
                class="tick"
                style="left:${p * 100}%;background:${t.inkMuted}"
              ></div>
            `
          })}

          <!-- thumb -->
          <div
            class="thumb"
            style="
              left:${pct * 100}%;
              background:${t.bg};
              border:3px solid ${t.ink};
            "
          >
            <div class="thumb-dot" style="background:${t.accent}"></div>
          </div>
        </div>

        <!-- year labels -->
        <div class="year-labels" style="color:${t.inkSoft}">
          <span>1850</span>
          <span>1900</span>
          <span>1950</span>
          <span>2000</span>
          <span>NOW</span>
        </div>
      </div>
    `
  }
})
