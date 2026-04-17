// Abstract data service - swap implementations to connect a real API

import { HOMES } from '../data/sample-data.js'

export class DataService {
  async getProperties(maxYear) { throw new Error('Not implemented') }
  async getPropertyById(id) { throw new Error('Not implemented') }
}

export class LocalDataService extends DataService {
  async getProperties(maxYear = 2026) {
    return HOMES.filter(h => h.year <= maxYear)
  }
  async getPropertyById(id) {
    return HOMES.find(h => h.id === id) ?? null
  }
}

// To connect a real API, implement this class:
export class ApiDataService extends DataService {
  #baseUrl
  constructor(baseUrl) {
    super()
    this.#baseUrl = baseUrl
  }
  async getProperties(maxYear = 2026) {
    // TODO: replace with real API call
    // const res = await fetch(`${this.#baseUrl}/properties?maxYear=${maxYear}`)
    // return res.json()
    throw new Error('ApiDataService not yet configured')
  }
  async getPropertyById(id) {
    // TODO: replace with real API call
    throw new Error('ApiDataService not yet configured')
  }
}

// Active service — swap to ApiDataService when ready
export const dataService = new LocalDataService()
