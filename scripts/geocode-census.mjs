#!/usr/bin/env node
// Batch-geocode addresses in mprop_min.json using the US Census Bureau Geocoder.
//
// Usage:   node scripts/geocode-census.mjs
// Resume:  Just run again — already-geocoded entries are skipped.
//
// Census batch geocoder: free, no API key, no daily limits.
// Max 10,000 records per batch request.
// https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Config ──────────────────────────────────────────────────
const INPUT      = resolve('public/mprop_min.json');
const BATCH_SIZE = 10_000;          // Census max per request
const CITY       = 'Milwaukee';
const STATE      = 'WI';
const ENDPOINT   = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
const BENCHMARK  = 'Public_AR_Current';

// Census can be slow — generous timeouts
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes per batch
const RETRY_DELAY_MS     = 30_000;           // 30s between retries
const MAX_RETRIES        = 3;

// ── Helpers ─────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Build CSV string for a batch.  Census format: UniqueID, Street, City, State, ZIP */
function buildCSV(batch) {
  return batch
    .map(({ idx, address, zip }) => {
      // Quote the address in case it contains commas
      const safeAddr = `"${address.replace(/"/g, '""')}"`;
      return `${idx},${safeAddr},${CITY},${STATE},${zip}`;
    })
    .join('\n');
}

/** Parse the Census response CSV.  Returns Map<index, {lng, lat}> */
function parseResponse(text) {
  const results = new Map();
  const lines = text.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    // Response columns (quoted CSV):
    // "ID","InputAddr","Match","MatchType","MatchedAddr","Coords","TigerLineID","Side"
    // Coords = "-87.912227,43.032022"  (lng,lat)
    const cols = parseCSVLine(line);
    if (!cols || cols.length < 6) continue;

    const id    = parseInt(cols[0], 10);
    const match = cols[2];

    if (match === 'Match' || match === 'Non_Match' || match === 'Tie') {
      // Only store actual matches
      if (match === 'Match' || match === 'Tie') {
        const coordStr = cols[5]; // e.g. "-87.912227,43.032022"
        if (coordStr) {
          const [lngStr, latStr] = coordStr.split(',');
          const lng = parseFloat(lngStr);
          const lat = parseFloat(latStr);
          if (!isNaN(lng) && !isNaN(lat)) {
            results.set(id, { lng, lat });
          }
        }
      }
    }
  }
  return results;
}

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line) {
  const cols = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          val += line[i];
          i++;
        }
      }
      cols.push(val);
      if (i < line.length && line[i] === ',') i++; // skip comma
    } else {
      // Unquoted field
      const next = line.indexOf(',', i);
      if (next === -1) {
        cols.push(line.slice(i));
        break;
      } else {
        cols.push(line.slice(i, next));
        i = next + 1;
      }
    }
  }
  return cols;
}

/** POST a batch CSV to the Census geocoder with retries */
async function submitBatch(csv, attempt = 1) {
  const formData = new FormData();
  const blob = new Blob([csv], { type: 'text/csv' });
  formData.append('addressFile', blob, 'addresses.csv');
  formData.append('benchmark', BENCHMARK);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      console.log(`    Retry ${attempt}/${MAX_RETRIES} after error: ${err.message}`);
      await sleep(RETRY_DELAY_MS);
      return submitBatch(csv, attempt + 1);
    }
    throw err;
  }
}

// ── Main ────────────────────────────────────────────────────
const raw = readFileSync(INPUT, 'utf-8');
const records = JSON.parse(raw);

// Collect indices that need geocoding
const pending = [];
for (let i = 0; i < records.length; i++) {
  if (records[i].length < 5) {
    pending.push({ idx: i, address: records[i][0], zip: records[i][2] });
  }
}

const total   = records.length;
const already = total - pending.length;
console.log(`Total records : ${total.toLocaleString()}`);
console.log(`Already done  : ${already.toLocaleString()}`);
console.log(`To geocode    : ${pending.length.toLocaleString()}`);

if (pending.length === 0) {
  console.log('\nNothing to do — all records already have coordinates.');
  process.exit(0);
}

const numBatches = Math.ceil(pending.length / BATCH_SIZE);
console.log(`Batches       : ${numBatches} (${BATCH_SIZE.toLocaleString()} per batch)\n`);

let totalMatched = 0;
let totalNoMatch = 0;

function save() {
  writeFileSync(INPUT, JSON.stringify(records), 'utf-8');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nInterrupted — saving progress...');
  save();
  console.log(`Saved. Matched ${totalMatched} so far (${totalNoMatch} no-match).`);
  process.exit(0);
});

const start = Date.now();

for (let b = 0; b < numBatches; b++) {
  const batchStart = b * BATCH_SIZE;
  const batchEnd   = Math.min(batchStart + BATCH_SIZE, pending.length);
  const batch      = pending.slice(batchStart, batchEnd);

  const batchNum = b + 1;
  console.log(`Batch ${batchNum}/${numBatches}  (rows ${batchStart + 1}–${batchEnd})  submitting...`);

  const csv = buildCSV(batch);

  try {
    const responseText = await submitBatch(csv);
    const results = parseResponse(responseText);

    let matched = 0;
    let noMatch = 0;

    for (const item of batch) {
      const result = results.get(item.idx);
      if (result) {
        records[item.idx].push(result.lng, result.lat);
        matched++;
      } else {
        noMatch++;
      }
    }

    totalMatched += matched;
    totalNoMatch += noMatch;

    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`  ✓ ${matched} matched, ${noMatch} no-match  (${elapsed}s elapsed)`);

    // Save after each batch
    save();
    console.log(`  Saved.`);

    // Small delay between batches to be polite
    if (b < numBatches - 1) {
      await sleep(2000);
    }
  } catch (err) {
    console.error(`  ✗ Batch ${batchNum} failed: ${err.message}`);
    console.log('  Saving progress and stopping...');
    save();
    process.exit(1);
  }
}

const elapsedMin = ((Date.now() - start) / 60_000).toFixed(1);
console.log(`\nDone in ${elapsedMin} minutes.`);
console.log(`Matched  : ${totalMatched.toLocaleString()}`);
console.log(`No match : ${totalNoMatch.toLocaleString()}`);
