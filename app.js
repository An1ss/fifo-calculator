/* ── FIFO Liquidation Calculator ─────────────── */
(() => {
  'use strict';

  // ── State ──
  let rawData = [];      // parsed rows from Excel
  let headers = [];      // column headers
  let lots = [];         // computed FIFO lots
  let currentFilter = 'all';
  let currentSearch = '';
  let filtersBound = false;
  let searchBound = false;

  // ── DOM refs ──
  const $ = id => document.getElementById(id);
  const stepUpload   = $('step-upload');
  const stepMapping  = $('step-mapping');
  const stepResults  = $('step-results');
  const fileInput    = $('file-input');
  const dropZone     = $('drop-zone');
  const btnCalc      = $('btn-calculate');
  const btnExport    = $('btn-export');
  const btnExportXlsx = $('btn-export-xlsx');
  const btnReset     = $('btn-reset');
  const searchRef    = $('search-ref');
  const searchCount  = $('search-count');
  const themeToggle  = $('theme-toggle');

  initTheme();

  const selectors = {
    date:      $('col-date'),
    direction: $('col-direction'),
    nominal:   $('col-nominal'),
    trn:       $('col-trn'),
    cnc:       $('col-cnc'),
    pck:       $('col-pck'),
  };

  // ── File Handling ──
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        if (json.length < 2) return alert('File has no data rows.');
        headers = json[0].map(h => String(h).trim());
        rawData = json.slice(1).filter(row => row.some(c => c !== ''));
        showMapping();
      } catch (err) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Column Mapping ──
  function showMapping() {
    stepUpload.classList.add('hidden');
    stepMapping.classList.remove('hidden');

    // Populate selects
    for (const [key, sel] of Object.entries(selectors)) {
      sel.innerHTML = '<option value="">— select —</option>';
      headers.forEach((h, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = h;
        sel.appendChild(opt);
      });
    }

    // Auto-detect columns by name heuristics
    autoMap();
    renderPreview();
  }

  function autoMap() {
    // Ordered from most specific to generic — first match wins per field
    const patternSets = {
      date:      [/\bvalue.?date\b/i, /^date$/i, /\bopt_flwfst\b/i, /date|time|dt/i],
      direction: [/\bb\/?s\b/i, /direction|side|buy.*sell/i],
      nominal:   [/\bnominal\s*0\b/i, /\bqty\b|\bquantity\b/i, /\bnominal\b/i, /amount|notional|volume/i],
      trn:       [/\btrn[\.\s]?nb\b/i, /\btrn\b/i, /transaction/i],
      cnc:       [/\bcnt[\.\s]?nb\b/i, /\bcnc\b/i, /contract/i],
      pck:       [/\bpck[\.\s]?nb\b/i, /\bpck\b/i, /package/i],
    };
    for (const [key, reList] of Object.entries(patternSets)) {
      for (const re of reList) {
        const idx = headers.findIndex(h => re.test(h));
        if (idx >= 0) { selectors[key].value = idx; break; }
      }
    }
  }

  function renderPreview() {
    const maxRows = 10;
    const preview = rawData.slice(0, maxRows);
    let html = '<table><thead><tr>';
    headers.forEach(h => { html += `<th>${esc(h)}</th>`; });
    html += '</tr></thead><tbody>';
    preview.forEach(row => {
      html += '<tr>';
      headers.forEach((_, i) => { html += `<td>${esc(fmt(row[i]))}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    if (rawData.length > maxRows) html += `<p class="hint" style="padding:0.5rem 0.75rem">Showing ${maxRows} of ${rawData.length} rows</p>`;
    $('data-preview').innerHTML = html;
  }

  // ── Date Parsing ──
  function parseDate(val) {
    if (val instanceof Date && !isNaN(val)) return val;
    if (val == null || val === '') return new Date(NaN);

    const s = String(val).trim();

    // Excel serial number (pure number like 44340)
    const num = Number(s);
    if (!isNaN(num) && num > 10000 && num < 100000) {
      // Excel epoch: Jan 0, 1900 (with the Lotus 1-2-3 bug)
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + num * 86400000);
    }

    // Try parsing text dates like "24 May 2021" or "2021-05-24"
    const d = new Date(s);
    if (!isNaN(d)) return d;

    return new Date(NaN);
  }

  // ── FIFO Calculation ──
  btnCalc.addEventListener('click', () => {
    const cols = {};
    for (const [key, sel] of Object.entries(selectors)) {
      const v = sel.value;
      if (v === '') return alert(`Please select a column for "${sel.previousElementSibling.textContent}".`);
      cols[key] = parseInt(v);
    }

    const buyKw  = $('buy-keyword').value.trim().toLowerCase();
    const sellKw = $('sell-keyword').value.trim().toLowerCase();

    // Parse transactions
    const transactions = rawData.map((row, idx) => {
      const dirRaw = String(row[cols.direction]).trim().toLowerCase();
      let dir = null;
      if (dirRaw.includes(buyKw))  dir = 'buy';
      if (dirRaw.includes(sellKw)) dir = 'sell';

      const nomStr = String(row[cols.nominal]).replace(/[^0-9.\-]/g, '');
      const nominal = parseFloat(nomStr);

      const date = parseDate(row[cols.date]);

      return {
        idx: idx + 2, // 1-indexed + header row
        date,
        direction: dir,
        nominal: isNaN(nominal) ? 0 : Math.abs(nominal),
        trn: String(row[cols.trn] ?? '').trim(),
        cnc: String(row[cols.cnc] ?? '').trim(),
        pck: String(row[cols.pck] ?? '').trim(),
      };
    }).filter(t => t.direction && t.nominal > 0);

    // Sort by value date, then contract number, then original row order
    transactions.sort((a, b) => (a.date - b.date) || compareContract(a.cnc, b.cnc) || (a.idx - b.idx));

    // FIFO engine
    lots = [];
    const openBuyLots = [];  // queue of open buy lot indices
    const openSellLots = []; // queue of open sell lot indices

    for (const txn of transactions) {
      if (txn.direction === 'buy') {
        // Buy first closes oldest open short (sell) lots
        let remaining = txn.nominal;
        while (remaining > 0 && openSellLots.length > 0) {
          const lotIdx = openSellLots[0];
          const lot = lots[lotIdx];
          const consume = Math.min(remaining, lot.remainingQty);

          lot.remainingQty = round(lot.remainingQty - consume);
          remaining = round(remaining - consume);

          lot.contributors.push({
            direction: 'buy',
            qty: consume,
            date: txn.date,
            trn: txn.trn,
            cnc: txn.cnc,
            pck: txn.pck,
            rowNum: txn.idx,
          });

          if (lot.remainingQty <= 0) {
            lot.remainingQty = 0;
            lot.status = 'closed';
            openSellLots.shift();
          }
        }

        // Remaining buy opens a new long lot
        if (remaining > 0) {
          const lot = {
            id: lots.length + 1,
            side: 'buy',
            openQty: remaining,
            remainingQty: remaining,
            date: txn.date,
            trn: txn.trn,
            cnc: txn.cnc,
            pck: txn.pck,
            status: 'open',
            contributors: [{
              direction: 'buy',
              qty: remaining,
              date: txn.date,
              trn: txn.trn,
              cnc: txn.cnc,
              pck: txn.pck,
              rowNum: txn.idx,
            }],
          };
          lots.push(lot);
          openBuyLots.push(lots.length - 1);
        }
      } else {
        // Sell first closes oldest open long (buy) lots
        let remaining = txn.nominal;
        while (remaining > 0 && openBuyLots.length > 0) {
          const lotIdx = openBuyLots[0];
          const lot = lots[lotIdx];
          const consume = Math.min(remaining, lot.remainingQty);

          lot.remainingQty = round(lot.remainingQty - consume);
          remaining = round(remaining - consume);

          lot.contributors.push({
            direction: 'sell',
            qty: consume,
            date: txn.date,
            trn: txn.trn,
            cnc: txn.cnc,
            pck: txn.pck,
            rowNum: txn.idx,
          });

          if (lot.remainingQty <= 0) {
            lot.remainingQty = 0;
            lot.status = 'closed';
            openBuyLots.shift();
          }
        }

        // Remaining sell opens a new short lot
        if (remaining > 0) {
          const lot = {
            id: lots.length + 1,
            side: 'sell',
            openQty: remaining,
            remainingQty: remaining,
            date: txn.date,
            trn: txn.trn,
            cnc: txn.cnc,
            pck: txn.pck,
            status: 'open',
            contributors: [{
              direction: 'sell',
              qty: remaining,
              date: txn.date,
              trn: txn.trn,
              cnc: txn.cnc,
              pck: txn.pck,
              rowNum: txn.idx,
            }],
          };
          lots.push(lot);
          openSellLots.push(lots.length - 1);
        }
      }
    }

    showResults();
  });

  // ── Results Rendering ──
  function showResults() {
    stepMapping.classList.add('hidden');
    stepResults.classList.remove('hidden');

    const openCount = lots.filter(l => l.status === 'open').length;
    const closedCount = lots.filter(l => l.status === 'closed').length;
    const openLongQty = lots.filter(l => l.status === 'open' && l.side === 'buy').reduce((s, l) => s + l.remainingQty, 0);
    const openShortQty = lots.filter(l => l.status === 'open' && l.side === 'sell').reduce((s, l) => s + l.remainingQty, 0);
    const netOpenQty = round(openLongQty - openShortQty);
    const totalBoughtQty = lots.filter(l => l.side === 'buy').reduce((s, l) => s + l.openQty, 0);
    const totalSoldQty = lots.filter(l => l.side === 'sell').reduce((s, l) => s + l.openQty, 0);

    $('results-summary').innerHTML = `
      <div class="summary-card total"><div class="value">${lots.length}</div><div class="label">Total Lots</div></div>
      <div class="summary-card open"><div class="value">${openCount}</div><div class="label">Open Lots</div></div>
      <div class="summary-card closed"><div class="value">${closedCount}</div><div class="label">Closed Lots</div></div>
      <div class="summary-card open"><div class="value">${fmtNum(openLongQty)}</div><div class="label">Open Long Position</div></div>
      <div class="summary-card closed"><div class="value">${fmtNum(openShortQty)}</div><div class="label">Open Short Position</div></div>
      <div class="summary-card total"><div class="value">${fmtNum(netOpenQty)}</div><div class="label">Net Position</div></div>
      <div class="summary-card total"><div class="value">${fmtNum(totalBoughtQty)}</div><div class="label">Total Buy Lots</div></div>
      <div class="summary-card closed"><div class="value">${fmtNum(totalSoldQty)}</div><div class="label">Total Short Lots</div></div>
    `;

    renderLots();
    setupFilters();
    setupSearch();
  }

  function renderLots() {
    const container = $('lots-container');
    const filtered = getFilteredLots();

    if (searchCount) {
      searchCount.textContent = `${filtered.length} lot${filtered.length === 1 ? '' : 's'} found`;
    }

    if (filtered.length === 0) {
      container.innerHTML = '<p class="hint" style="text-align:center;padding:2rem">No lots match this filter.</p>';
      return;
    }

    container.innerHTML = filtered.map(lot => `
      <div class="lot-card" data-lot-id="${lot.id}">
        <div class="lot-header" onclick="window.__toggleLot(${lot.id})">
          <div class="lot-info">
            <span class="lot-number">Lot #${lot.id}</span>
            <span class="ref-badge lot-side ${lot.side === 'sell' ? 'short' : 'long'}">${lot.side === 'sell' ? 'SHORT LOT' : 'LONG LOT'}</span>
            <span class="lot-status ${lot.status}">${lot.status.toUpperCase()}</span>
            <span class="lot-qty">
              <span class="remaining">${fmtNum(lot.remainingQty)}</span>
              <span class="original">/ ${fmtNum(lot.openQty)}</span>
            </span>
            <span class="lot-date">${fmtDate(lot.date)}</span>
            <div class="lot-refs">
              ${lot.trn ? `<span class="ref-badge">TRN: ${esc(lot.trn)}</span>` : ''}
              ${lot.cnc ? `<span class="ref-badge">CNC: ${esc(lot.cnc)}</span>` : ''}
              ${lot.pck ? `<span class="ref-badge">PCK: ${esc(lot.pck)}</span>` : ''}
            </div>
          </div>
          <span class="lot-expand">▼</span>
        </div>
        <div class="lot-details">
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th>Quantity</th>
                <th>Remaining</th>
                <th>Date</th>
                <th>TRN</th>
                <th>CNC</th>
                <th>PCK</th>
                <th>Row #</th>
              </tr>
            </thead>
            <tbody>
              ${getContributorRows(lot).map(({ contributor, remainingAfter }) => `
                <tr>
                  <td class="dir-${contributor.direction}">${contributor.direction.toUpperCase()}</td>
                  <td>${fmtNum(contributor.qty)}</td>
                  <td>${fmtNum(remainingAfter)}</td>
                  <td>${fmtDate(contributor.date)}</td>
                  <td>${esc(contributor.trn)}</td>
                  <td>${esc(contributor.cnc)}</td>
                  <td>${esc(contributor.pck)}</td>
                  <td>${contributor.rowNum}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');
  }

  window.__toggleLot = (id) => {
    const card = document.querySelector(`.lot-card[data-lot-id="${id}"]`);
    if (card) card.classList.toggle('expanded');
  };

  function setupFilters() {
    if (filtersBound) return;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderLots();
      });
    });
    filtersBound = true;
  }

  function setupSearch() {
    if (searchBound || !searchRef) return;
    searchRef.addEventListener('input', () => {
      currentSearch = searchRef.value.trim().toLowerCase();
      renderLots();
    });
    searchBound = true;
  }

  function getFilteredLots() {
    const byStatus = currentFilter === 'all' ? lots
      : lots.filter(l => l.status === currentFilter);
    if (!currentSearch) return byStatus;
    return byStatus.filter(lot => lotMatchesSearch(lot, currentSearch));
  }

  function lotMatchesSearch(lot, q) {
    for (const c of lot.contributors) {
      if (contains(c.trn, q) || contains(c.cnc, q) || contains(c.pck, q)) {
        return true;
      }
    }
    return false;
  }

  function contains(value, q) {
    return String(value ?? '').toLowerCase().includes(q);
  }

  // ── Export ──
  btnExport.addEventListener('click', () => {
    const rows = [['Lot', 'Side', 'Status', 'Lot Date', 'Lot Open Qty', 'Contributor Direction', 'Contributor Qty', 'Remaining After Txn', 'Contributor Date', 'TRN', 'CNC', 'PCK', 'Contributor Row']];
    for (const lot of lots) {
      for (const { contributor, remainingAfter } of getContributorRows(lot)) {
        rows.push([
          lot.id,
          lot.side,
          lot.status,
          fmtDate(lot.date),
          lot.openQty,
          contributor.direction,
          contributor.qty,
          remainingAfter,
          fmtDate(contributor.date),
          contributor.trn,
          contributor.cnc,
          contributor.pck,
          contributor.rowNum,
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fifo_lots.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  btnExportXlsx.addEventListener('click', () => {
    const summaryRows = [[
      'Lot', 'Side', 'Status', 'Lot Date', 'Open Qty', 'Remaining Qty', 'Contributors'
    ]];

    const detailRows = [[
      'Lot', 'Side', 'Status', 'Lot Date', 'Lot Open Qty',
      'Contributor Direction', 'Contributor Qty', 'Contributor Date', 'TRN', 'CNC', 'PCK', 'Source Row',
      'Remaining After Txn'
    ]];

    for (const lot of lots) {
      summaryRows.push([
        lot.id,
        lot.side,
        lot.status,
        fmtDate(lot.date),
        lot.openQty,
        lot.remainingQty,
        lot.contributors.length,
      ]);

      for (const { contributor, remainingAfter } of getContributorRows(lot)) {
        detailRows.push([
          lot.id,
          lot.side,
          lot.status,
          fmtDate(lot.date),
          lot.openQty,
          contributor.direction,
          contributor.qty,
          fmtDate(contributor.date),
          contributor.trn,
          contributor.cnc,
          contributor.pck,
          contributor.rowNum,
          remainingAfter,
        ]);
      }
    }

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    const wsDetails = XLSX.utils.aoa_to_sheet(detailRows);
    wsSummary['!autofilter'] = { ref: `A1:G1` };
    wsDetails['!autofilter'] = { ref: `A1:M1` };
    wsSummary['!freeze'] = { xSplit: 0, ySplit: 1 };
    wsDetails['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Lots_Summary');
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Lot_Transactions');
    XLSX.writeFile(wb, `fifo_lots_${stampNow()}.xlsx`);
  });

  // ── Reset ──
  btnReset.addEventListener('click', () => {
    rawData = []; headers = []; lots = []; currentFilter = 'all'; currentSearch = '';
    fileInput.value = '';
    if (searchRef) searchRef.value = '';
    if (searchCount) searchCount.textContent = '';
    stepResults.classList.add('hidden');
    stepMapping.classList.add('hidden');
    stepUpload.classList.remove('hidden');
  });

  // ── Helpers ──
  function esc(s) {
    const el = document.createElement('span');
    el.textContent = String(s);
    return el.innerHTML;
  }

  function fmt(v) {
    if (v instanceof Date) return fmtDate(v);
    return String(v);
  }

  function fmtDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return String(d ?? '');
    return d.toISOString().slice(0, 10);
  }

  function fmtNum(n) {
    if (n == null || isNaN(n)) return '0';
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function compareContract(a, b) {
    const aStr = String(a ?? '').trim();
    const bStr = String(b ?? '').trim();
    if (aStr === bStr) return 0;

    const aNum = Number(aStr);
    const bNum = Number(bStr);
    const aIsNum = aStr !== '' && Number.isFinite(aNum);
    const bIsNum = bStr !== '' && Number.isFinite(bNum);

    if (aIsNum && bIsNum) return aNum - bNum;
    if (aStr === '') return 1;
    if (bStr === '') return -1;
    return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
  }

  function round(n) {
    return Math.round(n * 1e8) / 1e8;
  }

  function getContributorRows(lot) {
    let running = 0;
    return lot.contributors.map(contributor => {
      running = round(running + contributorSignedQty(lot.side, contributor.direction, contributor.qty));
      return { contributor, remainingAfter: running };
    });
  }

  function contributorSignedQty(lotSide, direction, qty) {
    if (lotSide === 'buy') return direction === 'buy' ? qty : -qty;
    return direction === 'sell' ? qty : -qty;
  }

  function stampNow() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}${mi}`;
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('fifo-theme');
    const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initialTheme);

    if (!themeToggle) return;
    themeToggle.addEventListener('click', () => {
      const nextTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      setTheme(nextTheme);
    });
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fifo-theme', theme);
    if (!themeToggle) return;
    themeToggle.textContent = theme === 'light' ? 'Dark Theme' : 'Light Theme';
  }
})();
