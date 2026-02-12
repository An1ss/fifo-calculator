# FIFO Liquidation Calculator — Specification

## Purpose
A browser-based (100% client-side) tool to calculate FIFO (First-In, First-Out) lot liquidation from Murex bond transaction exports. No data leaves the browser — critical for work data privacy.

## Input
Excel files (.xlsx/.xls/.csv) exported from Murex with columns like:

| Column | Description | Example |
|--------|-------------|---------|
| PCK.NB | Package reference (unique per row) | 267551806 |
| CNT.NB | Contract reference (unique per row) | 267551807 |
| TRN.NB | Transaction reference (unique per row) | 295027674 |
| I/E | Internal/External flag | E |
| B.PORTFOLIO | Buyer portfolio | GCTOFFSHOREBON or 1360 |
| COUNTERPART | Counterparty | RMB LONDON |
| S.PORTFOLIO | Seller portfolio | 1360 or GCTOFFSHOREBON |
| OPT_FLWFST | Date (text format) | 24 May 2021 |
| Value date | Date (Excel serial number) | 44340 |
| NOMINAL | Bond face value (constant) | 100000000 |
| B/S | Buy or Sell direction | Buy / Sell |
| NOMINAL 0 | **Transaction quantity** (this is the FIFO amount) | 1000000 |
| TRN.STATUS | Transaction status | LIVE |

### Key Data Observations (from sample)
- 368 rows, 158 buys / 210 sells
- Single instrument (NOMINAL always 100,000,000)
- Net position = 0 (buys total = sells total = 43,497,000)
- Date range: 2021-05-24 to 2024-05-17
- All TRN.NB and PCK.NB are unique
- Buy → B.PORTFOLIO = GCTOFFSHOREBON, Sell → B.PORTFOLIO = 1360
- All statuses are LIVE, single counterparty

## FIFO Logic

### Rules
1. **Buys create lots**: Each buy transaction creates a new lot with quantity = NOMINAL 0
2. **Sells consume from oldest first**: Sells reduce remaining quantity from the oldest open lot. If a sell exceeds the oldest lot's remaining quantity, overflow spills to the next oldest lot.
3. **Date ordering**: Transactions are sorted by Value date ascending, then by row order for same-date transactions
4. **Lot status**: A lot is "open" if remaining > 0, "closed" if remaining = 0
5. **Oversell warning**: If sells exceed total available buys, log a warning (should not happen with clean data)

### Data Flow
1. User uploads Excel file
2. SheetJS parses it client-side
3. User maps columns (auto-detected with smart heuristics)
4. User configures Buy/Sell keywords (default: "Buy" / "Sell")
5. Engine processes: sort by date → buys create lots → sells consume FIFO
6. Results displayed as expandable lot cards
7. Export to CSV available

## UI Design

### Three-Step Flow
1. **Upload**: Drag-and-drop zone or file picker
2. **Column Mapping**: Dropdown selectors for each field + data preview table + buy/sell keyword inputs
3. **Results**: Summary cards (total/open/closed lots + quantities) → filter bar (all/open/closed) → expandable lot cards → export + reset buttons

### Lot Card
- Header: Lot number, status badge (OPEN green / CLOSED grey), remaining/original quantity, date, reference badges (TRN, CNC, PCK)
- Expandable details: Table of all contributing transactions (buy + sells that consumed from this lot)

### Theme
Dark theme, modern UI, indigo accent color.

## Technical Stack
- Pure HTML/CSS/JS (no framework)
- SheetJS (xlsx) from CDN for Excel parsing
- Docker-ready (nginx:alpine) for eventual VPS deployment

## Date Handling
- Excel serial numbers (like 44340) must be converted: epoch = 1899-12-30 + days
- Text dates ("24 May 2021") parsed via Date constructor
- JS Date objects parsed directly (SheetJS cellDates mode)

## Column Auto-Detection Priority
Uses ordered pattern matching (most specific first):
- date: `Value date` > `date` > `OPT_FLWFST`
- direction: `B/S` > `direction`/`side`
- nominal: `NOMINAL 0` > `qty`/`quantity` > `NOMINAL`
- trn: `TRN.NB` > `TRN`
- cnc: `CNT.NB` > `CNC`
- pck: `PCK.NB` > `PCK`

## Future Considerations (not in v1)
- Multi-instrument support (group FIFO by instrument identifier)
- Filter by TRN.STATUS (exclude cancelled/amended)
- Price/PNL calculations
