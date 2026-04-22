"""Download City of Madison assessor parcel data and produce madison_min.json.

Output format matches mprop_min.json:
  [address, yearBuilt, zip, lng, lat]

The ArcGIS Feature Service includes point geometry so no separate geocoding
step is needed.

Usage:
    python reduce_madison.py
"""
import gzip
import json
import os
import re
import urllib.request
import urllib.parse

OUT = "public/madison_min.json"

# City of Madison ArcGIS REST endpoint – Tax Parcels (Assessor Property Info)
BASE_URL = (
    "https://maps.cityofmadison.com/arcgis/rest/services"
    "/Public/OPEN_DATA2/FeatureServer/0/query"
)

# Fields we need — Address, YearBuilt, plus geometry (returned automatically)
OUT_FIELDS = "Address,YearBuilt"

# ArcGIS services cap results per request; we page through using resultOffset.
PAGE_SIZE = 2000


def fetch_page(offset):
    """Fetch one page of features from the ArcGIS REST API."""
    params = urllib.parse.urlencode({
        "where": "YearBuilt IS NOT NULL AND YearBuilt > 1700",
        "outFields": OUT_FIELDS,
        "outSR": "4326",
        "returnGeometry": "true",
        "returnCentroid": "true",
        "resultOffset": offset,
        "resultRecordCount": PAGE_SIZE,
        "f": "json",
    })
    url = f"{BASE_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "reduce_madison/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_zip(address):
    """Try to extract a 5-digit ZIP from the address string, or return None."""
    m = re.search(r"\b(\d{5})\b", address or "")
    return int(m.group(1)) if m else None


def main():
    # Preserve any existing data so we can merge incrementally
    existing_coords = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as f:
                for row in json.load(f):
                    if len(row) >= 5:
                        existing_coords[row[0]] = (row[3], row[4])
        except (OSError, ValueError):
            pass

    best = {}  # address -> (year, zip, lng, lat)
    offset = 0
    total_fetched = 0

    print("Downloading Madison parcel data …")
    while True:
        data = fetch_page(offset)
        features = data.get("features", [])
        if not features:
            break

        for feat in features:
            attr = feat.get("attributes", {})
            centroid = feat.get("centroid", {})

            address = (attr.get("Address") or "").strip()
            year = attr.get("YearBuilt")
            lng = centroid.get("x")
            lat = centroid.get("y")

            if not address or year is None:
                continue
            try:
                year = int(year)
            except (ValueError, TypeError):
                continue
            if not (1700 <= year <= 2030):
                continue
            if lng is None or lat is None:
                continue

            # Round coords to 6 decimal places (~0.1 m precision)
            lng = round(lng, 6)
            lat = round(lat, 6)

            # Madison data doesn't include ZIP in a separate field;
            # we assign the generic Madison ZIP 53703 as default.
            # If the address string happens to contain a ZIP, use it.
            zip_code = parse_zip(address) or 53703

            prev = best.get(address)
            if prev is None or year < prev[0]:
                best[address] = (year, zip_code, lng, lat)

        total_fetched += len(features)
        print(f"  fetched {total_fetched:,} features …")

        # ArcGIS signals "no more pages" via exceededTransferLimit
        if not data.get("exceededTransferLimit", False):
            break
        offset += PAGE_SIZE

    # Build output rows sorted by address
    rows = sorted(best.items())
    output = []
    for addr, (year, zip_code, lng, lat) in rows:
        output.append([addr, year, zip_code, lng, lat])

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    with open(OUT, "rb") as f_in, gzip.open(OUT + ".gz", "wb", compresslevel=9) as f_out:
        f_out.writelines(f_in)

    raw = os.path.getsize(OUT)
    gz = os.path.getsize(OUT + ".gz")
    print(f"\nRecords: {len(output):,}")
    print(f"{OUT}:    {raw/1024/1024:.2f} MB")
    print(f"{OUT}.gz: {gz/1024/1024:.2f} MB (gzipped)")


if __name__ == "__main__":
    main()
