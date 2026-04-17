// Mapbox geocoding queue.
// - Dedupes in-flight requests
// - Limits concurrency
// - Writes results to geocodeCache
// - Emits events so map can refresh as coords arrive

import { geocodeCache } from './geocode-cache.js'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const CONCURRENCY = 4
const PROXIMITY = [-87.9065, 43.0389] // downtown Milwaukee — biases results
// Rough Milwaukee County bounding box. Results outside are rejected.
const MKE_BBOX = { west: -88.10, east: -87.77, south: 42.83, north: 43.20 }

const pending = new Map() // address -> { promise, resolve }
const queue = []
let active = 0

const listeners = new Set()
export function onGeocoded(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(address, coord) {
  for (const fn of listeners) {
    try { fn(address, coord) } catch (e) { console.error(e) }
  }
}

function inMilwaukee([lng, lat]) {
  return lng >= MKE_BBOX.west && lng <= MKE_BBOX.east
      && lat >= MKE_BBOX.south && lat <= MKE_BBOX.north
}

async function fetchGeocode(address) {
  const bbox = `${MKE_BBOX.west},${MKE_BBOX.south},${MKE_BBOX.east},${MKE_BBOX.north}`
  const q = encodeURIComponent(`${address}, Milwaukee, WI`)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json`
    + `?access_token=${TOKEN}`
    + `&proximity=${PROXIMITY[0]},${PROXIMITY[1]}`
    + `&bbox=${bbox}`
    + `&country=us&limit=1&types=address`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const center = data.features?.[0]?.center
    if (!center || !inMilwaukee(center)) return null
    return center
  } catch (e) {
    console.warn('[geocode] failed for', address, e)
    return null
  }
}

function drain() {
  while (active < CONCURRENCY && queue.length > 0) {
    const address = queue.shift()
    const entry = pending.get(address)
    if (!entry) continue
    active++
    ;(async () => {
      const coord = await fetchGeocode(address)
      if (coord) {
        await geocodeCache.set(address, coord)
        emit(address, coord)
      }
      entry.resolve(coord)
    })().finally(() => {
      active--
      pending.delete(address)
      drain()
    })
  }
}

export function enqueue(address) {
  if (pending.has(address)) return pending.get(address).promise
  let resolve
  const promise = new Promise(r => { resolve = r })
  pending.set(address, { promise, resolve })
  queue.push(address)
  drain()
  return promise
}

export async function enqueueMany(addresses) {
  const cache = await geocodeCache.getMany(addresses)
  let queued = 0
  for (const a of addresses) {
    if (cache.has(a)) continue
    if (pending.has(a)) continue
    enqueue(a)
    queued++
  }
  return { queued, cached: cache.size }
}

export function pendingCount() {
  return pending.size
}
