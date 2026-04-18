// Milwaukee historical home data
// Centered ~43.0389, -87.9065 (downtown Milwaukee)
// Map shows roughly 1 mile radius: lat ±0.0145, lng ±0.020

export const ERAS = [
  { id: 'early',      label: 'Early Settlement', start: 1800, end: 1869, color: '#C9A66B' },
  { id: 'gilded',     label: 'Gilded Age',        start: 1870, end: 1899, color: '#B8860B' },
  { id: 'victorian',  label: 'Late Victorian',    start: 1880, end: 1910, color: '#8E4A7F' },
  { id: 'craftsman',  label: 'Craftsman Era',     start: 1905, end: 1929, color: '#A65A3A' },
  { id: 'depression', label: 'Interwar',          start: 1930, end: 1945, color: '#5A6B7A' },
  { id: 'midcentury', label: 'Mid-Century',       start: 1946, end: 1969, color: '#E8A87C' },
  { id: 'modernist',  label: 'Modernist',         start: 1970, end: 1989, color: '#6B8E7F' },
  { id: 'revival',    label: 'New Traditional',   start: 1990, end: 2009, color: '#C97B63' },
  { id: 'contemp',    label: 'Contemporary',      start: 2010, end: 2026, color: '#F582AE' },
]

export function eraFor(year) {
  if (year <= 1869) return ERAS[0]
  if (year <= 1879) return ERAS[1]
  if (year <= 1905) return ERAS[2]
  if (year <= 1929) return ERAS[3]
  if (year <= 1945) return ERAS[4]
  if (year <= 1969) return ERAS[5]
  if (year <= 1989) return ERAS[6]
  if (year <= 2009) return ERAS[7]
  return ERAS[8]
}

export const STYLES_BY_ERA = {
  early:      ['Greek Revival Cottage', 'Timber Frame', 'Federal'],
  gilded:     ['Italianate', 'Second Empire', 'Queen Anne'],
  victorian:  ['Queen Anne', 'Cream City Brick', 'Polish Flat', 'Gothic Revival'],
  craftsman:  ['Craftsman Bungalow', 'American Foursquare', 'Prairie School', 'Tudor Revival'],
  depression: ['Minimal Traditional', 'Cape Cod', 'Art Deco Duplex'],
  midcentury: ['Ranch', 'Split-Level', 'Mid-Century Modern', 'Raised Ranch'],
  modernist:  ['Contemporary Ranch', 'Colonial Revival', 'Tri-Level'],
  revival:    ['Neo-Traditional', 'McMansion', 'New Urbanist Townhome'],
  contemp:    ['Modern Farmhouse', 'Infill Modern', 'Passive House', 'Loft Conversion'],
}

export const STREETS = [
  'N Prospect Ave', 'E Wells St', 'N Water St', 'E Juneau Ave', 'N Jackson St',
  'E Knapp St', 'N Marshall St', 'N Astor St', 'E Kilbourn Ave', 'N Milwaukee St',
  'E State St', 'N Broadway', 'W Highland Ave', 'N 8th St', 'W Kilbourn Ave',
  'N 10th St', 'W State St', 'N Van Buren St', 'E Ogden Ave', 'E Brady St',
  'N Franklin Pl', 'N Cass St', 'E Pleasant St', 'N Humboldt Ave', 'E Lyon St',
]

// Deterministic pseudo-random
export function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateHomes() {
  const rand = mulberry32(42)
  const homes = []

  const weight = (y) => {
    if (y < 1870) return 0.4
    if (y < 1900) return 2.0   // gilded age boom
    if (y < 1920) return 2.6   // immigration boom
    if (y < 1930) return 1.8
    if (y < 1945) return 0.3   // depression / war
    if (y < 1970) return 1.4   // postwar
    if (y < 1990) return 0.5   // suburban flight
    if (y < 2010) return 0.7   // revival
    return 1.2                  // contemporary infill
  }

  let id = 0
  for (let year = 1800; year <= 2026; year++) {
    const w = weight(year)
    const count = Math.max(0, Math.round(w * (1.2 + rand() * 0.6)))
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 0.95
      let dx = Math.cos(angle) * r
      let dy = Math.sin(angle) * r
      // push away from lake (east)
      if (dx > 0.7) dx = 0.7 - (dx - 0.7)

      const lat = 43.0430 + dy * 0.0140
      const lng = -87.9100 + dx * 0.0190

      const era = eraFor(year)
      const styles = STYLES_BY_ERA[era.id]
      const style = styles[Math.floor(rand() * styles.length)]
      const streetNum = 100 + Math.floor(rand() * 2900)
      const street = STREETS[Math.floor(rand() * STREETS.length)]
      const beds = 2 + Math.floor(rand() * 4)
      const sqft = 900 + Math.floor(rand() * 2800)

      homes.push({
        id: id++,
        year,
        lat,
        lng,
        // normalized 0-1 position for SVG map
        x: (lng + 87.9280) / 0.0360,  // 0 = west edge, 1 = east edge
        y: (43.0570 - lat) / 0.0280,   // 0 = north edge, 1 = south edge
        era: era.id,
        style,
        address: `${streetNum} ${street}`,
        beds,
        sqft,
      })
    }
  }
  return homes
}

export const HOMES = generateHomes()
