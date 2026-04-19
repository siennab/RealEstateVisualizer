// Google Street View Static API service
// Provides street-level imagery for properties
// Get your API key at https://console.cloud.google.com

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// In-memory cache to avoid duplicate requests for same locations
const urlCache = new Map()

export const StreetViewService = {
  /**
   * Check if the service is configured with an API key
   */
  isConfigured() {
    return !!GOOGLE_API_KEY
  },

  /**
   * Generate a Street View Static API URL for a given location
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {Object} options - Optional parameters
   * @param {number} options.width - Image width in pixels (default: 600)
   * @param {number} options.height - Image height in pixels (default: 400)
   * @param {number} options.heading - Camera heading 0-360 (default: auto)
   * @param {number} options.pitch - Camera pitch -90 to 90 (default: 0)
   * @param {number} options.fov - Field of view 0-120 (default: 90)
   * @returns {string|null} URL to Street View image, or null if not configured
   */
  getImageUrl(lat, lng, options = {}) {
    if (!this.isConfigured()) {
      return null
    }

    // Create cache key from location and options
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}-${JSON.stringify(options)}`
    
    // Return cached URL if available
    if (urlCache.has(cacheKey)) {
      return urlCache.get(cacheKey)
    }

    const {
      width = 600,
      height = 400,
      heading, // auto-determined if not specified
      pitch = 0,
      fov = 90,
    } = options

    const params = new URLSearchParams({
      size: `${width}x${height}`,
      location: `${lat},${lng}`,
      pitch: pitch.toString(),
      fov: fov.toString(),
      key: GOOGLE_API_KEY,
    })

    // Only add heading if explicitly specified
    if (heading !== undefined) {
      params.set('heading', heading.toString())
    }

    const url = `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`
    
    // Cache the URL
    urlCache.set(cacheKey, url)
    
    return url
  },

  /**
   * Generate a Street View metadata URL to check if imagery is available
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {string|null} URL to metadata endpoint, or null if not configured
   */
  getMetadataUrl(lat, lng) {
    if (!this.isConfigured()) {
      return null
    }

    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      key: GOOGLE_API_KEY,
    })

    return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`
  },

  /**
   * Check if Street View imagery is available for a location
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<boolean>} True if imagery is available
   */
  async isAvailable(lat, lng) {
    if (!this.isConfigured()) {

  /**
   * Get cache statistics for monitoring usage
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      cachedLocations: urlCache.size,
      // Estimate: each cached location saves one API request
      estimatedRequestsSaved: urlCache.size,
    }
  },

  /**
   * Clear the URL cache (useful for testing or memory management)
   */
  clearCache() {
    urlCache.clear()
  },
      return false
    }

    try {
      const url = this.getMetadataUrl(lat, lng)
      const response = await fetch(url)
      const data = await response.json()
      return data.status === 'OK'
    } catch (error) {
      console.warn('[StreetViewService] Failed to check availability:', error)
      return false
    }
  },
}
