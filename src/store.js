import { ERAS, eraFor } from './data/sample-data.js'
import { init as initMprop, geocodedVisible, onChange as onMpropChange } from './services/mprop-data.js'

export { ERAS, eraFor }

class AppStore {
  #state = {
    year: 1870,
    playing: false,
    theme: 'cream',
    selectedProperty: null,
    dataReady: false,
  }
  #listeners = new Set()
  #playTimer = null

  constructor() {
    // Kick off MPROP load; re-notify subscribers whenever more coords arrive.
    initMprop().then(() => this.#set({ dataReady: true }))
    onMpropChange(() => this.#notify())
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
    return geocodedVisible(y => y <= year)
  }

  newThisYear(year = this.#state.year) {
    return new Set(geocodedVisible(y => y === year).map(h => h.id))
  }
}

export const store = new AppStore()
