// Get approximate user location via IP geolocation (no permissions needed)

const DEFAULT_CENTER = [-87.9065, 43.0389] // Milwaukee fallback
let cachedLocation = null

export async function getUserLocation() {
  if (cachedLocation) return cachedLocation

  try {
    // Use ipapi.co free service (no key required for basic usage)
    const response = await fetch('https://ipapi.co/json/', {
      timeout: 3000,
    })
    
    if (!response.ok) throw new Error('Geolocation API failed')
    
    const data = await response.json()
    
    if (data.latitude && data.longitude) {
      cachedLocation = [data.longitude, data.latitude]
      return cachedLocation
    }
  } catch (error) {
    console.warn('Could not determine location, using default:', error)
  }

  // Fallback to Milwaukee
  cachedLocation = DEFAULT_CENTER
  return cachedLocation
}
