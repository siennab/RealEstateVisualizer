import { LitElement, html } from 'lit'
import mapboxgl from 'mapbox-gl'
import { ERAS } from '../store.js'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const CENTER = [-87.9065, 43.0389] // Downtown Milwaukee [lng, lat]
const ZOOM = 14
const MIN_ZOOM = 11
const MAX_ZOOM = 19

// Map Mapbox base styles to themes
// Using Outdoors style for cream theme - minimal, clean aesthetic like mockup
const STYLE_FOR_THEME = {
  cream:    'mapbox://styles/siennabast/cmo7okcsd000d01qk3mxzapqe',
  mint:     'mapbox://styles/mapbox/outdoors-v12',
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
function featureToHome(feature) {
  const props = feature.properties
  const coords = feature.geometry.coordinates
  return {
    id: props.id,
    year: props.year,
    era: props.era,
    style: props.style,
    address: props.address,
    beds: props.beds,
    sqft: props.sqft,
    lng: coords[0],
    lat: coords[1],
  }
}

customElements.define('map-view', class extends LitElement {
  createRenderRoot() { return this }

  static properties = {
    homes:       { type: Array },
    newThisYear: { type: Object },
    theme:       { type: Object },
    year:        { type: Number },
    isScrubbing: { type: Boolean },
    isPlaying:   { type: Boolean },
    activeEra:   { type: String },
  }

  #map = null
  #mapReady = false
  #currentStyle = null
  #viewportCountTimer = null
  #resizeObserver = null

  connectedCallback() {
    super.connectedCallback()
    // Defer map init until first render creates the container
    this.updateComplete.then(() => this.#initMap())
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
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

      // Fix mobile first-load half-height: resize once layout has settled
      this.#map.resize()

      // Keep map in sync with container size changes (e.g. keyboard, orientation)
      this.#resizeObserver = new ResizeObserver(() => {
        this.#map?.resize()
      })
      this.#resizeObserver.observe(container)

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

      // Glow layer for newly-built homes (subtle pulse)
      this.#map.addLayer({
        id: 'homes-glow',
        type: 'circle',
        source: 'homes',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'isNew'], true]],
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            11, 12,
            14, 20,
            19, 35
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.2,
          'circle-blur': 0.6,
        },
      })

      // Donut-style pins that scale with zoom (like mockup)
      this.#map.addLayer({
        id: 'homes-circles',
        type: 'circle',
        source: 'homes',
        filter: ['!', ['has', 'point_count']],
        paint: {
          // Solid colored circle with cream border
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            11, ['case', ['==', ['get', 'isNew'], true], 6, 4.5],
            14, ['case', ['==', ['get', 'isNew'], true], 9, 7.5],
            19, ['case', ['==', ['get', 'isNew'], true], 13.5, 12]
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 1.5,
            14, 2,
            19, 3
          ],
          'circle-stroke-color': this.theme?.bg || '#FEF6E4',
          'circle-opacity': 1,
          'circle-stroke-opacity': 1,
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
        this.dispatchEvent(new CustomEvent('property-selected', {
          detail: { property: featureToHome(e.features[0]) },
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
      
      // Count individual visible homes
      const individualHomes = this.#map.queryRenderedFeatures({ layers: ['homes-circles'] })
      const uniqueIndividual = new Set(individualHomes.map(f => f.properties.id))
      
      // Check if clusters are visible
      const clusters = this.#map.queryRenderedFeatures({ layers: ['clusters'] })
      const hasClusters = clusters.length > 0
      
      this.dispatchEvent(new CustomEvent('viewport-count', {
        detail: { 
          count: uniqueIndividual.size,
          hasClusters: hasClusters
        },
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

    // Update opacity when scrubbing/playing state or active era changes
    if ((changed.has('isScrubbing') || changed.has('isPlaying') || changed.has('activeEra')) && this.#map.getLayer('homes-circles')) {
      const shouldDim = (this.isScrubbing || this.isPlaying) && this.activeEra
      console.log('map-view: dimming changed', { isScrubbing: this.isScrubbing, isPlaying: this.isPlaying, activeEra: this.activeEra, shouldDim })
      if (shouldDim) {
        // Dim non-active eras during scrubbing or playback
        this.#map.setPaintProperty('homes-circles', 'circle-opacity', [
          'case',
          ['==', ['get', 'era'], this.activeEra], 1,
          0.3
        ])
        this.#map.setPaintProperty('homes-circles', 'circle-stroke-opacity', [
          'case',
          ['==', ['get', 'era'], this.activeEra], 1,
          0.3
        ])
        // Also dim the glow layer
        if (this.#map.getLayer('homes-glow')) {
          this.#map.setPaintProperty('homes-glow', 'circle-opacity', [
            'case',
            ['==', ['get', 'era'], this.activeEra], 0.2,
            0.05
          ])
        }
      } else {
        // Full opacity when not scrubbing
        this.#map.setPaintProperty('homes-circles', 'circle-opacity', 1)
        this.#map.setPaintProperty('homes-circles', 'circle-stroke-opacity', 1)
        if (this.#map.getLayer('homes-glow')) {
          this.#map.setPaintProperty('homes-glow', 'circle-opacity', 0.2)
        }
      }
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
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                11, 12,
                14, 20,
                19, 35
              ],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.2,
              'circle-blur': 0.6,
            },
          })
          this.#map.addLayer({
            id: 'homes-circles',
            type: 'circle',
            source: 'homes',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                11, ['case', ['==', ['get', 'isNew'], true], 6, 4.5],
                14, ['case', ['==', ['get', 'isNew'], true], 9, 7.5],
                19, ['case', ['==', ['get', 'isNew'], true], 13.5, 12]
              ],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': [
                'interpolate', ['linear'], ['zoom'],
                11, 1.5,
                14, 2,
                19, 3
              ],
              'circle-stroke-color': this.theme.bg,
              'circle-opacity': 1,
              'circle-stroke-opacity': 1,
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
    `
  }
})
