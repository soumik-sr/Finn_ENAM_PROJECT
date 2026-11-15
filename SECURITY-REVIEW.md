# FINN security review — 15 November 2026

Scope: source review, local adversarial regression tests, dependency advisory queries, secret-pattern scan, and non-destructive checks of the public demo. No traffic flood, third-party attack, or exploit PDF was used. This is a focused application review, not a penetration-test certification.

| Attack route | Finding and remediation |
| --- | --- |
| Public research API resource abuse | Previously unthrottled. Added 60 requests/client/minute and 180/isolate/minute, two simultaneous cold document jobs, duplicate-job sharing, short negative caching, bounded maps, byte-limited streamed request bodies and read deadlines. |
| Server-side request forgery through discovered PDF links | Previously any HTTPS `.com`, `.in`, `.org`, `.net` host was accepted; Python accepted any HTTPS link and followed redirects. Now only explicit source hosts are fetched, credentials/custom ports are rejected, and redirects must stay on the same approved host. This intentionally reduces arbitrary-issuer discovery until hosts are reviewed. |
| Malicious PDF resource use or scripts | Kept PDF size/page limits and disabled evaluation; added a PDF signature check and explicit scripting disablement. PDF text extraction does not render a document viewer. |
| Cross-site API abuse / local DNS rebinding | JSON content type and same-origin checks enforced. Local Python additionally validates Host and Origin and binds only to loopback. Non-browser scripts can still call the deliberately public hosted API. |
| Browser injection and framing | Existing text/attribute escaping and URL scheme checks passed hostile-input tests. Added CSP, object blocking, base/form restrictions, nosniff, no-referrer, permissions policy and hosted HSTS. Only self/ChatGPT origins may frame the hosted page. |
| Accidental file exposure | Hosted build now packages an explicit public-asset allowlist. Python GET/HEAD reject nonpublic paths. Probed environment, Git, server bundle, source and hosting-config paths. Public company JSON is intentionally public. |
| Dependency supply chain | OSV found advisories for `tar@6.2.1` through optional `unpdf → canvas` build dependencies. Removed the unused canvas tree with a tracked pnpm override. Rechecked the complete reduced lockfile, bundled PDF.js and pinned pypdf: 30 package/version queries, zero returned advisories at review time. |
| Secret leakage | Pattern scan of project files excluding dependencies, Git internals and generated server bundle returned no credential matches. Request errors do not expose stack traces. This is not a full Git-history secret audit. |
| Prompt injection / misleading evidence | Hosted answers use retrieval, not a model with tools or credentials. Evidence is escaped and new summaries are labelled as paraphrases. Local optional model synthesis is not enabled or security-certified by these tests; citations alone cannot prove claim correctness. |

## Remaining exposure

- In-memory throttles and concurrency limits apply per Worker isolate, reset on restart, and are not a distributed DDoS/cost control. Add provider-edge rate limiting, a durable global budget and monitoring before a broad public launch. No flood test was performed.
- Trusted source hosts and their DNS/content remain a trust boundary. Arbitrary caller-controlled hosts are rejected; this is not connection-pinned DNS validation. A compromised allowlisted host or malicious PDF can still exercise parser bugs or resource exhaustion. Platform isolation and CPU limits remain necessary; separate parsing jobs are preferable at scale.
- The Python service is a loopback development server. Do not expose it directly to the internet; use a production server/proxy with connection, request-rate and worker limits.
- There is no account system or server-side private portfolio storage. Browser watchlists are local. Public/demo access is intentional; no authenticated authorization boundary was tested.
- This review does not audit hosting-provider internals, full Git history, optional external model configuration, or all possible financial-data manipulation.

## Repeat checks

`node build-worker.mjs`, `node security-check.mjs`, `node final-backend-check.mjs`, `python check-python-backend.py`, `node audit-dependencies.mjs`.

After deployment: `node security-check.mjs --live` and `node final-backend-check.mjs --live`. The live security suite sends only a small set of invalid requests; throttling and concurrency are tested locally.

References: [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [PDF.js evaluation advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq), [PDF.js scripting advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j), [OSV API](https://google.github.io/osv.dev/api/).
