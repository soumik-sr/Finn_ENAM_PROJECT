"""Rebuild FINN's earnings-window snapshot from NSE's EQ-series daily archive."""
import csv
import io
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

TICKERS = set("INFY TCS HCLTECH WIPRO RELIANCE HDFCBANK ICICIBANK LT TITAN TRENT BEL POLYCAB ITC SUNPHARMA MARUTI NTPC".split())

def session(day):
    url = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{day:%d%m%Y}.csv"
    try:
        with urlopen(url, timeout=25) as response:
            content = response.read().decode("utf-8-sig")
    except HTTPError as exc:
        if exc.code == 404:
            return []
        raise
    result = []
    for record in csv.DictReader(io.StringIO(content), skipinitialspace=True):
        row = {key.strip(): value.strip() for key, value in record.items()}
        if row["SYMBOL"] in TICKERS and row["SERIES"] == "EQ":
            result.append((day, row, url))
    return result

def main():
    start = date(2025, 2, 24)
    days = [start + timedelta(days=i) for i in range((date(2025,4,22)-start).days+1)]
    history = defaultdict(list)
    data = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for rows in pool.map(session, [d for d in days if d.weekday()<5]):
            for day, row, url in rows:
                ticker = row["SYMBOL"]
                volume = int(row["TTL_TRD_QNTY"])
                prior = history[ticker][-20:]
                close = float(row["CLOSE_PRICE"])
                if day >= date(2025,4,10) and len(prior) == 20:
                    data.append(dict(ticker=ticker, date=day.isoformat(), close=close,
                        change=round(100*(close/float(row["PREV_CLOSE"])-1),2),
                        volumeMultiple=round(volume/(sum(prior)/20),2), source=url))
                history[ticker].append(volume)
    if {r['ticker'] for r in data} != TICKERS:
        raise RuntimeError("Incomplete coverage. Retaining previous snapshot.")
    dest = Path(__file__).parent / "dist" / "market.json"
    dest.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(len(data), "observations across", len(TICKERS), "companies")

if __name__ == "__main__":
    main()
