/* ══════════════════════════════════════════════════════════════
   MONTHLY ADHERENCE — Full Implementation
══════════════════════════════════════════════════════════════ */

// ── Module-level cache for export ──
let lastMonthlyRows = [];
let lastMonthlyLabel = '';

// ── Tab switch ──
function switchAdhTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-deviations').style.display = tab === 'deviations' ? 'block' : 'none';
  document.getElementById('tab-monthly').style.display    = tab === 'monthly'    ? 'block' : 'none';
  if (tab === 'monthly') populateMonthAgents();
}

// ── Tolerance settings (localStorage) ──
const TOL_KEYS = { login: 'nos_tol_login', break: 'nos_tol_break' };

function loadTolerance() {
  const login = parseInt(localStorage.getItem(TOL_KEYS.login) ?? '4');
  const brk   = parseInt(localStorage.getItem(TOL_KEYS.break) ?? '2');
  document.getElementById('tol-login').value = login;
  document.getElementById('tol-break').value = brk;
  document.getElementById('tol-login-preview').innerText = login;
  document.getElementById('tol-break-preview').innerText = brk;
  document.getElementById('tol-login').oninput = () =>
    document.getElementById('tol-login-preview').innerText = document.getElementById('tol-login').value;
  document.getElementById('tol-break').oninput = () =>
    document.getElementById('tol-break-preview').innerText = document.getElementById('tol-break').value;
}

function saveTolerance() {
  const login = parseInt(document.getElementById('tol-login').value) || 3;
  const brk   = parseInt(document.getElementById('tol-break').value) || 2;
  localStorage.setItem(TOL_KEYS.login, login);
  localStorage.setItem(TOL_KEYS.break, brk);
  showToast('Tolerance settings saved ✅', 'success');
}

function getTolerance() {
  return {
    login: parseInt(localStorage.getItem(TOL_KEYS.login) ?? '4'),
    brk:   parseInt(localStorage.getItem(TOL_KEYS.break) ?? '2'),
  };
}

// ── Init monthly tab ──
(function initMonthly() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  document.getElementById('month-picker').value = today.slice(0, 7);
  loadTolerance();
})();

function populateMonthAgents() {
  const sel = document.getElementById('month-agent');
  if (sel.options.length > 1) return;
  allAgents.forEach(a => sel.add(new Option(a.formal_name, a.id)));
}

// ── Core check function ──
function timeToMinsAdh(t) {
  if (!t) return null;
  const p = t.substring(0, 5).split(':');
  return (+p[0]) * 60 + (+p[1]);
}

function checkTime(scheduled, actual, toleranceMins) {
  const sMin = timeToMinsAdh(scheduled);
  const aMin = timeToMinsAdh(actual);
  if (sMin === null || aMin === null) return { status: 'no-data', diff: null };
  const diff = aMin - sMin; // positive = late, negative = early
  if (Math.abs(diff) <= toleranceMins) return { status: 'ok', diff };
  if (diff > toleranceMins)            return { status: 'late', diff };
  return                                      { status: 'early', diff };
}

function chipHTML(result, label) {
  if (!result) return `<span class="adh-chip adh-none">—</span>`;
  const { status, diff } = result;
  if (status === 'no-data') return `<span class="adh-chip adh-none" title="${label}">N/A</span>`;
  const icon  = status === 'ok' ? '✅' : status === 'late' ? '🔴' : '🔵';
  const cls   = status === 'ok' ? 'adh-ok' : status === 'late' ? 'adh-late' : 'adh-early';
  const sign  = diff > 0 ? '+' : '';
  const label2 = diff !== null ? `${sign}${diff}m` : '';
  return `<span class="adh-chip ${cls}" title="${label}">${icon} ${label2}</span>`;
}

function diffText(diff) {
  if (diff === null || diff === undefined) return '—';
  const sign = diff >= 0 ? '+' : '';
  return `<span style="font-family:monospace;font-size:11px;color:${diff > 0 ? '#ef4444' : diff < 0 ? '#3b82f6' : '#10b981'};">${sign}${diff}m</span>`;
}

