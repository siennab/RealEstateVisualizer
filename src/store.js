import { ERAS, eraFor } from './data/sample-data.js'
import { init as initMprop, allRecords } from './services/mprop-data.js'

export { ERAS, eraFor }

class AppStore {
  #state = {
    year: 1870,
    playing: false,
    theme: 'cream',
    isolatedEraId: null,
    selectedProperty: null,
    dataReady: false,
  }
  #listeners = new Set()
  #playTimer = null

  constructor() {
    initMprop().then(() => this.#set({ dataReady: true }))
  }

  get state() { return { ...this.#state } }

  subscribe(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #notify() {
    const s = this.state
    this.#listeners.forEach(l => l(s))
  }

  #set(updates) {
    this.#state = { ...this.#state, ...updates }
    this.#notify()
  }

  setYear(year) { this.#set({ year: Math.max(1850, Math.min(2026, year)) }) }
  setTheme(theme) { this.#set({ theme }) }
  setIsolatedEra(eraId) { this.#set({ isolatedEraId: eraId ?? null, selectedProperty: null }) }
  toggleIsolatedEra(eraId) {
    this.#set({
      isolatedEraId: this.#state.isolatedEraId === eraId ? null : eraId,
      selectedProperty: null,
    })
  }
  clearIsolatedEra() { this.#set({ isolatedEraId: null }) }
  selectProperty(p) { this.#set({ selectedProperty: p }) }
  deselectProperty() { this.#set({ selectedProperty: null }) }

  play() {
    if (this.#state.playing) return
    if (this.#state.year >= 2026) this.setYear(1850)
    this.#set({ playing: true })
    this.#playTimer = setInterval(() => {
      if (this.#state.year >= 2026) { this.pause(); return }
      this.setYear(this.#state.year + 1)
    }, 140)
  }

  pause() {
    clearInterval(this.#playTimer)
    this.#playTimer = null
    this.#set({ playing: false })
  }

  reset() {
    this.pause()
    this.setYear(1850)
  }

  visibleHomes(year = this.#state.year) {
    return allRecords().filter(r => {
      if (r.year > year) return false
      if (!this.#state.isolatedEraId) return true
      return r.era === this.#state.isolatedEraId
    })
  }

  newThisYear(year = this.#state.year) {
    return new Set(allRecords().filter(r => {
      if (r.year !== year) return false
      if (!this.#state.isolatedEraId) return true
      return r.era === this.#state.isolatedEraId
    }).map(h => h.id))
  }
}

export const store = new AppStore()
