"""Build compact, page-cited research evidence for the four featured companies."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend import discover, pdf_pages


ROOT = Path(__file__).parent
SYMBOLS = ("INFY", "TCS", "HCLTECH", "WIPRO")
TOPICS = (
    r"\b(guidance|outlook|we expect|we anticipate)\b",
    r"\b(revenue|revenues|sales)\b",
    r"\b(operating margin|EBIT margin|profitability)\b",
    r"\b(cash flow|cash conversion)\b",
    r"\b(capital expenditure|capex)\b",
    r"\b(risk|risks)\b",
    r"\b(order book|deal wins|bookings)\b",
    r"\b(segments|verticals|industries)\b",
)


def index_document(doc):
    pages = pdf_pages(doc)
    selected = []
    seen = set()
    for expression in TOPICS:
        matches = []
        for number, page in enumerate(pages, 1):
            for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", page):
                if not (50 <= len(sentence) <= 420):
                    continue
                if not re.search(expression, sentence, re.I) or sentence in seen:
                    continue
                if any(term in sentence.lower() for term in ("forward-looking statement", "actual results may differ", "safe harbor")):
                    continue
                # Prefer text containing a measured outcome or forecast.
                score = (bool(re.search(r"\d[.,\d]*(?:\s?%|\s+(?:billion|million|crore))", sentence)), -len(sentence))
                matches.append((score, number, sentence))
        for _, number, sentence in sorted(matches, key=lambda item:item[0], reverse=True)[:2]:
            if sentence in seen:
                continue
            seen.add(sentence)
            selected.append(dict(**doc, page=number, text=sentence))
    return selected


def index_company(symbol):
    documents = discover(symbol)
    entries = []
    for kind, maximum in (("earnings transcript", 2), ("annual report", 1)):
        documents_of_kind = [d for d in documents if d["kind"] == kind]
        successes = 0
        for doc in documents_of_kind[:maximum + 2]:
            try:
                passages = index_document(doc)
            except Exception as error:
                print(symbol, kind, "unavailable:", type(error).__name__, flush=True)
                continue
            if passages:
                entries.extend(passages)
                successes += 1
            if successes == maximum:
                break
    if not entries:
        raise RuntimeError(f"No indexable evidence for {symbol}")
    print(symbol, len(entries), "passages", flush=True)
    return symbol, entries


def main():
    with ThreadPoolExecutor(max_workers=4) as pool:
        companies = dict(pool.map(index_company, SYMBOLS))
    final = ROOT / "dist" / "research-cache.json"
    temp = final.with_suffix(".tmp")
    temp.write_text(json.dumps(dict(version=1, companies=companies), ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    temp.replace(final)


if __name__ == "__main__":
    main()
