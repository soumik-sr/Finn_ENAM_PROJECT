# FINN

FINN combines an Indian-equity portfolio briefing with research from primary company documents. The historical demo opens on 10–22 April 2025. Choose Last 24h or Last 7 days to see disclosures in a rolling window.

## Run locally

Use Python 3.10 or newer. From this directory run:

```sh
python -m pip install pypdf
python backend.py --port 8000
```

Open http://127.0.0.1:8000. The Python service serves both the mobile interface and the research API. Hosting only the dist directory provides a static snapshot with curated comparisons. Full on-demand research requires the Python service and network access.

## Try it

1. Open the Infosys result and expand its quarterly figures. Inspect the two linked financial statements.
2. Open Research company and inspect the two FY25 comparisons. The revenue comparison flags the change in acquisition scope.
3. Open PERSISTENT and ask “What was revenue growth?” to retrieve cited passages from outside the demo set. Test “What is the FY29 dividend payout target?” to see how FINN handles missing evidence.
4. Change the price or volume threshold under Portfolio. The briefing applies those settings to stored daily observations. Portfolio preferences persist in this browser.

## Data and operations

Run `python refresh.py` to update prices and recent filings. Supply symbols such as `python refresh.py INFY` to refresh a subset. Each source can fail independently. Failed downloads retain the previous records. Run one refresh at a time.

`python market_snapshot.py` rebuilds the historical daily price dataset from NSE bhavcopy CSVs. Reapply refresh.py after a historical rebuild. Price changes use the prior close. Volume multiples use the preceding twenty sessions. Historical company results and guidance in dist/events.json and dist/results.json were reviewed against the linked issuer documents.

Research discovers annual reports and transcripts by ticker, extracts PDF text with page numbers, and ranks passages by query-term overlap. The SQLite cache stores fetched documents and market responses locally. Set FINN_CACHE to change its directory. Text extraction skips pages with insufficient text. Coverage depends on document availability.

Evidence search runs without a model key. For model-written synthesis, configure FINN_MODEL_URL (a chat completions endpoint), FINN_MODEL_NAME, and FINN_MODEL_KEY in the server environment. The service supplies only retrieved passages, checks returned citation indices, and falls back to excerpts when synthesis is unavailable. Citation indices alone do not establish that a claim follows from the cited text.

## Prototype limits

The five manually reviewed guidance comparisons demonstrate the intended analysis. Automatic four-quarter guidance extraction, OCR, scheduled refresh, and push delivery outside the app are future work. Unreviewed synced filings show exchange metadata. The historical snapshot includes six reviewed disclosures and sixteen companies with market observations.
