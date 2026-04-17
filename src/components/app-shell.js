import { LitElement, html } from 'lit'
import { store, ERAS, eraFor } from '../store.js'
import { THEMES, applyTheme } from '../styles/themes.js'
import { HOMES } from '../data/sample-data.js'
import { geocodeCache } from '../services/geocode-cache.js'
import { allRecords } from '../services/mprop-data.js'
import { pendingCount } from '../services/geocoding-service.js'

// Import all child components
import './map-view.js'
import './era-rail.js'
import './time-slider.js'
import './hero-counter.js'
import './bottom-sheet.js'
import './play-controls.js'

// Build cumulative sparkline counts (static, passed to time-slider implicitly via inline build)
function buildCounts() {
  const arr = []
  let c = 0
  for (let y = 1850; y <= 2026; y++) {
    c += HOMES.filter(h => h.year === y).length
    if (y % 2 === 0) arr.push({ year: y, cumulative: c })
  }
  return arr
}

customElements.define('app-shell', class extends LitElement {
  // Use light DOM so global CSS applies
  createRenderRoot() { return this }

  #unsubscribe = null
  #state = store.state
  #viewportCount = 0

  connectedCallback() {
    super.connectedCallback()
    // Apply initial theme
    applyTheme(this.#state.theme)

    // Subscribe to store
    this.#unsubscribe = store.subscribe(state => {
      const prevTheme = this.#state.theme
      this.#state = state
      if (state.theme !== prevTheme) {
        applyTheme(state.theme)
      }
      this.requestUpdate()
    })

    // Detect resize
    this._resizeObserver = new ResizeObserver(() => this.requestUpdate())
    this._resizeObserver.observe(document.body)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.#unsubscribe?.()
    this._resizeObserver?.disconnect()
  }

  get #theme() {
    return THEMES[this.#state.theme] || THEMES.cream
  }

  get #isDesktop() {
    return window.innerWidth >= 768
  }

  get #visibleHomes() {
    return store.visibleHomes(this.#state.year)
  }

  get #newThisYearSet() {
    return store.newThisYear(this.#state.year)
  }

  get #newThisYearCount() {
    return this.#newThisYearSet.size
  }

  // Event handlers
  #onPropertySelected(e) {
    store.selectProperty(e.detail.property)
  }

  #onMapClicked() {
    store.deselectProperty()
  }

  #onViewportCount(e) {
    this.#viewportCount = e.detail.count
    this.requestUpdate()
  }

  #onSheetClosed() {
    store.deselectProperty()
  }

  #onEraSelected(e) {
    const era = e.detail.era
    store.pause()
    store.setYear(Math.round((era.start + era.end) / 2))
  }

  #onYearChanged(e) {
    store.pause()
    store.setYear(e.detail.year)
  }

  #onPlayToggled() {
    if (this.#state.playing) {
      store.pause()
    } else {
      store.play()
    }
  }

  #onPlayReset() {
    store.reset()
  }

  async #onExportCache() {
    await geocodeCache.downloadJSON()
  }

  #renderAppContent() {
    const t = this.#theme
    const s = this.#state
    const homes = this.#visibleHomes
    const newSet = this.#newThisYearSet
    const totalRecords = allRecords().length
    const geocodedCount = homes.length
    const inFlight = pendingCount()

    return html`
      <div style="
        position:relative;
        width:100%;
        height:100%;
        background:${t.bg};
        font-family:'Geist',-apple-system,system-ui,sans-serif;
        color:${t.ink};
        overflow:hidden;
        display:flex;
        flex-direction:column;
      ">
        <!-- MAP -->
        <div style="flex:1;position:relative;overflow:hidden;min-height:0;">
          <map-view
            .homes=${homes}
            .newThisYear=${newSet}
            .theme=${t}
            .year=${s.year}
            @property-selected=${this.#onPropertySelected.bind(this)}
            @map-clicked=${this.#onMapClicked.bind(this)}
            @viewport-count=${this.#onViewportCount.bind(this)}
            style="position:absolute;inset:0;"
          ></map-view>

          <!-- Geocode status + export -->
          <div style="
            position:absolute;
            top:12px;
            right:12px;
            z-index:3;
            display:flex;
            gap:6px;
            align-items:center;
          ">
            <div style="
              background:${t.sheet};
              color:${t.ink};
              border-radius:999px;
              padding:6px 10px;
              font-size:11px;
              font-family:ui-monospace,'SF Mono',monospace;
              box-shadow:0 2px 10px rgba(0,0,0,0.08),0 0 0 0.5px rgba(0,0,0,0.04);
            ">
              ${geocodedCount.toLocaleString()} / ${totalRecords.toLocaleString()} geocoded${inFlight > 0 ? ` · ${inFlight} in flight` : ''}
            </div>
            <button
              @click=${this.#onExportCache.bind(this)}
              style="
                background:${t.sheet};
                color:${t.ink};
                border:none;
                border-radius:999px;
                padding:6px 12px;
                font-size:11px;
                font-weight:600;
                cursor:pointer;
                box-shadow:0 2px 10px rgba(0,0,0,0.08),0 0 0 0.5px rgba(0,0,0,0.04);
              "
              title="Download geocoded addresses as JSON"
            >Export cache</button>
          </div>
        </div>

        <!-- PANEL -->
        <div style="
          flex:0 0 auto;
          max-height:${this.#isDesktop ? '280px' : '38%'};
          min-height:200px;
          background:${t.bg};
          border-top:1px solid ${t.ink}12;
          box-shadow:0 -4px 20px rgba(0,0,0,0.04);
          display:flex;
          flex-direction:column;
          padding-bottom:env(safe-area-inset-bottom, 8px);
          overflow:hidden;
        ">
          <hero-counter
            .year=${s.year}
            .count=${this.#viewportCount}
            .theme=${t}
          ></hero-counter>

          <div style="margin-top:2px;">
            <era-rail
              .year=${s.year}
              .theme=${t}
              @era-selected=${this.#onEraSelected.bind(this)}
            ></era-rail>
          </div>

          <div style="flex:1;min-height:0;"></div>

          <time-slider
            .year=${s.year}
            .theme=${t}
            @year-changed=${this.#onYearChanged.bind(this)}
          ></time-slider>

          <play-controls
            .playing=${s.playing}
            .year=${s.year}
            .newThisYear=${this.#newThisYearCount}
            .theme=${t}
            @play-toggled=${this.#onPlayToggled.bind(this)}
            @play-reset=${this.#onPlayReset.bind(this)}
          ></play-controls>
        </div>

        <!-- BOTTOM SHEET — overlaid -->
        <bottom-sheet
          .property=${s.selectedProperty}
          .theme=${t}
          @sheet-closed=${this.#onSheetClosed.bind(this)}
          style="position:absolute;inset:0;pointer-events:none;"
        ></bottom-sheet>
      </div>
    `
  }

  render() {
    const t = this.#theme

    return html`
      <div style="
        position:fixed;inset:0;
        display:flex;flex-direction:column;
        background:${t.bg};
      ">
        ${this.#renderAppContent()}
      </div>
    `
  }
})
