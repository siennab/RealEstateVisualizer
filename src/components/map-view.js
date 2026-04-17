import { LitElement, html } from 'lit'
import mapboxgl from 'mapbox-gl'
import { ERAS } from '../store.js'
import { viewportCandidates, ensureZipsForViewport } from '../services/mprop-data.js'
import { enqueueMany, onGeocoded } from '../services/geocoding-service.js'

// Cap how many addresses we send to Mapbox per pan idle event,
// plus how many "refill" rounds can chain off of one idle before we stop.
const GEOCODE_BUDGET_PER_IDLE = 80
const MAX_REFILL_CHAIN = 8

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const CENTER = [-87.9065, 43.0389] // Downtown Milwaukee [lng, lat]
const ZOOM = 17
const MIN_ZOOM = 16
const MAX_ZOOM = 19

// Map Mapbox base styles to themes
const STYLE_FOR_THEME = {
  cream:    'mapbox://styles/mapbox/light-v11',
  mint:     'mapbox://styles/mapbox/light-v11',
  midnight: 'mapbox://styles/mapbox/dark-v11',
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function homeToFeature(h, newThisYear) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
    properties: {
      id: h.id,
      year: h.year,
      era: h.era,
      style: h.style,
      address: h.address,
      beds: h.beds,
      sqft: h.sqft,
      color: (ERAS.find(e => e.id === h.era) || {}).color || '#F582AE',
      isNew: newThisYear instanceof Set ? newThisYear.has(h.id) : false,
    },
  }
}

function homesToGeoJSON(homes, newThisYear) {
  return {
    type: 'FeatureCollection',
    features: (homes || []).map(h => homeToFeature(h, newThisYear)),
  }
}

// Resolve a home object from feature properties (restore full object for event)
function featureToHome(props) {
  return {
    id: props.id,
    year: props.year,
    era: props.era,
    style: props.style,
    address: props.address,
    beds: props.beds,
    sqft: props.sqft,
  }
}