// ── MAIN LOAD ──
async function loadMonthlyAdherence() {
  const monthVal  = document.getElementById('month-picker').value; // YYYY-MM
  const agentFilt = document.getElementById('month-agent').value;
  if (!monthVal) { showToast('Select a month first', 'warning'); return; }

  const [year, month] = monthVal.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay    = new Date(year, month, 0).getDate();
  const monthEnd   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const tol = getTolerance();

  document.getElementById('monthly-grid').innerHTML =
    '<div class="loading-wrap" style="padding:40px;"><div class="spinner"></div></div>';
  document.getElementById('monthly-kpis').style.display = 'none';
  document.getElementById('agent-summary-card').style.display = 'none';
  document.getElementById('monthly-row-count').innerText = '';

  try {
    // 1. Schedule (work days + shift start times)
    let schQ = db.from('schedule')
      .select('agent_id, shift_date, shift_types(start_time, end_time)')
      .gte('shift_date', monthStart)
      .lte('shift_date', monthEnd)
      .eq('day_type', 'Work');
    if (agentFilt) schQ = schQ.eq('agent_id', agentFilt);
    const { data: schedules, error: schErr } = await schQ;
    if (schErr) throw schErr;

    // 2. Breaks
    let brkQ = db.from('breaks')
      .select('agent_id, break_date, break1, lunch, break2, scheduled_break1, scheduled_lunch, scheduled_break2')
      .gte('break_date', monthStart)
      .lte('break_date', monthEnd);
    if (agentFilt) brkQ = brkQ.eq('agent_id', agentFilt);
    const { data: breaks, error: brkErr } = await brkQ;
    if (brkErr) throw brkErr;

    // 3. Login times from daily_performance
    let perfQ = db.from('daily_performance')
      .select('agent_id, perf_date, login_time, actual_break1, actual_lunch, actual_break2')
      .gte('perf_date', monthStart)
      .lte('perf_date', monthEnd);
    if (agentFilt) perfQ = perfQ.eq('agent_id', agentFilt);
    const { data: perfs, error: perfErr } = await perfQ;
    if (perfErr) throw perfErr;

    // Index data
    const schedMap = {}; // "agentId_date" → { start_time, end_time }
    (schedules || []).forEach(s => {
      schedMap[s.agent_id + '_' + s.shift_date] = s.shift_types;
    });

    const brkMap = {}; // "agentId_date" → break record
    (breaks || []).forEach(b => { brkMap[b.agent_id + '_' + b.break_date] = b; });

    const perfMap = {}; // "agentId_date" → full perf record
    const monthlyOffsetHours = (function() {
      const el = document.getElementById('time-adjust');
      return el ? parseInt(el.value, 10) || 0 : 0;
    })();
    const adjMonthly = t => {
      if (!t || monthlyOffsetHours === 0) return t;
      const parts = t.split(':').map(Number);
      const totalSec = parts[0]*3600 + parts[1]*60 + (parts[2]||0) + monthlyOffsetHours*3600;
      const adj = ((totalSec % 86400) + 86400) % 86400;
      return `${Math.floor(adj/3600).toString().padStart(2,'0')}:${Math.floor((adj%3600)/60).toString().padStart(2,'0')}:${Math.floor(adj%60).toString().padStart(2,'0')}`;
    };
    (perfs || []).forEach(p => {
      const adjusted = Object.assign({}, p);
      if (monthlyOffsetHours !== 0) {
        adjusted.login_time    = adjMonthly(p.login_time);
        adjusted.actual_break1 = adjMonthly(p.actual_break1);
        adjusted.actual_lunch  = adjMonthly(p.actual_lunch);
        adjusted.actual_break2 = adjMonthly(p.actual_break2);
      }
      perfMap[p.agent_id + '_' + p.perf_date] = adjusted;
    });

    // Get unique agents who worked this month
    const agentIds  = [...new Set((schedules || []).map(s => s.agent_id))];
    const agentObjs = allAgents.filter(a => agentIds.includes(a.id));

    // Build all rows sorted by date then agent name
    const allRows = [];
    lastMonthlyLabel = monthVal;
    (schedules || []).forEach(s => {
      const agent = agentObjs.find(a => a.id === s.agent_id);
      if (!agent) return;
      const shiftInfo  = schedMap[s.agent_id + '_' + s.shift_date];
      const brkRecord  = brkMap[s.agent_id  + '_' + s.shift_date];
      const perf       = perfMap[s.agent_id + '_' + s.shift_date];
      const loginActual = perf?.login_time    || null;
      const b1Actual    = perf?.actual_break1 || null;
      const lunchActual = perf?.actual_lunch  || null;
      const b2Actual    = perf?.actual_break2 || null;

      // Reference = last committed time (break1 after any agent swap, or scheduled if no swap)
      // Actual    = real time from xCALLY report
      const loginRes  = checkTime(shiftInfo?.start_time,       loginActual, tol.login);
      const b1Res     = checkTime(brkRecord?.break1,            b1Actual,   tol.brk);
      const lunchRes  = checkTime(brkRecord?.lunch,             lunchActual, tol.brk);
      const b2Res     = checkTime(brkRecord?.break2,            b2Actual,   tol.brk);

      // Day status
      const checks = [loginRes, b1Res, lunchRes, b2Res];
      const hasData = checks.some(c => c.status !== 'no-data');
      const hasLate = checks.some(c => c.status === 'late');
      const allOk   = checks.filter(c => c.status !== 'no-data').every(c => c.status === 'ok' || c.status === 'early');
      let dayStatus = 'no-data';
      if (hasData) dayStatus = hasLate ? 'bad' : allOk ? 'ok' : 'partial';

      allRows.push({
        date:       s.shift_date,
        agentId:    s.agent_id,
        agentName:  agent.formal_name,
        shiftStart: shiftInfo?.start_time,
        loginActual,
        b1Actual, lunchActual, b2Actual,
        loginRes,
        b1Res, lunchRes, b2Res,
        brkRecord,
        dayStatus,
      });
    });

    allRows.sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return  1;
      return a.agentName.localeCompare(b.agentName);
    });

    if (!allRows.length) {
      document.getElementById('monthly-grid').innerHTML =
        '<div class="empty-state" style="padding:40px;"><span class="empty-icon">📭</span>No working days found for this month</div>';
      return;
    }

    // ── Render KPIs ──
    const adherentDays    = allRows.filter(r => r.dayStatus === 'ok').length;
    const nonAdherentDays = allRows.filter(r => r.dayStatus === 'bad').length;
    const dataRows        = allRows.filter(r => r.dayStatus !== 'no-data').length;
    const rate            = dataRows > 0 ? Math.round((adherentDays / dataRows) * 100) : 0;
    const lateLogins      = allRows.filter(r => r.loginRes.status === 'late').length;
    const lateBreaks      = allRows.reduce((s, r) =>
      s + [r.b1Res, r.lunchRes, r.b2Res].filter(c => c.status === 'late').length, 0);

    document.getElementById('mkpi-adherent').innerText    = adherentDays;
    document.getElementById('mkpi-nonadherent').innerText = nonAdherentDays;
    document.getElementById('mkpi-rate').innerText        = rate + '%';
    document.getElementById('mkpi-latelogin').innerText   = lateLogins;
    document.getElementById('mkpi-latebreak').innerText   = lateBreaks;
    document.getElementById('mkpi-agents').innerText      = agentIds.length;
    document.getElementById('monthly-kpis').style.display = 'block';
    document.getElementById('monthly-row-count').innerText = allRows.length + ' records';
    lastMonthlyRows = allRows;
    const exportBtn = document.getElementById('monthly-export-btn');
    if (exportBtn) exportBtn.style.display = allRows.length ? 'inline-flex' : 'none';

    // ── Render main grid ──
    let html = `<table class="adh-table">
      <thead><tr>
        <th class="left" style="min-width:90px;">Date</th>
        <th class="left" style="min-width:130px;">Agent</th>
        <th style="min-width:80px;">Shift</th>
        <th colspan="3" style="border-left:2px solid var(--border);">⏰ Login</th>
        <th colspan="3" style="border-left:2px solid var(--border);">☕ Break 1</th>
        <th colspan="3" style="border-left:2px solid var(--border);">🍽️ Lunch</th>
        <th colspan="3" style="border-left:2px solid var(--border);">🫖 Break 2</th>
        <th style="min-width:80px;">Day</th>
      </tr>
      <tr>
        <th class="left"></th><th class="left"></th><th></th>
        <th style="border-left:2px solid var(--border);">Sched</th><th>Actual</th><th>Status</th>
        <th style="border-left:2px solid var(--border);">Sched</th><th>Actual</th><th>Status</th>
        <th style="border-left:2px solid var(--border);">Sched</th><th>Actual</th><th>Status</th>
        <th style="border-left:2px solid var(--border);">Sched</th><th>Actual</th><th>Status</th>
        <th></th>
      </tr></thead><tbody>`;

    let lastDate = '';
    allRows.forEach(r => {
      if (r.date !== lastDate) {
        lastDate = r.date;
        const d   = new Date(r.date + 'T00:00:00');
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const label = days[d.getDay()] + ' ' + d.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
        html += `<tr class="date-group"><td colspan="17">${label}</td></tr>`;
      }

      const dayCls = r.dayStatus === 'ok' ? 'adh-day-ok' : r.dayStatus === 'bad' ? 'adh-day-bad' : r.dayStatus === 'partial' ? 'adh-day-part' : '';
      const dayIcon = r.dayStatus === 'ok' ? '✅ Adherent' : r.dayStatus === 'bad' ? '❌ Violation' : r.dayStatus === 'partial' ? '🟡 Partial' : '⏳ No Data';

      const fmt = t => t ? t.substring(0,5) : '—';

      html += `<tr class="${dayCls}">
        <td class="left"></td>
        <td class="left">
          <div style="display:flex;align-items:center;gap:7px;">
            <div class="agent-avatar" style="width:24px;height:24px;font-size:9px;">${initials(r.agentName)}</div>
            <span style="font-weight:700;font-size:12px;">${r.agentName}</span>
          </div>
        </td>
        <td style="font-family:monospace;font-size:11px;color:var(--muted);">${fmt(r.shiftStart)}</td>
        <td style="border-left:2px solid var(--border);font-family:monospace;font-size:11px;color:var(--muted);">${fmt(r.shiftStart)}</td>
        <td style="font-family:monospace;font-size:11px;">${fmt(r.loginActual)}</td>
        <td>${chipHTML(r.loginRes, 'Login')}</td>
        <td style="border-left:2px solid var(--border);font-family:monospace;font-size:11px;color:var(--muted);">${fmt(r.brkRecord?.break1)}</td>
        <td style="font-family:monospace;font-size:11px;">${fmt(r.b1Actual)}</td>
        <td>${chipHTML(r.b1Res, 'Break 1')}</td>
        <td style="border-left:2px solid var(--border);font-family:monospace;font-size:11px;color:var(--muted);">${fmt(r.brkRecord?.lunch)}</td>
        <td style="font-family:monospace;font-size:11px;">${fmt(r.lunchActual)}</td>
        <td>${chipHTML(r.lunchRes, 'Lunch')}</td>
        <td style="border-left:2px solid var(--border);font-family:monospace;font-size:11px;color:var(--muted);">${fmt(r.brkRecord?.break2)}</td>
        <td style="font-family:monospace;font-size:11px;">${fmt(r.b2Actual)}</td>
        <td>${chipHTML(r.b2Res, 'Break 2')}</td>
        <td><span style="font-size:11px;font-weight:700;">${dayIcon}</span></td>
      </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('monthly-grid').innerHTML = html;

    // ── Render per-agent summary ──
    const agentMap = {};
    allRows.forEach(r => {
      if (!agentMap[r.agentId]) agentMap[r.agentId] = {
        name: r.agentName, worked: 0, adherent: 0, nonAdherent: 0,
        noData: 0, lateLogins: 0, lateBreaks: 0,
      };
      const a = agentMap[r.agentId];
      a.worked++;
      if (r.dayStatus === 'ok')      a.adherent++;
      else if (r.dayStatus === 'bad') a.nonAdherent++;
      else                            a.noData++;
      if (r.loginRes.status === 'late') a.lateLogins++;
      a.lateBreaks += [r.b1Res, r.lunchRes, r.b2Res].filter(c => c.status === 'late').length;
    });

    const summaryRows = Object.values(agentMap).sort((a,b) => b.nonAdherent - a.nonAdherent);
    const summaryHTML = summaryRows.map(a => {
      const daysWithData = a.worked - a.noData;
      const rate = daysWithData > 0 ? Math.round((a.adherent / daysWithData) * 100) : 0;
      const barColor = rate >= 90 ? '#10B981' : rate >= 70 ? '#f59e0b' : '#ef4444';
      return `<tr>
        <td class="left">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="agent-avatar" style="width:26px;height:26px;font-size:9px;">${initials(a.name)}</div>
            <span style="font-weight:700;">${a.name}</span>
          </div>
        </td>
        <td>${a.worked}</td>
        <td style="color:#10B981;font-weight:700;">${a.adherent}</td>
        <td style="color:#ef4444;font-weight:700;">${a.nonAdherent}</td>
        <td style="color:var(--muted);">${a.noData}</td>
        <td style="color:#f59e0b;font-weight:700;">${a.lateLogins}</td>
        <td style="color:#8b5cf6;font-weight:700;">${a.lateBreaks}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;min-width:120px;">
            <div style="flex:1;">
              <div class="summary-bar">
                <div class="summary-bar-fill" style="width:${rate}%;background:${barColor};"></div>
              </div>
            </div>
            <span style="font-weight:800;color:${barColor};font-size:13px;">${rate}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('agent-summary-tbody').innerHTML = summaryHTML;
    document.getElementById('agent-summary-card').style.display = 'block';

  } catch(e) {
    document.getElementById('monthly-grid').innerHTML =
      `<div class="empty-state" style="padding:40px;color:var(--danger);"><span class="empty-icon">❌</span>${e.message}</div>`;
    showToast('Failed: ' + e.message, 'error');
  }
}

