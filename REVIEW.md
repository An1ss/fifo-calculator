# FIFO Liquidation Calculator — Code Review

Reviewed files:
- `SPEC.md`
- `app.js`
- `index.html`
- `style.css`

---

## Executive Summary

The core FIFO implementation is **mostly correct** and aligns with the spec for normal data (buys create lots, sells consume oldest lots first, overflow spills across lots). Auto-mapping priorities are largely correct. 

Main risks are around **input robustness** rather than FIFO math:
1. Invalid/missing dates are not explicitly handled and can silently degrade sorting.
2. Buy/Sell keyword matching can misclassify rows if keywords are blank or overlapping.
3. Oversell is only logged to console (not surfaced to user/export).
4. Some edge cases are silently dropped without user feedback.

---

## 1) FIFO Algorithm Correctness

### ✅ What is correct

- **Buys create lots**: implemented in `app.js` lines **179–201**.
  - Each buy becomes a new lot with `openQty` and `remainingQty` initialized to buy quantity.
- **Sells consume FIFO (oldest first)**: implemented in lines **202–227**.
  - Uses `openLots` queue and always consumes from `openLots[0]`.
  - Partial/overflow sells correctly continue to next lot via `while (remaining > 0 && openLots.length > 0)`.
- **Lot closure logic**: lines **222–226**.
  - Lot set to closed when remaining reaches <= 0, then shifted from queue.
- **Stable same-date ordering by row index**: line **172** fallback `(a.idx - b.idx)`.

### ⚠️ Issues / caveats

1. **Invalid date rows are not filtered/reported**
   - Date parse may return `Invalid Date` (line **133**), but transactions are not filtered by valid date (filter at line **169** checks only direction + nominal).
   - Sort comparator at line **172** becomes `NaN` for invalid dates; because `NaN` is falsy, it falls back to row order instead of true chronology.
   - This can silently produce non-chronological FIFO for malformed dates.

2. **Oversell only goes to console**
   - Line **230** logs warning but UI does not show this in summary/cards/export.
   - End users can miss a materially important exception.

### Suggested fixes

- During parse stage, validate date and either:
  - hard-fail with row numbers, or
  - skip + show warning counter in UI.
- Add user-facing oversell section in results (e.g., total unmatched sell qty + row references).

---

## 2) Floating Point Precision (`round()`)

### Current implementation
- `round(n) { return Math.round(n * 1e8) / 1e8; }` at lines **390–392**.
- Used during sell consumption subtraction (lines **209–210**).

### Assessment

- For your observed `NOMINAL 0` values (integers like `100000`, `200000`, etc.), this is **sufficient**.
- JavaScript `Number` safely represents integers up to `2^53-1` (~9e15), far above these quantities.
- With integer buys/sells, arithmetic should stay integer and exact; round() is mostly a guard.

### Minor concern

- `consume` (line **207**) is not rounded before contributor storage, though it derives from rounded/integer terms so usually fine.
- If future datasets include decimals (e.g., fractional units), binary float drift can reappear.

### Suggested fixes (future-proof)

- If quantities are always integer units: enforce integer parsing and avoid floats entirely.
- If decimals may exist: consider fixed-point integer scaling (e.g., multiply to micro-units) consistently for all operations.

---

## 3) Date Parsing (`parseDate()`)

### ✅ What works

- Handles JS `Date` objects (line **116**).
- Handles Excel serial numbers in expected range (lines **121–127**), including `44340 -> 2021-05-24`.
- Handles text date strings via `new Date(s)` (lines **129–131`) for formats like `24 May 2021` and ISO.

### ⚠️ Issues

1. **No strict validation downstream**
   - Invalid parsed dates are retained and can affect ordering (see section 1).

2. **Locale-dependent text parsing risk**
   - `new Date(s)` behavior can vary for ambiguous formats (less so for `24 May 2021`, more for slash formats).

3. **Excel serial heuristic range is hardcoded**
   - Current range `>10000 && <100000` (line **123**) is fine for modern data but arbitrary.

### Suggested fixes

- Add explicit date validity check in transaction parse/filter.
- Prefer explicit parser paths for known formats (ISO, `DD MMM YYYY`, Excel serial).
- Optionally collect/date-parse errors and show them before calculation.

---

## 4) Column Auto-Mapping (`autoMap()`)

### ✅ Correct vs spec

Pattern ordering in `app.js` lines **82–89** is mostly aligned:
- Date: `Value date` before `OPT_FLWFST` ✅
- Nominal: `NOMINAL 0` before `NOMINAL` ✅
- TRN/CNT/PCK `.NB` patterns prioritized ✅

### Notes

- Date ordering includes `^date$` before `OPT_FLWFST` (line **83**). This is usually fine, and `Value date` still wins first.
- Direction pattern `/\bb\/?s\b/i` is good for `B/S` headers.

No major bug found in mapping priority itself.

---

## 5) Edge Cases

### Overselling
- Detected and warned (`console.warn`) at lines **229–231**.
- **Gap**: not visible in UI/export.

### Empty rows
- Dropped in file parse (`row.some(c => c !== '')`) at line **50**.
- Works for truly empty rows.

### Malformed data
- Invalid nominal becomes `0` and row is silently dropped by filter (lines **156**, **169**).
- Invalid direction rows silently dropped (line **169**).
- Invalid dates are not dropped; they remain and can reorder unexpectedly.

### Zero quantities
- Explicitly excluded via `t.nominal > 0` (line **169**).
- Behavior is consistent.

---

## 6) Additional Bugs / Potential Issues

1. **Keyword-empty bug (important)**
   - Direction detection uses `.includes(buyKw)` / `.includes(sellKw)` (lines **152–153**).
   - If user leaves keyword blank, `''.includes('')` semantics mean every row matches; second condition can force all rows to `sell`.
   - **Fix**: require non-empty keywords or normalize with exact matching strategy.

2. **Overlapping keyword ambiguity**
   - Current logic allows both conditions to run; latter assignment wins (`sell` overwrites `buy`).
   - **Fix**: use mutually exclusive matching or explicit precedence + warning.

3. **Duplicate filter listeners on repeated calculations**
   - `setupFilters()` (lines **326–335**) adds click listeners each time `showResults()` runs.
   - If user recalculates without reload, handlers stack.
   - **Fix**: bind once or replace with delegated listener.

4. **Accessibility/UI detail** (non-blocking)
   - Inline `onclick` in HTML string for lot toggle (line **272**) works but is less maintainable/accessibility-friendly than event delegation.

---

## Recommended Priority Fix List

1. **P1**: Validate dates and handle invalid-date rows explicitly before sorting.
2. **P1**: Harden direction keyword logic (non-empty, non-overlap ambiguity handling).
3. **P2**: Surface oversell warnings in UI + export metadata.
4. **P3**: Prevent duplicate filter event handlers on recalculation.
5. **P3**: Optional fixed-point arithmetic strategy if fractional quantities are expected in future datasets.

---

## Final Verdict

- **FIFO core logic**: ✅ Correct for normal, clean data.
- **Precision for current NOMINAL 0 values**: ✅ Sufficient.
- **Date parsing support (serial/text/ISO/Date objects)**: ✅ Present, but ⚠️ invalid-date handling needs improvement.
- **Auto-mapping priorities requested**: ✅ Implemented in correct order for key fields.
- **Production robustness**: ⚠️ Needs better validation/error surfacing around malformed rows, oversell visibility, and keyword matching.
