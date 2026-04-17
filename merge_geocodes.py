"""Merge a geocoded cache JSON (address -> [lng, lat]) into public/mprop_min.json.

After merge, rows are either:
  [address, yearBuilt, zip]                  -- not yet geocoded
  [address, yearBuilt, zip, lng, lat]        -- geocoded

Usage:
    python merge_geocodes.py <cache.json>

The cache may be a partial snapshot. Already-merged addresses are overwritten
with the new coords; addresses not in MPROP are ignored.
"""
import gzip
import json
import os
import sys

BASE = "public/mprop_min.json"


def main():
    if len(sys.argv) < 2:
        print("usage: python merge_geocodes.py <cache.json>")
        sys.exit(1)
    cache_path = sys.argv[1]

    with open(BASE, encoding="utf-8") as f:
        rows = json.load(f)
    with open(cache_path, encoding="utf-8") as f:
        cache = json.load(f)

    by_addr = {row[0]: row for row in rows}
    merged = 0
    skipped = 0
    for addr, coord in cache.items():
        row = by_addr.get(addr)
        if row is None:
            skipped += 1
            continue
        lng, lat = coord
        # Normalize to 5-tuple
        if len(row) >= 5:
            row[3] = lng
            row[4] = lat
        else:
            row.append(lng)
            row.append(lat)
        merged += 1

    geocoded_total = sum(1 for r in rows if len(r) >= 5)

    with open(BASE, "w", encoding="utf-8") as f:
        json.dump(rows, f, separators=(",", ":"), ensure_ascii=False)
    with open(BASE, "rb") as f_in, gzip.open(BASE + ".gz", "wb", compresslevel=9) as f_out:
        f_out.writelines(f_in)

    raw = os.path.getsize(BASE)
    gz = os.path.getsize(BASE + ".gz")
    print(f"Merged: {merged:,}  (skipped {skipped} not in MPROP)")
    print(f"Total geocoded in file: {geocoded_total:,} / {len(rows):,}")
    print(f"{BASE}:    {raw/1024/1024:.2f} MB")
    print(f"{BASE}.gz: {gz/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