// ══════════════════ EXPORT MONTHLY EXCEL ══════════════════
function exportMonthlyExcel() {
  if (!lastMonthlyRows.length) { showToast('No data to export', 'warning'); return; }

  const fmt = t => t ? t.substring(0, 5) : '';
  const statusLabel = s => {
    if (!s) return '';
    if (s.status === 'ok')       return 'OK';
    if (s.status === 'late')     return `Late +${s.diff}m`;
    if (s.status === 'early')    return `Early ${s.diff}m`;
    if (s.status === 'no-data')  return 'N/A';
    return '';
  };
  const dayLabel = s =>
    s === 'ok' ? 'Adherent' : s === 'bad' ? 'Violation' : s === 'partial' ? 'Partial' : 'No Data';

  const headers = [
    'Date', 'Agent', 'Shift Start',
    'Login Sched', 'Login Actual', 'Login Status',
    'Break1 Sched', 'Break1 Actual', 'Break1 Status',
    'Lunch Sched', 'Lunch Actual', 'Lunch Status',
    'Break2 Sched', 'Break2 Actual', 'Break2 Status',
    'Day Status'
  ];

  const rows = lastMonthlyRows.map(r => [
    r.date,
    r.agentName,
    fmt(r.shiftStart),
    fmt(r.shiftStart),
    fmt(r.loginActual),
    statusLabel(r.loginRes),
    fmt(r.brkRecord?.break1),
    fmt(r.b1Actual),
    statusLabel(r.b1Res),
    fmt(r.brkRecord?.lunch),
    fmt(r.lunchActual),
    statusLabel(r.lunchRes),
    fmt(r.brkRecord?.break2),
    fmt(r.b2Actual),
    statusLabel(r.b2Res),
    dayLabel(r.dayStatus),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths
  ws['!cols'] = [
    {wch:12},{wch:22},{wch:12},
    {wch:12},{wch:12},{wch:14},
    {wch:12},{wch:12},{wch:14},
    {wch:12},{wch:12},{wch:14},
    {wch:12},{wch:12},{wch:14},
    {wch:12}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Adherence');
  XLSX.writeFile(wb, `adherence-monthly-${lastMonthlyLabel}.xlsx`);
  showToast('✅ Export complete', 'success');
}
