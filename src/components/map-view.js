import { LitElement, html } from 'lit'
import mapboxgl from 'mapbox-gl'
import { ERAS } from '../store.js'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const CENTER = [-87.9065, 43.0389] // Downtown Milwaukee [lng, lat]
const ZOOM = 17
const MIN_ZOOM = 5
const MAX_ZOOM = 19
const CLUSTER_MIN_POINTS = 10
const CLUSTER_MAX_ZOOM = 12
const CLUSTER_RADIUS = 60

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
  #resizeFrame = 0
  #resizeObserver = null
  #handleViewportResize = () => this.#scheduleResize()

  connectedCallback() {
    super.connectedCallback()
    // Defer map init until first render creates the container
    this.updateComplete.then(() => this.#initMap())
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this.#resizeFrame) cancelAnimationFrame(this.#resizeFrame)
    this.#resizeObserver?.disconnect()
    window.visualViewport?.removeEventListener('resize', this.#handleViewportResize)
    window.removeEventListener('orientationchange', this.#handleViewportResize)
    if (this.#map) {
      this.#map.remove()
      this.#map = null
      this.#mapReady = false
    }
  }

  #initMap() {
    const container = this.querySelector('.mapbox-container')
    if (!container || this.#map) return

    this.#resizeObserver = new ResizeObserver(() => this.#scheduleResize())
    this.#resizeObserver.observe(container)
    window.visualViewport?.addEventListener('resize', this.#handleViewportResize)
    window.addEventListener('orientationchange', this.#handleViewportResize)

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
      this.#scheduleResize()

      this.#installMapLayers()
      this.#bindMapEvents()

      // Emit viewport count on move and data changes
      this.#map.on('moveend', () => {
        this.#emitViewportCount()
      })
    })
  }

  #installMapLayers() {
    if (!this.#map) return

    this.#map.addSource('homes', {
      type: 'geojson',
      data: homesToGeoJSON(this.homes, this.newThisYear),
      cluster: true,
      clusterMinPoints: CLUSTER_MIN_POINTS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS,
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
      id: 'homes-clusters',
      type: 'circle',
      source: 'homes',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': this.theme?.ink || '#1B2238',
        'circle-opacity': 0.16,
        'circle-stroke-width': 2,
        'circle-stroke-color': this.theme?.bg || '#FEF6E4',
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          22,
          20, 28,
          40, 36,
          80, 46,
          160, 56,
        ],
      },
    })

    this.#map.addLayer({
      id: 'homes-cluster-count',
      type: 'symbol',
      source: 'homes',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': [
          'step',
          ['get', 'point_count'],
          14,
          40, 16,
          120, 18,
        ],
      },
      paint: {
        'text-color': this.theme?.ink || '#1B2238',
      },
    })

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
  }

  #bindMapEvents() {
    if (!this.#map) return

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

    this.#map.on('click', 'homes-clusters', (e) => {
      const cluster = e.features?.[0]
      if (!cluster) return
      e.originalEvent.stopPropagation()
      const source = this.#map.getSource('homes')
      source.getClusterExpansionZoom(cluster.properties.cluster_id, (err, zoom) => {
        if (err) return
        this.#map.easeTo({ center: cluster.geometry.coordinates, zoom })
      })
    })

    this.#map.on('click', (e) => {
      const features = this.#map.queryRenderedFeatures(e.point, {
        layers: ['homes-circles', 'homes-clusters'],
      })
      if (features.length === 0) {
        this.dispatchEvent(new CustomEvent('map-clicked', { bubbles: true, composed: true }))
      }
    })

    this.#map.on('mouseenter', 'homes-circles', () => {
      this.#map.getCanvas().style.cursor = 'pointer'
    })
    this.#map.on('mouseleave', 'homes-circles', () => {
      this.#map.getCanvas().style.cursor = ''
    })
    this.#map.on('mouseenter', 'homes-clusters', () => {
      this.#map.getCanvas().style.cursor = 'pointer'
    })
    this.#map.on('mouseleave', 'homes-clusters', () => {
      this.#map.getCanvas().style.cursor = ''
    })
  }

  #scheduleResize() {
    if (!this.#map) return
    if (this.#resizeFrame) cancelAnimationFrame(this.#resizeFrame)
    this.#resizeFrame = requestAnimationFrame(() => {
      this.#resizeFrame = 0
      this.#map?.resize()
    })
  }

  #emitViewportCount() {
    // Throttle: skip if one is already scheduled
    if (this.#viewportCountTimer) return
    this.#viewportCountTimer = setTimeout(() => {
      this.#viewportCountTimer = null
      if (!this.#map || !this.#mapReady) return
      const features = this.#map.queryRenderedFeatures(undefined, {
        layers: ['homes-circles', 'homes-clusters'],
      })
      let count = 0
      const unique = new Set()
      features.forEach(feature => {
        const pointCount = feature.properties?.point_count
        if (pointCount != null) {
          count += Number(pointCount)
          return
        }
        unique.add(feature.properties.id)
      })
      this.dispatchEvent(new CustomEvent('viewport-count', {
        detail: { count: count + unique.size },
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
      if (this.#map.getLayer('homes-clusters')) {
        this.#map.setPaintProperty('homes-clusters', 'circle-color', this.theme.ink)
        this.#map.setPaintProperty('homes-clusters', 'circle-stroke-color', this.theme.bg)
      }
      if (this.#map.getLayer('homes-cluster-count')) {
        this.#map.setPaintProperty('homes-cluster-count', 'text-color', this.theme.ink)
      }

      // Switch Mapbox base style if theme category changed
      if (newStyle !== this.#currentStyle) {
        this.#currentStyle = newStyle
        this.#map.once('style.load', () => {
          this.#installMapLayers()
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
          width: 100%;
          height: 100%;
          min-height: 100%;
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
      </style>

      <div class="mapbox-container"></div>
    `
  }
})
