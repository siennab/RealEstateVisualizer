// Loads the reduced MPROP file, keeps it in memory as an array of records,
// and provides a viewport-aware lookup that merges in geocoded coords.

import { eraFor } from '../data/sample-data.js'
import { geocodeCache } from './geocode-cache.js'
import { onGeocoded } from './geocoding-service.js'
import { ensureZips, getCached as getCachedZipCentroids } from './zip-centroids.js'

const JSON_URL = '/mprop_min.json'

let records = null    // [{id, address, year, zip, era}]
let byAddress = null  // Map<address, record>
let coords = new Map() // address -> [lng, lat]
let loading = null

const listeners = new Set()
export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
let notifyPending = false
function notify() {
  if (notifyPending) return
  notifyPending = true
  requestAnimationFrame(() => {
    notifyPending = false
    for (const fn of listeners) { try { fn() } catch (e) { console.error(e) } }
  })
}

// Merge any newly-geocoded result into our memory map
onGeocoded((address, coord) => {
  coords.set(address, coord)
  notify()
})

async function load() {
  if (records) return records
  if (loading) return loading
  loading = (async () => {
    const res = await fetch(JSON_URL)
    const raw = await res.json() // [[address, year, zip], ...]
    records = raw.map((row, i) => {
      const [address, year, zip, lng, lat] = row
      // Street identity = everything after the house number. e.g.
      // "1451 N 51ST ST" -> "N 51ST ST". Used to group addresses for the
      // street-based viewport filter.
      const spaceIdx = address.indexOf(' ')
      const street = spaceIdx > 0 ? address.slice(spaceIdx + 1) : address
      // Rows optionally carry pre-baked [lng, lat] if they were merged from
      // a geocode cache ahead of time.
      if (lng != null && lat != null) {
        coords.set(address, [lng, lat])
      }
      return {
        id: i,
        address,
        street,
        year,
        zip,
        era: eraFor(year).id,
        style: null,
        beds: null,
        sqft: null,
      }
    })
    byAddress = new Map(records.map(r => [r.address, r]))
    // Seed coord map from persistent IDB cache (session-specific geocodes)
    const cached = await geocodeCache.all()
    for (const [addr, c] of Object.entries(cached)) {
      if (byAddress.has(addr) && !coords.has(addr)) coords.set(addr, c)
    }
    notify()
    return records
  })()
  return loading
}

export async function init() {
  return load()
}

export function allRecords() {
  return records || []
}

export function getCoord(address) {
  return coords.get(address) ?? null
}

export function coordsMap() {
  return coords
}

export function hasCoord(address) {
  return coords.has(address)
}

// List of records that currently have coordinates and pass a `yearFilter`.
// For the map to render, we only return records with known lat/lng.
export function geocodedVisible(yearFilter = () => true) {
  const out = []
  for (const r of records || []) {
    if (!coords.has(r.address)) continue
    if (!yearFilter(r.year)) continue
    const [lng, lat] = coords.get(r.address)
    out.push({ ...r, lng, lat })
  }
  return out
}

function visibleZipsFor(bounds) {
  const zc = getCachedZipCentroids()
  const set = new Set()
  for (const [zip, entry] of Object.entries(zc)) {
    const bb = entry?.bbox
    if (!bb) continue
    const [w, s, e, n] = bb
    if (w <= bounds.east && e >= bounds.west && s <= bounds.north && n >= bounds.south) {
      set.add(Number(zip))
    }
  }
  return set
}

function inBounds([lng, lat], b) {
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north
}

// Returns two candidate buckets for geocoding. Callers should spend their
// budget on `primary` first (addresses on streets we already know are in the
// viewport), then fall back to `seed` (one address per unseen street in the
// visible zips, to bootstrap the street-anchor map).
export function viewportCandidates(bounds) {
  const visibleZips = visibleZipsFor(bounds)
  if (visibleZips.size === 0) return { primary: [], seed: [] }

  // Pass 1: gather streets that already have at least one geocoded pin, and
  // which of those pins fall in the viewport.
  const seededStreets = new Set()
  const visibleStreets = new Set()
  for (const r of records || []) {
    if (!visibleZips.has(r.zip)) continue
    const c = coords.get(r.address)
    if (!c) continue
    const key = `${r.zip}|${r.street}`
    seededStreets.add(key)
    if (inBounds(c, bounds)) visibleStreets.add(key)
  }

  // Pass 2: bucket un-geocoded records.
  const primary = []
  const seedByStreet = new Map()
  for (const r of records || []) {
    if (coords.has(r.address)) continue
    if (!visibleZips.has(r.zip)) continue
    const key = `${r.zip}|${r.street}`
    if (visibleStreets.has(key)) {
      primary.push(r)
    } else if (!seededStreets.has(key) && !seedByStreet.has(key)) {
      seedByStreet.set(key, r)
    }
  }
  return { primary, seed: [...seedByStreet.values()] }
}

export async function ensureZipsForViewport() {
  // Make sure we have centroids for every zip in the dataset.
  // Called lazily; only does work the first time.
  const zips = [...new Set((records || []).map(r => r.zip))]
  return ensureZips(zips)
}
