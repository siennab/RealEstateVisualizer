// IndexedDB-backed cache for geocoded addresses.
// Key = address string (e.g. "100 E WISCONSIN AV")
// Value = [lng, lat]
// Also exports/imports JSON for merging results back into the base data file.

const DB_NAME = 'mke-geocode'
const STORE = 'addresses'
const VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE))
}

export const geocodeCache = {
  async get(address) {
    const store = await tx('readonly')
    return new Promise((resolve, reject) => {
      const r = store.get(address)
      r.onsuccess = () => resolve(r.result ?? null)
      r.onerror = () => reject(r.error)
    })
  },

  async set(address, coord) {
    const store = await tx('readwrite')
    return new Promise((resolve, reject) => {
      const r = store.put(coord, address)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  },

  async getMany(addresses) {
    const store = await tx('readonly')
    const out = new Map()
    await Promise.all(addresses.map(addr => new Promise((resolve) => {
      const r = store.get(addr)
      r.onsuccess = () => { if (r.result) out.set(addr, r.result); resolve() }
      r.onerror = () => resolve()
    })))
    return out
  },

  async all() {
    const store = await tx('readonly')
    return new Promise((resolve, reject) => {
      const out = {}
      const r = store.openCursor()
      r.onsuccess = () => {
        const c = r.result
        if (!c) return resolve(out)
        out[c.key] = c.value
        c.continue()
      }
      r.onerror = () => reject(r.error)
    })
  },

  async size() {
    const store = await tx('readonly')
    return new Promise((resolve, reject) => {
      const r = store.count()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  },

  async importJSON(obj) {
    const store = await tx('readwrite')
    await Promise.all(Object.entries(obj).map(([k, v]) => new Promise((resolve) => {
      const r = store.put(v, k)
      r.onsuccess = () => resolve()
      r.onerror = () => resolve()
    })))
  },

  async exportJSON() {
    return this.all()
  },

  async downloadJSON(filename = 'mke-geocoded.json') {
    const data = await this.exportJSON()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
