// Mapbox GL JS service
// Set VITE_MAPBOX_TOKEN in .env to enable

let mapInstance = null

export const MapService = {
  isConfigured() {
    return !!import.meta.env.VITE_MAPBOX_TOKEN
  },

  async init(container, { center, zoom, style } = {}) {
    if (!this.isConfigured()) {
      console.warn('[MapService] No VITE_MAPBOX_TOKEN — using SVG fallback map')
      return null
    }
    const mapboxgl = await import('mapbox-gl')
    mapboxgl.default.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    mapInstance = new mapboxgl.default.Map({
      container,
      style: style ?? 'mapbox://styles/mapbox/light-v11',
      center: center ?? [-87.9065, 43.0389], // Milwaukee
      zoom: zoom ?? 13,
    })
    return mapInstance
  },

  addMarkers(homes, onMarkerClick) {
    if (!mapInstance) return []
    const mapboxgl = window.mapboxgl
    return homes.map(home => {
      const el = document.createElement('div')
      el.className = 'map-pin'
      el.dataset.era = home.era
      const marker = new mapboxgl.Marker(el)
        .setLngLat([home.lng, home.lat])
        .addTo(mapInstance)
      el.addEventListener('click', () => onMarkerClick(home))
      return marker
    })
  },

  clearMarkers(markers = []) {
    markers.forEach(m => m.remove())
  },

  destroy() {
    mapInstance?.remove()
    mapInstance = null
  },
}
