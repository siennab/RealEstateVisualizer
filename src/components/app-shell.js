import { LitElement, html } from 'lit'
import { store, ERAS, eraFor, CITIES } from '../store.js'
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
  #hasClusters = false
  #isScrubbing = false

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
    this.#hasClusters = e.detail.hasClusters
    this.requestUpdate()
  }

  #onSheetClosed() {
    store.deselectProperty()
  }

  #onScrubStart() {
    console.log('app-shell: scrub-start received')
    this.#isScrubbing = true
    this.requestUpdate()
  }

  #onScrubEnd() {
    console.log('app-shell: scrub-end received')
    this.#isScrubbing = false
    this.requestUpdate()
  }

  #onCityChanged(e) {
    store.setCity(e.detail.city)
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

    const desktop = this.#isDesktop

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
        ${desktop ? '' : 'display:flex;flex-direction:column;'}
      ">
        <!-- CITY TOGGLE -->
        <div style="
          position:absolute;
          top:12px;
          right:12px;
          z-index:500;
          display:flex;
          background:${t.sheet || t.bg};
          border-radius:999px;
          box-shadow:0 2px 10px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04);
          padding:3px;
          gap:2px;
          font-family:'Geist',-apple-system,system-ui,sans-serif;
        ">
          ${Object.values(CITIES).map(c => html`
            <button
              @click=${() => store.setCity(c.id)}
              style="
                border:none;
                outline:none;
                cursor:pointer;
                padding:5px 14px;
                border-radius:999px;
                font-size:12px;
                font-weight:600;
                letter-spacing:0.02em;
                transition:all 0.2s ease;
                background:${s.city === c.id ? t.ink : 'transparent'};
                color:${s.city === c.id ? t.bg : t.ink + '88'};
              "
            >${c.label}</button>
          `)}
        </div>

        <!-- MAP -->
        <div style="${desktop
          ? 'position:absolute;inset:0;'
          : 'flex:1;position:relative;overflow:hidden;min-height:0;'}">
          <map-view
            .homes=${homes}
            .newThisYear=${newSet}
            .theme=${t}
            .year=${s.year}
            .city=${s.city}
            .isScrubbing=${this.#isScrubbing}
            .isPlaying=${s.playing}
            .activeEra=${eraFor(s.year)?.id}
            @property-selected=${this.#onPropertySelected.bind(this)}
            @map-clicked=${this.#onMapClicked.bind(this)}
            @viewport-count=${this.#onViewportCount.bind(this)}
            @city-changed=${this.#onCityChanged.bind(this)}
            style="position:absolute;inset:0;"
          ></map-view>
        </div>

        <!-- PANEL -->
        <div style="
          ${desktop ? `
            position:absolute;
            bottom:0;
            left:0;
            max-width:400px;
            width:100%;
            z-index:400;
            border-radius:12px 12px 0 0;
          ` : `
            flex:0 0 auto;
            max-height:44%;
            min-height:244px;
          `}
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
            .hasClusters=${this.#hasClusters}
            .theme=${t}
            @year-changed=${this.#onYearChanged.bind(this)}
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
            @scrub-start=${this.#onScrubStart.bind(this)}
            @scrub-end=${this.#onScrubEnd.bind(this)}
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
          style="position:absolute;${desktop ? 'left:0;top:0;bottom:0;width:400px;z-index:500;' : 'inset:0;'}pointer-events:none;"
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
