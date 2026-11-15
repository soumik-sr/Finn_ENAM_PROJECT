# Run and demonstrate FINN

## Local app

From source/ with Python 3.10 or newer:

```sh
python -m pip install -r requirements.txt
python backend.py --port 8000
```

Open http://127.0.0.1:8000. Keep this development server bound to loopback. The included stored briefing loads immediately; unfamiliar-company research requires internet access and approved sources.

## Hosted Worker build and checks

Use Node 22 or newer and pnpm 11.25.0 (the build was validated on Node 24.22.1). In source/:

```sh
pnpm install --frozen-lockfile
node build-worker.mjs
node final-backend-check.mjs
node check-coverage.mjs
node security-check.mjs
python check-python-backend.py
```

Optional read-only internet checks:

```sh
node audit-dependencies.mjs
node final-backend-check.mjs --live
node security-check.mjs --live
```

The --live flags target the current FINN public demo. They do not deploy changes. The Worker build emits dist/server/index.js for a compatible Cloudflare Worker host; .openai/hosting.json identifies the existing Sites deployment. It does not grant deployment permission. Configure a separate project if rehosting elsewhere.

## Short reviewer walkthrough

1. Open the public Briefing. The historical date badge is intentional.
2. Inspect Infosys quarterly figures and guidance evidence.
3. In Research, open PERSISTENT and ask about revenue; open a cited page.
4. Ask for an FY29 dividend payout target to test missing evidence.
5. Explore the added company profiles and dated IPO pipeline.
6. Change Portfolio thresholds and reload to check local preference persistence.

Live data freshness, coverage limitations and security constraints are documented in the report and source/SECURITY-REVIEW.md.