customElements.define('map-view', class extends LitElement {
  createRenderRoot() { return this }

  static properties = {
    homes:       { type: Array },
    newThisYear: { type: Object },
    theme:       { type: Object },
    year:        { type: Number },
  }

  #map = null
  #mapReady = false
  #currentStyle = null
  #prevHomeIds = new Set()
  #entranceTimer = null
  #unsubGeocode = null
  #refillScheduled = false
  #refillChain = 0
  #viewportCountTimer = null

  connectedCallback() {
    super.connectedCallback()
    // Defer map init until first render creates the container
    this.updateComplete.then(() => this.#initMap())
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.#unsubGeocode?.()
    this.#unsubGeocode = null
    if (this.#map) {
      this.#map.remove()
      this.#map = null
      this.#mapReady = false
    }
  }

  #initMap() {
    const container = this.querySelector('.mapbox-container')
    if (!container || this.#map) return

    mapboxgl.accessToken = MAPBOX_TOKEN
    const styleName = this.theme?.name || ''
    const themeKey = Object.keys(STYLE_FOR_THEME).find(
      k => (this.theme === (void 0)) ? false : true
    ) || 'cream'
    // Determine current theme key by matching bg
    const resolvedTheme = this.#resolveThemeKey()
    this.#currentStyle = STYLE_FOR_THEME[resolvedTheme]

    this.#map = new mapboxgl.Map({
      container,
      style: this.#currentStyle,
      center: CENTER,
      zoom: ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
    })

    this.#map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    this.#map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    this.#map.on('load', () => {
      this.#mapReady = true

      // GeoJSON source for all homes
      this.#map.addSource('homes', {
        type: 'geojson',
        data: homesToGeoJSON(this.homes, this.newThisYear),
      })

      // Entrance source for animating in new pins
      this.#map.addSource('homes-entrance', {
        type: 'geojson',
        data: EMPTY_FC,
      })

      // Glow layer for newly-built homes
      this.#map.addLayer({
        id: 'homes-glow',
        type: 'circle',
        source: 'homes',
        filter: ['==', ['get', 'isNew'], true],
        paint: {
          'circle-radius': 24,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      })

      // Main circle layer — hides pins that are animating in
      this.#map.addLayer({
        id: 'homes-circles',
        type: 'circle',
        source: 'homes',
        filter: ['!=', ['get', 'hidden'], true],
        paint: {
          'circle-radius': [
            'case',
            ['==', ['get', 'isNew'], true], 12,
            9,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': this.theme?.bg || '#FEF6E4',
          'circle-opacity': 0.9,
        },
      })

      // Entrance glow layer (animates in)
      this.#map.addLayer({
        id: 'homes-entrance-glow',
        type: 'circle',
        source: 'homes-entrance',
        filter: ['==', ['get', 'isNew'], true],
        paint: {
          'circle-radius': 0,
          'circle-radius-transition': { duration: 0 },
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      })

      // Entrance circle layer (animates in)
      this.#map.addLayer({
        id: 'homes-entrance-circles',
        type: 'circle',
        source: 'homes-entrance',
        paint: {
          'circle-radius': 0,
          'circle-radius-transition': { duration: 0 },
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': this.theme?.bg || '#FEF6E4',
          'circle-opacity': 0,
          'circle-opacity-transition': { duration: 0 },
        },
      })

      // Seed previous IDs so the initial load doesn't animate
      this.#prevHomeIds = new Set((this.homes || []).map(h => h.id))

      // Click on a pin
      this.#map.on('click', 'homes-circles', (e) => {
        if (!e.features || !e.features.length) return
        e.originalEvent.stopPropagation()
        const props = e.features[0].properties
        this.dispatchEvent(new CustomEvent('property-selected', {
          detail: { property: featureToHome(props) },
          bubbles: true,
          composed: true,
        }))
      })

      // Click on empty map area
      this.#map.on('click', (e) => {
        // Check if we hit a pin (the layer click handler fires first with stopPropagation)
        const features = this.#map.queryRenderedFeatures(e.point, { layers: ['homes-circles'] })
        if (features.length === 0) {
          this.dispatchEvent(new CustomEvent('map-clicked', { bubbles: true, composed: true }))
        }
      })

      // Pointer cursor on pins
      this.#map.on('mouseenter', 'homes-circles', () => {
        this.#map.getCanvas().style.cursor = 'pointer'
      })
      this.#map.on('mouseleave', 'homes-circles', () => {
        this.#map.getCanvas().style.cursor = ''
      })

      // Emit viewport count on move and data changes
      this.#map.on('moveend', () => {
        this.#emitViewportCount()
      })

      // Geocode addresses as the viewport changes
      ensureZipsForViewport().then(() => this.#requestGeocodes(true))
      this.#map.on('moveend', () => this.#requestGeocodes(true))

      // When new pins arrive, a previously-unknown street may now be visible.
      // Refill the geocode queue (debounced) up to a bounded chain length so
      // the map self-completes within a few seconds of panning.
      this.#unsubGeocode = onGeocoded(() => this.#scheduleRefill())
    })
  }

  #emitViewportCount() {
    // Throttle: skip if one is already scheduled
    if (this.#viewportCountTimer) return
    this.#viewportCountTimer = setTimeout(() => {
      this.#viewportCountTimer = null
      if (!this.#map || !this.#mapReady) return
      const features = this.#map.queryRenderedFeatures({ layers: ['homes-circles'] })
      const unique = new Set(features.map(f => f.properties.id))
      this.dispatchEvent(new CustomEvent('viewport-count', {
        detail: { count: unique.size },
        bubbles: true,
        composed: true,
      }))
    }, 300)
  }

  #scheduleRefill() {
    if (this.#refillScheduled) return
    this.#refillScheduled = true
    setTimeout(() => {
      this.#refillScheduled = false
      this.#requestGeocodes(false)
    }, 400)
  }

  #requestGeocodes(isFreshIdle) {
    if (!this.#map || !this.#mapReady) return
    if (isFreshIdle) this.#refillChain = 0
    if (this.#refillChain >= MAX_REFILL_CHAIN) return
    this.#refillChain++

    const b = this.#map.getBounds()
    const bounds = {
      west: b.getWest(),
      east: b.getEast(),
      south: b.getSouth(),
      north: b.getNorth(),
    }
    const { primary, seed } = viewportCandidates(bounds)
    if (primary.length === 0 && seed.length === 0) return

    const budget = GEOCODE_BUDGET_PER_IDLE
    const picks = []
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }
    for (const r of shuffle([...primary])) {
      if (picks.length >= budget) break
      picks.push(r)
    }
    for (const r of shuffle([...seed])) {
      if (picks.length >= budget) break
      picks.push(r)
    }
    if (picks.length) enqueueMany(picks.map(r => r.address))
  }

  #resolveThemeKey() {
    const t = this.theme
    if (!t) return 'cream'
    if (t.bg === '#1B2238') return 'midnight'
    if (t.bg === '#EAF4EC') return 'mint'
    return 'cream'
  }

  updated(changed) {
    if (!this.#map || !this.#mapReady) return

    // Update GeoJSON data when homes or newThisYear change
    if (changed.has('homes') || changed.has('newThisYear') || changed.has('year')) {
      const homes = this.homes || []
      const currentIds = new Set(homes.map(h => h.id))
      const freshHomes = homes.filter(h => !this.#prevHomeIds.has(h.id))
      const freshIds = new Set(freshHomes.map(h => h.id))
      const hasFresh = freshHomes.length > 0 && this.#prevHomeIds.size > 0

      // Build main GeoJSON — mark fresh homes as hidden during animation
      const mainFC = {
        type: 'FeatureCollection',
        features: homes.map(h => {
          const f = homeToFeature(h, this.newThisYear)
          if (hasFresh && freshIds.has(h.id)) f.properties.hidden = true
          return f
        }),
      }

      const mainSrc = this.#map.getSource('homes')
      const entranceSrc = this.#map.getSource('homes-entrance')
      if (mainSrc) mainSrc.setData(mainFC)

      if (hasFresh && entranceSrc) {
        // Set entrance data
        entranceSrc.setData({
          type: 'FeatureCollection',
          features: freshHomes.map(h => homeToFeature(h, this.newThisYear)),
        })

        // Reset entrance layers to radius 0 instantly
        this.#map.setPaintProperty('homes-entrance-circles', 'circle-radius-transition', { duration: 0 })
        this.#map.setPaintProperty('homes-entrance-circles', 'circle-opacity-transition', { duration: 0 })
        this.#map.setPaintProperty('homes-entrance-circles', 'circle-radius', 0)
        this.#map.setPaintProperty('homes-entrance-circles', 'circle-opacity', 0)
        this.#map.setPaintProperty('homes-entrance-glow', 'circle-radius-transition', { duration: 0 })
        this.#map.setPaintProperty('homes-entrance-glow', 'circle-radius', 0)

        // Next frame: enable transitions and animate to full size
        requestAnimationFrame(() => {
          if (!this.#map) return
          this.#map.setPaintProperty('homes-entrance-circles', 'circle-radius-transition', { duration: 350, delay: 0 })
          this.#map.setPaintProperty('homes-entrance-circles', 'circle-opacity-transition', { duration: 250, delay: 0 })
          this.#map.setPaintProperty('homes-entrance-circles', 'circle-radius', 9)
          this.#map.setPaintProperty('homes-entrance-circles', 'circle-opacity', 0.9)
          this.#map.setPaintProperty('homes-entrance-glow', 'circle-radius-transition', { duration: 400, delay: 0 })
          this.#map.setPaintProperty('homes-entrance-glow', 'circle-radius', 24)
        })

        // After animation: un-hide from main layer, clear entrance
        clearTimeout(this.#entranceTimer)
        this.#entranceTimer = setTimeout(() => {
          if (!this.#map || !this.#mapReady) return
          // Update main source without hidden flags
          const src = this.#map.getSource('homes')
          if (src) src.setData(homesToGeoJSON(this.homes, this.newThisYear))
          // Clear entrance
          const eSrc = this.#map.getSource('homes-entrance')
          if (eSrc) eSrc.setData(EMPTY_FC)
        }, 420)
      }

      this.#prevHomeIds = currentIds

      // Update viewport count after data change
      requestAnimationFrame(() => this.#emitViewportCount())
    }

    // Update stroke color + map style when theme changes
    if (changed.has('theme') && this.theme) {
      const newKey = this.#resolveThemeKey()
      const newStyle = STYLE_FOR_THEME[newKey]

      // Update stroke color to match theme background
      if (this.#map.getLayer('homes-circles')) {
        this.#map.setPaintProperty('homes-circles', 'circle-stroke-color', this.theme.bg)
      }
      if (this.#map.getLayer('homes-entrance-circles')) {
        this.#map.setPaintProperty('homes-entrance-circles', 'circle-stroke-color', this.theme.bg)
      }

      // Switch Mapbox base style if theme category changed
      if (newStyle !== this.#currentStyle) {
        this.#currentStyle = newStyle
        this.#map.once('style.load', () => {
          // Re-add sources and layers after style swap
          this.#map.addSource('homes', {
            type: 'geojson',
            data: homesToGeoJSON(this.homes, this.newThisYear),
          })
          this.#map.addSource('homes-entrance', {
            type: 'geojson',
            data: EMPTY_FC,
          })
          this.#map.addLayer({
            id: 'homes-glow',
            type: 'circle',
            source: 'homes',
            filter: ['==', ['get', 'isNew'], true],
            paint: {
              'circle-radius': 24,
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.25,
              'circle-blur': 0.8,
            },
          })
          this.#map.addLayer({
            id: 'homes-circles',
            type: 'circle',
            source: 'homes',
            filter: ['!=', ['get', 'hidden'], true],
            paint: {
              'circle-radius': ['case', ['==', ['get', 'isNew'], true], 12, 9],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 3,
              'circle-stroke-color': this.theme.bg,
              'circle-opacity': 0.9,
            },
          })
          this.#map.addLayer({
            id: 'homes-entrance-glow',
            type: 'circle',
            source: 'homes-entrance',
            filter: ['==', ['get', 'isNew'], true],
            paint: {
              'circle-radius': 0,
              'circle-radius-transition': { duration: 0 },
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.25,
              'circle-blur': 0.8,
            },
          })
          this.#map.addLayer({
            id: 'homes-entrance-circles',
            type: 'circle',
            source: 'homes-entrance',
            paint: {
              'circle-radius': 0,
              'circle-radius-transition': { duration: 0 },
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 3,
              'circle-stroke-color': this.theme.bg,
              'circle-opacity': 0,
              'circle-opacity-transition': { duration: 0 },
            },
          })
        })
        this.#map.setStyle(newStyle)
      }
    }
  }

  render() {
    const t = this.theme || {}

    return html`
      <style>
        map-view {
          display: block;
          position: relative;
          width: 100%;
          height: 100%;
        }
        map-view .mapbox-container {
          position: absolute;
          inset: 0;
        }
        map-view .mapboxgl-ctrl-group {
          border-radius: 14px !important;
          box-shadow: 0 3px 14px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.05) !important;
          overflow: hidden;
        }
        map-view .mapboxgl-ctrl-group button {
          width: 36px !important;
          height: 36px !important;
        }
        map-view .map-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 2;
          pointer-events: none;
        }
        map-view .map-badge-inner {
          background: ${t.sheet || '#fff'};
          border-radius: 999px;
          padding: 6px 12px 6px 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04);
          font-size: 12px;
          font-weight: 600;
          color: ${t.ink || '#000'};
          display: flex;
          align-items: center;
          gap: 6px;
          pointer-events: auto;
        }
      </style>

      <div class="mapbox-container"></div>

      <div class="map-badge">
        <div class="map-badge-inner">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="none" stroke="${t.ink || '#000'}" stroke-width="1.2"/>
            <circle cx="6" cy="6" r="1.5" fill="${t.ink || '#000'}"/>
          </svg>
          Downtown Milwaukee
        </div>
      </div>
    `
  }
})
