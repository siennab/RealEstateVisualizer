"""Reduce MPROP CSV to minimal JSON: [address, yearBuilt, zip] per record."""
import csv
import gzip
import json
import os

SRC = "mprop.csv"
OUT = "public/mprop_min.json"

def normalize_addr(row):
    nr = row["HOUSE_NR_LO"].strip()
    sfx = row["HOUSE_NR_SFX"].strip()
    sd = row["SDIR"].strip()
    st = row["STREET"].strip()
    tt = row["STTYPE"].strip()
    if not nr or not st:
        return None
    return " ".join(p for p in (nr + sfx, sd, st, tt) if p)


def parse_year(v):
    v = v.strip()
    if not v:
        return None
    try:
        y = int(v)
    except ValueError:
        return None
    return y if 1700 <= y <= 2030 else None


def parse_zip(v):
    v = v.strip()
    if len(v) >= 5 and v[:5].isdigit():
        return int(v[:5])
    return None


def main():
    # Preserve any coords already baked into the output file so re-running
    # against a fresh MPROP dump doesn't throw away existing geocoding.
    existing_coords = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as f:
                for row in json.load(f):
                    if len(row) >= 5:
                        existing_coords[row[0]] = (row[3], row[4])
        except (OSError, ValueError):
            pass

    best = {}
    with open(SRC, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            y = parse_year(row["YR_BUILT"])
            if y is None:
                continue
            a = normalize_addr(row)
            if a is None:
                continue
            z = parse_zip(row.get("GEO_ZIP_CODE", ""))
            if z is None:
                continue
            prev = best.get(a)
            if prev is None or y < prev[0]:
                best[a] = (y, z)

    rows = sorted(best.items())
    data = []
    for a, (y, z) in rows:
        coord = existing_coords.get(a)
        if coord:
            data.append([a, y, z, coord[0], coord[1]])
        else:
            data.append([a, y, z])

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)

    with open(OUT, "rb") as f_in, gzip.open(OUT + ".gz", "wb", compresslevel=9) as f_out:
        f_out.writelines(f_in)

    raw = os.path.getsize(OUT)
    gz = os.path.getsize(OUT + ".gz")
    print(f"Records: {len(data):,}")
    print(f"{OUT}:    {raw/1024/1024:.2f} MB")
    print(f"{OUT}.gz: {gz/1024/1024:.2f} MB (gzipped)")


if __name__ == "__main__":
    main()
