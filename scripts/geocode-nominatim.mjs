#!/usr/bin/env node
// Pre-geocode all addresses in mprop_min.json using Nominatim (OpenStreetMap).
//
// Usage:   node scripts/geocode-nominatim.mjs
// Resume:  Just run again — already-geocoded entries are skipped.
//
// Nominatim usage policy: max 1 req/sec on the public instance.
// https://operations.osmfoundation.org/policies/nominatim/
//
// ~135K addresses at 1/sec ≈ 37 hours. The script saves progress every
// SAVE_INTERVAL records so you can Ctrl-C and restart at any time.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Config ──────────────────────────────────────────────────
const INPUT  = resolve('public/mprop_min.json')
const DELAY  = 1100                 // ms between requests (respect rate limit)
const SAVE_INTERVAL = 100           // write file every N geocoded addresses
const USER_AGENT = 'MilwaukeeHistoryMapGeocoder/1.0 (dev project)'
const CITY   = 'Milwaukee'
const STATE  = 'Wisconsin'
const COUNTRY = 'us'

// ── Helpers ─────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function geocode(street, zip) {
  const params = new URLSearchParams({
    street,
    city: CITY,
    state: STATE,
    postalcode: String(zip),
    countrycodes: COUNTRY,
    format: 'jsonv2',
    limit: '1',
  })
  const url = `https://nominatim.openstreetmap.org/search?${params}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  if (data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

// ── Main ────────────────────────────────────────────────────
const raw = readFileSync(INPUT, 'utf-8')
const records = JSON.parse(raw)

const total   = records.length
const already = records.filter(r => r.length >= 5).length
const todo    = total - already
console.log(`Total records : ${total.toLocaleString()}`)
console.log(`Already done  : ${already.toLocaleString()}`)
console.log(`To geocode    : ${todo.toLocaleString()}\n`)

if (todo === 0) {
  console.log('Nothing to do — all records already have coordinates.')
  process.exit(0)
}

let geocoded  = 0
let failed    = 0
let unsaved   = 0

function save() {
  writeFileSync(INPUT, JSON.stringify(records), 'utf-8')
  unsaved = 0
}

// Graceful shutdown — save on Ctrl-C
process.on('SIGINT', () => {
  console.log('\n\nInterrupted — saving progress...')
  save()
  console.log(`Saved. Geocoded ${geocoded} this run (${failed} failed).`)
  process.exit(0)
})

const start = Date.now()

for (let i = 0; i < records.length; i++) {
  const rec = records[i]

  // rec = ["address", year, zip] or ["address", year, zip, lng, lat]
  if (rec.length >= 5) continue  // already has coords

  const address = rec[0]
  const zip     = rec[2]

  try {
    const result = await geocode(address, zip)
    if (result) {
      rec.push(result.lng, result.lat)  // [3]=lng, [4]=lat
      geocoded++
    } else {
      failed++
    }
  } catch (err) {
    console.error(`  Error on "${address}": ${err.message}`)
    failed++
    // Back off on errors
    await sleep(5000)
  }

  unsaved++
  if (unsaved >= SAVE_INTERVAL) {
    save()
    const pct = (((geocoded + failed) / todo) * 100).toFixed(1)
    const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1)
    console.log(
      `[${pct}%] ${geocoded} geocoded, ${failed} failed — ${elapsed} min elapsed — record ${i + 1}/${total}`
    )
  }

  await sleep(DELAY)
}

// Final save
save()

console.log(`\nDone.`)
console.log(`  Geocoded : ${geocoded}`)
console.log(`  Failed   : ${failed}`)
console.log(`  Total    : ${total}`)
