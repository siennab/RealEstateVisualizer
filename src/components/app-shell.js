import { LitElement, html } from 'lit'
import { store, ERAS, eraFor } from '../store.js'
import { THEMES, applyTheme } from '../styles/themes.js'
import { HOMES } from '../data/sample-data.js'

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
  for (let y = 1800; y <= 2026; y++) {
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
    store.clearIsolatedEra()
    store.setYear(Math.round((era.start + era.end) / 2))
  }

  #onEraIsolationToggled(e) {
    const era = e.detail.era
    store.pause()
    store.setYear(era.end)
    store.toggleIsolatedEra(era.id)
  }

  #onYearChanged(e) {
    store.pause()
    store.clearIsolatedEra()
    store.setYear(e.detail.year)
  }

  #onPlayToggled() {
    if (this.#state.playing) {
      store.pause()
    } else {
      store.clearIsolatedEra()
      store.play()
    }
  }

  #onPlayReset() {
    store.clearIsolatedEra()
    store.reset()
  }

  #renderAppContent() {
    const t = this.#theme
    const s = this.#state
    const homes = this.#visibleHomes
    const newSet = this.#newThisYearSet

    return html`
      <div style="
        position:relative;
        width:100%;
        height:100%;
        min-height:0;
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
        </div>

        <!-- PANEL -->
        <div style="
          flex:0 0 auto;
          max-height:${this.#isDesktop ? '280px' : '44%'};
          min-height:${this.#isDesktop ? '200px' : '244px'};
          background:${t.bg};
          border-top:1px solid ${t.ink}12;
          box-shadow:0 -4px 20px rgba(0,0,0,0.04);
          display:flex;
          flex-direction:column;
          padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 40px);
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
              .isolatedEraId=${s.isolatedEraId}
              @era-selected=${this.#onEraSelected.bind(this)}
              @era-isolation-toggled=${this.#onEraIsolationToggled.bind(this)}
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
        height:100vh;
        height:100dvh;
        display:flex;flex-direction:column;
        background:${t.bg};
        overflow:hidden;
      ">
        ${this.#renderAppContent()}
      </div>
    `
  }
})
