import { LitElement, html } from 'lit'
import mapboxgl from 'mapbox-gl'
import { ERAS } from '../store.js'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const CENTER = [-87.9065, 43.0389] // Downtown Milwaukee [lng, lat]
const ZOOM = 14
const MIN_ZOOM = 11
const MAX_ZOOM = 19

// Map Mapbox base styles to themes
const STYLE_FOR_THEME = {
  cream:    'mapbox://styles/mapbox/light-v11',
  mint:     'mapbox://styles/mapbox/light-v11',
  midnight: 'mapbox://styles/mapbox/dark-v11',
}

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
  #viewportCountTimer = null

  connectedCallback() {
    super.connectedCallback()
    // Defer map init until first render creates the container
    this.updateComplete.then(() => this.#initMap())
  }

  disconnectedCallback() {
    super.disconnectedCallback()
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
      // Enable clustering on desktop for better performance, lighter on mobile
      const isDesktop = window.innerWidth >= 768
      const sourceConfig = {
        type: 'geojson',
        data: homesToGeoJSON(this.homes, this.newThisYear),
        cluster: true,
        clusterMaxZoom: isDesktop ? 14 : 12,  // Cluster less aggressively on mobile
        clusterRadius: isDesktop ? 80 : 60,
        clusterProperties: {
          // Count homes per era in each cluster
          early: ['+', ['case', ['==', ['get', 'era'], 'early'], 1, 0]],
          gilded: ['+', ['case', ['==', ['get', 'era'], 'gilded'], 1, 0]],
          victorian: ['+', ['case', ['==', ['get', 'era'], 'victorian'], 1, 0]],
          craftsman: ['+', ['case', ['==', ['get', 'era'], 'craftsman'], 1, 0]],
          depression: ['+', ['case', ['==', ['get', 'era'], 'depression'], 1, 0]],
          midcentury: ['+', ['case', ['==', ['get', 'era'], 'midcentury'], 1, 0]],
          modernist: ['+', ['case', ['==', ['get', 'era'], 'modernist'], 1, 0]],
          revival: ['+', ['case', ['==', ['get', 'era'], 'revival'], 1, 0]],
          contemp: ['+', ['case', ['==', ['get', 'era'], 'contemp'], 1, 0]],
        },
      }
      
      this.#map.addSource('homes', sourceConfig)

      // Cluster circles layer (both desktop and mobile)
      this.#map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'homes',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'case',
            // Check which era has the most homes in this cluster
            ['>=', ['get', 'early'], ['max', ['get', 'gilded'], ['get', 'victorian'], ['get', 'craftsman'], ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#C9A66B',
            ['>=', ['get', 'gilded'], ['max', ['get', 'victorian'], ['get', 'craftsman'], ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#B8860B',
            ['>=', ['get', 'victorian'], ['max', ['get', 'craftsman'], ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#8E4A7F',
            ['>=', ['get', 'craftsman'], ['max', ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#A65A3A',
            ['>=', ['get', 'depression'], ['max', ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#5A6B7A',
            ['>=', ['get', 'midcentury'], ['max', ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#E8A87C',
            ['>=', ['get', 'modernist'], ['max', ['get', 'revival'], ['get', 'contemp']]], '#6B8E7F',
            ['>=', ['get', 'revival'], ['get', 'contemp']], '#C97B63',
            '#F582AE' // contemp or fallback
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            10,
            25,
            25,
            30,
            50,
            35,
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': this.theme?.bg || '#FEF6E4',
          'circle-opacity': 0.85,
        },
      })

      this.#map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'homes',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: {
          'text-color': this.theme?.bg || '#FEF6E4',
        },
      })

      // Glow layer for newly-built homes
      this.#map.addLayer({
        id: 'homes-glow',
        type: 'circle',
        source: 'homes',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'isNew'], true]],
        paint: {
          'circle-radius': 24,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      })

      // Main circle layer
      this.#map.addLayer({
        id: 'homes-circles',
        type: 'circle',
        source: 'homes',
        filter: ['!', ['has', 'point_count']],
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

      // Click on cluster to zoom in
      this.#map.on('click', 'clusters', (e) => {
        const features = this.#map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const clusterId = features[0].properties.cluster_id
        this.#map.getSource('homes').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return
          this.#map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom,
          })
        })
      })

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

      // Pointer cursor on clusters
      this.#map.on('mouseenter', 'clusters', () => {
        this.#map.getCanvas().style.cursor = 'pointer'
      })
      this.#map.on('mouseleave', 'clusters', () => {
        this.#map.getCanvas().style.cursor = ''
      })

      // Emit viewport count on move and data changes
      this.#map.on('moveend', () => {
        this.#emitViewportCount()
      })
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
      const src = this.#map.getSource('homes')
      if (src) src.setData(homesToGeoJSON(this.homes, this.newThisYear))

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

      // Switch Mapbox base style if theme category changed
      if (newStyle !== this.#currentStyle) {
        this.#currentStyle = newStyle
        this.#map.once('style.load', () => {
          // Re-add sources and layers after style swap
          const isDesktop = window.innerWidth >= 768
          const sourceConfig = {
            type: 'geojson',
            data: homesToGeoJSON(this.homes, this.newThisYear),
            cluster: true,
            clusterMaxZoom: isDesktop ? 14 : 12,  // Cluster less aggressively on mobile
            clusterRadius: isDesktop ? 80 : 60,
            clusterProperties: {
              // Count homes per era in each cluster
              early: ['+', ['case', ['==', ['get', 'era'], 'early'], 1, 0]],
              gilded: ['+', ['case', ['==', ['get', 'era'], 'gilded'], 1, 0]],
              victorian: ['+', ['case', ['==', ['get', 'era'], 'victorian'], 1, 0]],
              craftsman: ['+', ['case', ['==', ['get', 'era'], 'craftsman'], 1, 0]],
              depression: ['+', ['case', ['==', ['get', 'era'], 'depression'], 1, 0]],
              midcentury: ['+', ['case', ['==', ['get', 'era'], 'midcentury'], 1, 0]],
              modernist: ['+', ['case', ['==', ['get', 'era'], 'modernist'], 1, 0]],
              revival: ['+', ['case', ['==', ['get', 'era'], 'revival'], 1, 0]],
              contemp: ['+', ['case', ['==', ['get', 'era'], 'contemp'], 1, 0]],
            },
          }
          
          this.#map.addSource('homes', sourceConfig)

          // Add cluster layers
          this.#map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'homes',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': [
                'case',
                // Check which era has the most homes in this cluster
                ['>=', ['get', 'early'], ['max', ['get', 'gilded'], ['get', 'victorian'], ['get', 'craftsman'], ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#C9A66B',
                ['>=', ['get', 'gilded'], ['max', ['get', 'victorian'], ['get', 'craftsman'], ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#B8860B',
                ['>=', ['get', 'victorian'], ['max', ['get', 'craftsman'], ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#8E4A7F',
                ['>=', ['get', 'craftsman'], ['max', ['get', 'depression'], ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#A65A3A',
                ['>=', ['get', 'depression'], ['max', ['get', 'midcentury'], ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#5A6B7A',
                ['>=', ['get', 'midcentury'], ['max', ['get', 'modernist'], ['get', 'revival'], ['get', 'contemp']]], '#E8A87C',
                ['>=', ['get', 'modernist'], ['max', ['get', 'revival'], ['get', 'contemp']]], '#6B8E7F',
                ['>=', ['get', 'revival'], ['get', 'contemp']], '#C97B63',
                '#F582AE' // contemp or fallback
              ],
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                20,
                10,
                25,
                25,
                30,
                50,
                35,
              ],
              'circle-stroke-width': 3,
              'circle-stroke-color': this.theme.bg,
              'circle-opacity': 0.85,
            },
          })

          this.#map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'homes',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': '{point_count_abbreviated}',
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': 13,
            },
            paint: {
              'text-color': this.theme.bg,
            },
          })

          this.#map.addLayer({
            id: 'homes-glow',
            type: 'circle',
            source: 'homes',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'isNew'], true]],
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
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': ['case', ['==', ['get', 'isNew'], true], 12, 9],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 3,
              'circle-stroke-color': this.theme.bg,
              'circle-opacity': 0.9,
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
