import { LitElement, html } from 'lit'
import mapboxgl from 'mapbox-gl'
import { ERAS, eraFor } from '../store.js'
import { getUserLocation } from '../services/location-service.js'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const DEFAULT_ZOOM = 13
const MIN_ZOOM = 5
const MAX_ZOOM = 19
const CLUSTER_MIN_POINTS = 80
const CLUSTER_MAX_ZOOM = 10
const CLUSTER_RADIUS = 80
const ERA_FADE_DELAY = 800

// Map Mapbox base styles to themes
const STYLE_FOR_THEME = {
  cream:    'mapbox://styles/mapbox/light-v11',
  mint:     'mapbox://styles/mapbox/light-v11',
  midnight: 'mapbox://styles/mapbox/dark-v11',
}

function homeToFeature(h, newThisYear, index) {
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
      lng: h.lng,
      lat: h.lat,
      color: (ERAS.find(e => e.id === h.era) || {}).color || '#F582AE',
      isNew: newThisYear instanceof Set ? newThisYear.has(h.id) : false,
      index: index,
    },
  }
}

function homesToGeoJSON(homes, newThisYear) {
  // Data is already sorted by year in mprop-data service
  return {
    type: 'FeatureCollection',
    features: (homes || []).map((h, index) => homeToFeature(h, newThisYear, index)),
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
    lng: props.lng,
    lat: props.lat,
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
  #eraFadeTimer = null
  #eraSettleTimer = null
  #currentEra = null
  #lastHomesJSON = null

  connectedCallback() {
    super.connectedCallback()
    // Defer map init until first render creates the container
    this.updateComplete.then(() => this.#initMap())
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this.#resizeFrame) cancelAnimationFrame(this.#resizeFrame)
    if (this.#eraFadeTimer) clearTimeout(this.#eraFadeTimer)
    if (this.#eraSettleTimer) clearTimeout(this.#eraSettleTimer)
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

    // Get user's approximate location (async, non-blocking)
    let initialCenter = [-87.9065, 43.0389] // Milwaukee default
    getUserLocation().then(center => {
      // If map is already initialized and location is different, fly to it
      if (this.#map && center[0] !== initialCenter[0]) {
        this.#map.flyTo({ center, zoom: DEFAULT_ZOOM, duration: 2000 })
      }
    }).catch(() => {
      // Ignore errors, just use default
    })

    this.#map = new mapboxgl.Map({
      container,
      style: this.#currentStyle,
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
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

      // Optimize: only use sort key when zoomed in enough
      // When zoomed out, there are too many pins for sorting to be performant
      this.#map.on('zoom', () => {
        this.#updateSortKeyForZoom()
      })
      this.#updateSortKeyForZoom() // Set initial state
    })
  }

  #buildDominantEraColorExpression() {
    // Build a nested case expression that checks each era's count
    // and returns the color of the era with the highest count
    const expression = ['case']
    
    // For each era (in reverse order so earlier eras take precedence in ties)
    for (let i = ERAS.length - 1; i >= 0; i--) {
      const era = ERAS[i]
      const countKey = `${era.id}_count`
      
      // Check if this era has the most homes in the cluster
      const isMaxCondition = ['all']
      for (let j = 0; j < ERAS.length; j++) {
        if (i === j) continue
        const otherEra = ERAS[j]
        isMaxCondition.push(['>=', ['get', countKey], ['get', `${otherEra.id}_count`]])
      }
      
      expression.push(isMaxCondition, era.color)
    }
    
    // Fallback color
    expression.push(this.theme?.ink || '#1B2238')
    
    return expression
  }

  #installMapLayers() {
    if (!this.#map) return

    // Build cluster properties for each era to track dominant color
    const clusterProperties = {}
    ERAS.forEach(era => {
      clusterProperties[`${era.id}_count`] = ['+', ['case', ['==', ['get', 'era'], era.id], 1, 0]]
    })

    this.#map.addSource('homes', {
      type: 'geojson',
      data: homesToGeoJSON(this.homes, this.newThisYear),
      cluster: true,
      clusterMinPoints: CLUSTER_MIN_POINTS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS,
      clusterProperties,
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
        'circle-color': this.#buildDominantEraColorExpression(),
        'circle-opacity': 0.2,
        'circle-stroke-width': 3,
        'circle-stroke-color': this.theme?.bg || '#FEF6E4',
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          28,
          100, 36,
          200, 46,
          400, 56,
          800, 66,
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
        'circle-radius': 9,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 3,
        'circle-stroke-color': this.theme?.bg || '#FEF6E4',
        'circle-opacity': 0.9,
        'circle-opacity-transition': { duration: 500 },
      },
    })
  }

  #updateSortKeyForZoom() {
    if (!this.#map || !this.#mapReady) return
    const zoom = this.#map.getZoom()
    const ZOOM_THRESHOLD = 14 // Only sort when zoomed in past this level
    
    // Enable sorting when zoomed in, disable when zoomed out for performance
    const sortKey = zoom >= ZOOM_THRESHOLD ? ['get', 'index'] : undefined
    
    if (this.#map.getLayer('homes-circles')) {
      this.#map.setLayoutProperty('homes-circles', 'circle-sort-key', sortKey)
    }
    if (this.#map.getLayer('homes-glow')) {
      this.#map.setLayoutProperty('homes-glow', 'circle-sort-key', sortKey)
    }
  }

  #updateEraOpacity(eraId, instant = false) {
    if (!this.#map || !this.#mapReady) return
    const layer = this.#map.getLayer('homes-circles')
    const glowLayer = this.#map.getLayer('homes-glow')
    if (!layer) return

    const duration = instant ? 0 : 500
    this.#map.setPaintProperty('homes-circles', 'circle-opacity-transition', { duration })
    if (glowLayer) {
      this.#map.setPaintProperty('homes-glow', 'circle-opacity-transition', { duration })
    }

    if (!eraId) {
      // Restore full opacity
      this.#map.setPaintProperty('homes-circles', 'circle-opacity', 0.9)
      if (glowLayer) {
        this.#map.setPaintProperty('homes-glow', 'circle-opacity', 0.25)
      }
    } else {
      // Find the era and get its index
      const currentEraIndex = ERAS.findIndex(e => e.id === eraId)
      if (currentEraIndex === -1) return
      
      // Fade pins from previous eras, keep current era at full opacity
      const previousEraIds = ERAS.slice(0, currentEraIndex).map(e => e.id)
      
      if (previousEraIds.length === 0) {
        // First era, everything at full opacity
        this.#map.setPaintProperty('homes-circles', 'circle-opacity', 0.9)
        if (glowLayer) {
          this.#map.setPaintProperty('homes-glow', 'circle-opacity', 0.25)
        }
      } else {
        // Build match expression for previous eras
        const matchExpression = [
          'match',
          ['get', 'era'],
          previousEraIds,
          0.25, // opacity for previous eras
          0.9   // opacity for current era
        ]
        
        this.#map.setPaintProperty('homes-circles', 'circle-opacity', matchExpression)
        if (glowLayer) {
          const glowMatchExpression = [
            'match',
            ['get', 'era'],
            previousEraIds,
            0.08,
            0.25
          ]
          this.#map.setPaintProperty('homes-glow', 'circle-opacity', glowMatchExpression)
        }
      }
    }
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

    // Update GeoJSON data ONLY when homes or newThisYear actually change
    // Pre-sorted data ensures correct z-ordering without expensive circle-sort-key
    if (changed.has('homes') || changed.has('newThisYear')) {
      const newJSON = JSON.stringify({ homes: this.homes, newThisYear: Array.from(this.newThisYear || []) })
      if (newJSON !== this.#lastHomesJSON) {
        this.#lastHomesJSON = newJSON
        const src = this.#map.getSource('homes')
        if (src) src.setData(homesToGeoJSON(this.homes, this.newThisYear))
        requestAnimationFrame(() => this.#emitViewportCount())
      }
    }

    // Handle era transitions with opacity fading - only after movement settles
    if (changed.has('year') && this.year) {
      const newEra = eraFor(this.year)
      
      // Clear any pending fade restore timer
      if (this.#eraFadeTimer) {
        clearTimeout(this.#eraFadeTimer)
        this.#eraFadeTimer = null
      }
      
      // If era changed or we're starting, apply the fade immediately
      if (newEra.id !== this.#currentEra) {
        this.#currentEra = newEra.id
        this.#updateEraOpacity(newEra.id, true)
      }
      
      // Clear any existing settle timer
      if (this.#eraSettleTimer) {
        clearTimeout(this.#eraSettleTimer)
      }
      
      // Wait for movement to stop before restoring full opacity
      this.#eraSettleTimer = setTimeout(() => {
        this.#eraSettleTimer = null
        this.#updateEraOpacity(null)
      }, 1200)
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
        this.#map.setPaintProperty('homes-clusters', 'circle-color', this.#buildDominantEraColorExpression())
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
