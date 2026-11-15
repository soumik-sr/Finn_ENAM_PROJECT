"""Append available market closes and filings to the briefing's stored data."""
import argparse
import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from backend import filings, market, ticker
from market_snapshot import TICKERS

DIST = Path(__file__).parent / "dist"

def merge(filename, records, identity):
    path = DIST / filename
    previous = json.loads(path.read_text(encoding="utf8")) if path.exists() else []
    result = {identity(row):row for row in previous + records}
    with tempfile.NamedTemporaryFile(mode="w", dir=DIST, delete=False, encoding="utf8") as file:
        json.dump(list(result.values()), file, indent=2, ensure_ascii=False)
    os.replace(file.name, path)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("symbols", nargs="*", type=ticker)
    args = parser.parse_args()
    prices, announcements = [], []
    for symbol in args.symbols or sorted(TICKERS):
        try:
            data = market(symbol)
            latest = data["sessions"][-1]
            prices.append(dict(ticker=symbol, date=latest["date"], close=latest["close"],
                change=round(data["priceChangePct"],2), volumeMultiple=round(data["volumeMultiple"],2)))
        except Exception as error:
            print(symbol, "market unavailable:", error)
        try:
            for record in filings(symbol)["filings"]:
                stamp=datetime.strptime(record["date"],"%d-%b-%Y %H:%M:%S")
                if stamp < datetime.now()-timedelta(days=30):
                    continue
                category=record.get("title") or "Disclosure"
                announcements.append(dict(ticker=symbol,company=symbol,date=stamp.date().isoformat(),
                    timestamp=stamp.isoformat()+"+05:30",category=category,title=category,
                    summary=record.get("description") or "",significance="",source=record.get("url") or "",comparisons=[]))
        except Exception as error:
            print(symbol, "filings unavailable:", error)
    merge("market.json",prices,lambda row:(row["ticker"],row["date"]))
    merge("synced.json",announcements,lambda row:(row["ticker"],row["date"],row["source"],row["title"]))
    print(f"Fetched {len(prices)} market observations and {len(announcements)} announcements.")

if __name__=="__main__":
    main()
