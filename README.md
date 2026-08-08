# Split Simple

“Take a photo. Check the items. Split the bill. Done.”

Split Simple is a static, mobile-first restaurant bill splitter. It has no accounts, backend, database, analytics, ads, or paid APIs. Receipt images and bill data are processed and stored in the browser.

## Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>. A web server is required for the service worker and module. Run automated model tests with `node tests.mjs`.

## Features

- Camera capture/image upload; preview, replace, and remove
- Local Tesseract.js OCR with progress, errors, and human review
- Editable/expandable/no-charge items and receipt reconciliation
- Unlimited participants and fast equal sharing per item
- Live allocation and proportional preset/custom tips
- Current draft and saved-bill history in `localStorage`
- Native/text/WhatsApp sharing, JSON import/export, and standalone interactive HTML export
- Installable manifest, app-shell service worker, and responsive touch UI

## Architecture and data model

There is no build step. `index.html` loads `styles.css` and `app.js`; `sw.js` caches first-party app-shell files. Bill records contain IDs, merchant/date/currency/receipt total, structured items, participants, item allocation membership, tip, and timestamps. Equal allocation shares and totals are derived rather than duplicated. Storage keys are versioned.

OCR is loaded only when requested from the free Tesseract.js browser distribution. Recognition runs in the browser, not on an OCR server. Output is always presented as editable suggestions.

For development-only OCR inspection, add `?ocrDebug=1` to the app URL. After processing a receipt, `window.__splitSimpleOcr` and the browser console contain dimensions, raw text, TSV, reconstructed lines, per-pass parsed rows, and the reconciled result. The normal interface is unchanged.

## Privacy

Receipt pixels and participant labels are never submitted by application code. There are no cookies, trackers, analytics, ads, accounts, or telemetry. Data remains in browser storage until deleted. First OCR use downloads Tesseract runtime/language assets from jsDelivr; the receipt itself is not sent there.

## GitHub Pages

The repository root is deployable. In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, select the branch and `/ (root)`, then save. No secrets, environment variables, server, or build command are needed. All app paths are relative.

## OCR limitations

Accuracy depends on focus, lighting, contrast, typeface, damage, and layout. The parser recognizes common lines ending in a two-decimal price and common total labels; unusual columns, discounts, handwriting, and complex quantity notation can be missed. Users must verify all fields. OCR requires network access on first use to download the engine and English model; recognition remains local.
