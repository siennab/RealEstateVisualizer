// Loads reduced property JSON files per city, keeps them in memory as
// arrays of records, and provides lookup helpers for the map and store.

import { eraFor } from '../data/sample-data.js'

const BASE = import.meta.env.BASE_URL

// ── City definitions ────────────────────────────────────────────────
export const CITIES = {
  mke: { id: 'mke', label: 'Milwaukee', file: 'mprop_min.json',   center: [-87.9065, 43.0389] },
  msn: { id: 'msn', label: 'Madison',   file: 'madison_min.json', center: [-89.4012, 43.0731] },
}

// Longitude midpoint between the two cities (~-88.65)
const CITY_BOUNDARY_LNG = (CITIES.mke.center[0] + CITIES.msn.center[0]) / 2

/** Given a map center [lng, lat], return the nearest city id. */
export function cityForCenter([lng]) {
  return lng < CITY_BOUNDARY_LNG ? 'msn' : 'mke'
}

// ── Per-city record caches ──────────────────────────────────────────
const cache = {}      // cityId -> record[]
const pending = {}    // cityId -> Promise

let activeCity = 'mke'

async function loadCity(cityId) {
  if (cache[cityId]) return cache[cityId]
  if (pending[cityId]) return pending[cityId]
  const city = CITIES[cityId]
  if (!city) throw new Error(`Unknown city: ${cityId}`)
  pending[cityId] = (async () => {
    const res = await fetch(`${BASE}${city.file}`)
    const raw = await res.json() // [[address, year, zip, lng, lat], ...]
    const records = []
    for (let i = 0; i < raw.length; i++) {
      const [address, year, zip, lng, lat] = raw[i]
      if (lng == null || lat == null) continue
      records.push({
        id: `${cityId}-${i}`,
        address,
        year,
        zip,
        era: eraFor(year).id,
        lng,
        lat,
        style: null,
        beds: null,
        sqft: null,
      })
    }
    records.sort((a, b) => a.year - b.year)
    cache[cityId] = records
    delete pending[cityId]
    return records
  })()
  return pending[cityId]
}

/** Initialise the default (or given) city. */
export async function init(cityId = 'mke') {
  activeCity = cityId
  return loadCity(cityId)
}

/** Switch to a different city. Returns its records once loaded. */
export async function switchCity(cityId) {
  activeCity = cityId
  return loadCity(cityId)
}

export function allRecords() {
  return cache[activeCity] || []
}

export function getActiveCity() {
  return activeCity
}
