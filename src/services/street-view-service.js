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
   * @param {number|string} latOrAddress - Latitude (number) or full street address (string)
   * @param {number} [lng] - Longitude (only needed if first param is latitude)
   * @param {Object} options - Optional parameters
   * @param {number} options.width - Image width in pixels (default: 600)
   * @param {number} options.height - Image height in pixels (default: 400)
   * @param {number} options.heading - Camera heading 0-360 (default: auto)
   * @param {number} options.pitch - Camera pitch -90 to 90 (default: 0)
   * @param {number} options.fov - Field of view 0-120 (default: 90)
   * @returns {string|null} URL to Street View image, or null if not configured
   */
  getImageUrl(latOrAddress, lng, options = {}) {
    if (!this.isConfigured()) {
      return null
    }

    // Detect if we're using address or coordinates
    const isAddress = typeof latOrAddress === 'string'
    const location = isAddress ? latOrAddress : `${latOrAddress},${lng}`
    
    // Create cache key from location and options
    const cacheKey = `${location}-${JSON.stringify(options)}`
    
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
      location: location,
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
   * @param {number|string} latOrAddress - Latitude (number) or full street address (string)
   * @param {number} [lng] - Longitude (only needed if first param is latitude)
   * @returns {string|null} URL to metadata endpoint, or null if not configured
   */
  getMetadataUrl(latOrAddress, lng) {
    if (!this.isConfigured()) {
      return null
    }

    const isAddress = typeof latOrAddress === 'string'
    const location = isAddress ? latOrAddress : `${latOrAddress},${lng}`

    const params = new URLSearchParams({
      location: location,
      key: GOOGLE_API_KEY,
    })

    return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`
  },

  /**
   * Check if Street View imagery is available for a location
   * @param {number|string} latOrAddress - Latitude (number) or full street address (string)
   * @param {number} [lng] - Longitude (only needed if first param is latitude)
   * @returns {Promise<boolean>} True if imagery is available
   */
  async isAvailable(latOrAddress, lng) {
    if (!this.isConfigured()) {
      return false
    }

    try {
      const url = this.getMetadataUrl(latOrAddress, lng)
      const response = await fetch(url)
      const data = await response.json()
      return data.status === 'OK'
    } catch (error) {
      console.warn('[StreetViewService] Failed to check availability:', error)
      return false
    }
  },

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
}
