// Loads the reduced MPROP file, keeps it in memory as an array of
// records, and provides lookup helpers for the map and store.

import { eraFor } from '../data/sample-data.js'

const JSON_URL = '/mprop_min.json'

let records = null    // [{id, address, year, zip, era, lng, lat}]
let loading = null

async function load() {
  if (records) return records
  if (loading) return loading
  loading = (async () => {
    const res = await fetch(JSON_URL)
    const raw = await res.json() // [[address, year, zip, lng, lat], ...]
    records = []
    for (let i = 0; i < raw.length; i++) {
      const [address, year, zip, lng, lat] = raw[i]
      if (lng == null || lat == null) continue // skip un-geocoded rows
      records.push({
        id: i,
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
