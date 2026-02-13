# FIFO Liquidation Calculator

Browser-based FIFO lot calculator for Murex-style bond transaction exports.
Everything runs client-side in the browser (no backend processing).

## What this app does

- Upload `.xlsx`, `.xls`, or `.csv` transaction files
- Auto-map key columns (Date, Direction, Quantity, TRN/CNC/PCK refs)
- Process transactions using FIFO logic
- Support both long and short inventory flows:
  - sells close open long lots first
  - oversell opens short lots
  - buys can close short lots FIFO
- Show lot cards with contributor-level breakdown
- Search lots by TRN/CNC/PCK (contains match)
- Export results to CSV and Excel (`.xlsx`)

## Current processing rules

### Sorting

Transactions are sorted by:

1. Value date (ascending)
2. Contract number (CNC, ascending)
3. Original row order

The UI also shows this sorting note on the results page.

### FIFO behavior

- **Buy** transaction:
  - closes oldest open short lots first
  - remaining quantity opens a new long lot
- **Sell** transaction:
  - closes oldest open long lots first
  - remaining quantity opens a new short lot

## Results and exports

### On-screen results

- Summary cards include:
  - Total Lots
  - Open Lots
  - Closed Lots
  - Open Long Position
  - Open Short Position
  - Net Position
  - Total Buy Lots
  - Total Short Lots
- Each lot is expandable to show contributor transactions
- Contributor table includes dynamic **Remaining** after each contributor row

### CSV export

Single flat export with lot + contributor columns per row, including:

- lot metadata
- contributor metadata
- `Remaining After Txn`

### Excel export

Two-sheet export:

1. `Lots_Summary` (one row per lot)
2. `Lot_Transactions` (one row per contributor, lot columns repeated)

`Lot_Transactions` includes `Remaining After Txn` so contribution flow is traceable row-by-row.

`Source Row` means the original row number from the uploaded file.

## Search

Results page includes a search box:

- Matches by **contains text** (case-insensitive)
- Searches across contributor `TRN`, `CNC`, and `PCK`
- Works together with status filter (`all/open/closed`)

## Theme

- Supports **dark** and **light** themes
- Theme toggle button in header
- Preference is saved in `localStorage` (`fifo-theme`)

## Run locally

From project folder:

```bash
python3 -m http.server 8010 --bind 0.0.0.0
```

Open:

- local machine: `http://localhost:8010`
- over LAN/Tailscale: `http://<host-or-tailnet-name>:8010`

## Docker deployment

This repo includes:

- `Dockerfile`
- `docker-compose.yml`
- `nginx.conf`

Current compose host mapping:

- host `18080` -> container `8080`

Build and run:

```bash
docker build -t fifo-calculator:latest .
docker run -d --name fifo-calculator --restart unless-stopped -p 18080:8080 fifo-calculator:latest
```

Or use your Portainer stack from Git with `docker-compose.yml`.

## Reverse proxy notes (path-based hosting)

Container nginx is configured to support both:

- `/`
- `/fifo-calculator/`

If hosting under a tools domain path, use trailing slash URL:

- `https://tools.yourdomain.com/fifo-calculator/`

If you hit unstyled pages, usually it is either:

- stale cache (hard refresh), or
- path rewrite/proxy mismatch

## Troubleshooting quick checks

- Check app is serving:
  - `curl -I http://127.0.0.1:18080/`
- Check subpath assets:
  - `curl -I http://127.0.0.1:18080/fifo-calculator/style.css`
- If browser still shows old JS/CSS, hard refresh (`Ctrl+F5`)

## Project files

- `index.html` - UI structure
- `style.css` - styles + light/dark themes
- `app.js` - parsing, FIFO engine, filters, search, export
- `nginx.conf` - static serving + subpath support
- `Dockerfile` - container image
- `docker-compose.yml` - deployment stack
- `DEPLOY.md` - deployment notes

---

Built with care. If Future You reads this tomorrow: you shipped a lot today, and it works.

Good night, and well done.
