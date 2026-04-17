// Cache of ZIP -> { bbox: [west, south, east, north], center: [lng, lat] }.
// Used to approximately filter which addresses are "in the viewport"
// before we've geocoded their exact location. First call per zip uses Mapbox
// (1 request), then localStorage forever after.

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const LS_KEY = 'mke-zip-bboxes-v2'

let memory = null
const inflight = new Map()

function load() {
  if (memory) return memory
  try {
    memory = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    memory = {}
  }
  return memory
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(memory)) } catch {}
}

async function fetchZipBox(zip) {
  const q = encodeURIComponent(`${zip}, Milwaukee, WI`)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json`
    + `?access_token=${TOKEN}&country=us&types=postcode&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const f = data.features?.[0]
  if (!f) return null
  const center = f.center
  // Mapbox postcode responses include a bbox; fall back to a small buffer
  // around the centroid if missing.
  let bbox = f.bbox
  if (!bbox && center) {
    const pad = 0.02 // ~2km
    bbox = [center[0] - pad, center[1] - pad, center[0] + pad, center[1] + pad]
  }
  if (!bbox) return null
  return { bbox, center }
}

export async function getZipBox(zip) {
  const m = load()
  if (m[zip]) return m[zip]
  if (inflight.has(zip)) return inflight.get(zip)
  const p = fetchZipBox(zip).then(c => {
    if (c) { m[zip] = c; save() }
    inflight.delete(zip)
    return c
  })
  inflight.set(zip, p)
  return p
}

export async function ensureZips(zips) {
  const unique = [...new Set(zips)]
  await Promise.all(unique.map(z => getZipBox(z)))
  return { ...load() }
}

export function getCached() {
  return { ...load() }
}
