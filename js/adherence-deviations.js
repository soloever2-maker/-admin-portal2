renderSidebar();
applyThemeIcon();
const session = checkAuth();
if (session) {
  document.getElementById('admin-name').innerText  = session.username || 'Admin';
  document.getElementById('admin-avatar').innerText = initials(session.username || 'Admin');
}

let allAgents = [];
window.allAgents = allAgents;
let currentData = [];
let waiveTargetId = null;

// ── TIME OFFSET HELPER ──
function getHourOffset() {
  const el = document.getElementById('time-adjust');
  return el ? parseInt(el.value, 10) || 0 : 0;
}
function adjustTimeStr(timeStr, offsetHours) {
  if (!timeStr || offsetHours === 0) return timeStr;
  const parts = timeStr.split(':').map(Number);
  const totalSec = parts[0]*3600 + parts[1]*60 + (parts[2]||0) + offsetHours*3600;
  const adj = ((totalSec % 86400) + 86400) % 86400;
  const h = Math.floor(adj/3600).toString().padStart(2,'0');
  const m = Math.floor((adj%3600)/60).toString().padStart(2,'0');
  const s = Math.floor(adj%60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}


async function init() {
  const { data } = await db.from('agents')
    .select('id,formal_name')
    .eq('status','Active')
    .order('formal_name');
  allAgents = data || [];
  window.allAgents = allAgents;

  const filterSel = document.getElementById('filter-agent');
  const addSel    = document.getElementById('add-agent');
  allAgents.forEach(a => {
    filterSel.add(new Option(a.formal_name, a.id));
    addSel.add(new Option(a.formal_name, a.id));
  });

  document.getElementById('add-date').value = getToday();
  onAddTypeChange();
  await loadData();
}

// ── FILTERS ──
function onRangeChange() {
  const val = document.getElementById('filter-range').value;
  const isCustom = val === 'custom';
  document.getElementById('custom-from-wrap').style.display = isCustom ? 'flex' : 'none';
  document.getElementById('custom-to-wrap').style.display   = isCustom ? 'flex' : 'none';
  if (isCustom) {
    document.getElementById('filter-from').value = getToday();
    document.getElementById('filter-to').value   = getToday();
  }
  loadData();
}

function resetFilters() {
  document.getElementById('filter-range').value  = 'mtd';
  document.getElementById('filter-agent').value  = '';
  document.getElementById('filter-type').value   = '';
  document.getElementById('filter-status').value = 'active';
  document.getElementById('custom-from-wrap').style.display = 'none';
  document.getElementById('custom-to-wrap').style.display   = 'none';
  loadData();
}

function getDateRange() {
  const val = document.getElementById('filter-range').value;
  const today = getToday();
  const t = new Date(today + 'T00:00:00');

  if (val === 'today')   return { from: today, to: today };
  if (val === 'mtd') {
    const first = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-01`;
    return { from: first, to: today };
  }
  if (val === 'week') {
    return { from: getWeekStart(), to: getWeekEnd() };
  }
  if (val === 'last7') {
    const d = new Date(t); d.setDate(d.getDate() - 6);
    return { from: d.toISOString().split('T')[0], to: today };
  }
  if (val === 'last30') {
    const d = new Date(t); d.setDate(d.getDate() - 29);
    return { from: d.toISOString().split('T')[0], to: today };
  }
  if (val === 'custom') {
    return {
      from: document.getElementById('filter-from').value || today,
      to:   document.getElementById('filter-to').value   || today,
    };
  }
  return { from: today, to: today };
}

// ── LOAD DATA ──
async function loadData() {
  const tbody = document.getElementById('dev-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-wrap"><div class="spinner"></div></div></td></tr>';

  try {
    const { from, to } = getDateRange();
    const agentId  = document.getElementById('filter-agent').value;
    const typeVal  = document.getElementById('filter-type').value;
    const statusV  = document.getElementById('filter-status').value;

    let q = db.from('adherence_deviations').select('*')
      .gte('deviation_date', from)
      .lte('deviation_date', to)
      .order('deviation_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (agentId) q = q.eq('agent_id', agentId);
    if (typeVal) q = q.eq('deviation_type', typeVal);
    if (statusV === 'active') q = q.eq('is_waived', false);
    if (statusV === 'waived') q = q.eq('is_waived', true);

    const { data, error } = await q;
    if (error) throw error;

    // Fetch total scheduled work days for accurate adherence calculation
    let schQ = db.from('schedule')
      .select('agent_id, shift_date')
      .gte('shift_date', from)
      .lte('shift_date', to)
      .eq('day_type', 'Work');
    if (agentId) schQ = schQ.eq('agent_id', agentId);
    const { data: schedData } = await schQ;
    const totalWorkDays = (schedData || []).length;

    currentData = data || [];
    renderTable(currentData);
    renderKPIs(currentData, totalWorkDays);
    renderTopOffenders(currentData);

    document.getElementById('row-count').innerText = currentData.length + ' record(s)';

  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">❌</span>${e.message}</div></td></tr>`;
    showToast('Failed: ' + e.message, 'error');
  }
}

// ── RENDER TABLE ──
function typeClass(t) {
  const m = {
    'Late Login':'dev-type-late', 'Early Logout':'dev-type-early',
    'Long Break':'dev-type-long', 'Missed Shift':'dev-type-missed',
    'Extra Break':'dev-type-extra'
  };
  return m[t] || '';
}
function typeIcon(t) {
  const m = {
    'Late Login':'⏰', 'Early Logout':'🚪',
    'Long Break':'☕', 'Missed Shift':'❌', 'Extra Break':'➕'
  };
  return m[t] || '•';
}

function renderTable(data) {
  const tbody = document.getElementById('dev-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">✨</span>No deviations found — everyone is on track!</div></td></tr>';
    return;
  }

  tbody.innerHTML = data.map(r => {
    const rowCls   = r.is_waived ? 'waived-row' : '';
    const statusB  = r.is_waived
      ? '<span class="badge badge-success">✓ Waived</span>'
      : '<span class="badge badge-warning">Active</span>';
    const minsCls  = r.deviation_minutes >= 30 ? 'min-pill' : 'min-pill small';

    let actions = '';
    if (r.is_waived) {
      actions = `<button class="btn btn-ghost btn-sm btn-icon" title="Waive details" onclick="showWaiveDetails('${r.id}')"><i class="fas fa-info-circle"></i></button>`;
    } else {
      actions = `<button class="btn btn-success btn-sm" onclick="openWaiveModal('${r.id}')" title="Waive"><i class="fas fa-hand-holding-heart"></i> Waive</button>`;
    }


    return `<tr class="${rowCls}">
      <td style="font-weight:700;color:var(--gold);white-space:nowrap;">${formatDateShort(r.deviation_date)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="agent-avatar" style="width:26px;height:26px;font-size:9px;">${initials(r.agent_name)}</div>
          <span style="font-weight:700;">${r.agent_name}</span>
        </div>
      </td>
      <td class="${typeClass(r.deviation_type)}">${typeIcon(r.deviation_type)} ${r.deviation_type}</td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--muted);">${r.scheduled_value || '—'}</td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:12px;">${r.actual_value || '—'}</td>
      <td><span class="${minsCls}">${r.deviation_minutes} min</span></td>
      <td>${statusB}</td>
      <td style="white-space:nowrap;text-align:center;">${actions}</td>
    </tr>`;
  }).join('');
}

// ── RENDER KPIs ──
function renderKPIs(data, totalWorkDays) {
  if (!data.length) {
    ['kpi-adherence','kpi-total','kpi-waived','kpi-lost','kpi-common','kpi-agents'].forEach(id => {
      document.getElementById(id).innerText = '—';
    });
    document.getElementById('kpi-adherence').innerText = '100%';
    document.getElementById('kpi-total').innerText = '0';
    document.getElementById('kpi-waived').innerText = '0';
    document.getElementById('kpi-lost').innerText = '0 min';
    document.getElementById('kpi-common').innerText = 'None';
    document.getElementById('kpi-agents').innerText = '0';
    return;
  }

  const total = data.length;
  const waived = data.filter(r => r.is_waived).length;
  const active = total - waived;

  const totalMins     = data.reduce((s,r) => s + (r.deviation_minutes||0), 0);
  const netLostMins   = data.filter(r => !r.is_waived).reduce((s,r) => s + (r.deviation_minutes||0), 0);

  // Adherence % = work days without active deviations / total scheduled work days
  const activeDevs = data.filter(r => !r.is_waived);
  const uniqueDevDays = new Set(activeDevs.map(r => `${r.agent_id}_${r.deviation_date}`));
  const deviatedDays = uniqueDevDays.size;
  const adherencePct = totalWorkDays > 0
    ? Math.max(0, Math.round(((totalWorkDays - deviatedDays) / totalWorkDays) * 100))
    : 100;

  // Most common
  const typeCount = {};
  data.forEach(r => {
    typeCount[r.deviation_type] = (typeCount[r.deviation_type]||0) + 1;
  });
  const sortedTypes = Object.entries(typeCount).sort((a,b) => b[1]-a[1]);
  const mostCommon  = sortedTypes[0];

  // Unique agents
  const agents = new Set(data.map(r => r.agent_name));

  document.getElementById('kpi-adherence').innerText  = adherencePct.toFixed(0) + '%';
  document.getElementById('kpi-total').innerText      = total;
  document.getElementById('kpi-total-sub').innerText  = active + ' active · ' + waived + ' waived';
  document.getElementById('kpi-waived').innerText     = waived;
  document.getElementById('kpi-waived-sub').innerText = total > 0 ? ((waived/total)*100).toFixed(0) + '% of total' : '—';
  document.getElementById('kpi-lost').innerText       = netLostMins + ' min';
  document.getElementById('kpi-common').innerText     = mostCommon ? mostCommon[0] : 'None';
  document.getElementById('kpi-common-sub').innerText = mostCommon ? (mostCommon[1] + ' occurrences') : '';
  document.getElementById('kpi-agents').innerText     = agents.size;
}

// ── TOP OFFENDERS ──
function renderTopOffenders(data) {
  const container = document.getElementById('top-offenders');
  if (!data.length) {
    container.innerHTML = '<div class="empty-state" style="padding:30px 16px;"><span class="empty-icon">🏆</span>No offenders!</div>';
    return;
  }

  const map = {};
  data.forEach(r => {
    if (r.is_waived) return;
    if (!map[r.agent_name]) map[r.agent_name] = { name: r.agent_name, count: 0, mins: 0 };
    map[r.agent_name].count++;
    map[r.agent_name].mins += (r.deviation_minutes||0);
  });

  const sorted = Object.values(map).sort((a,b) => b.count - a.count || b.mins - a.mins).slice(0,8);

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state" style="padding:30px 16px;"><span class="empty-icon">🏆</span>All deviations waived!</div>';
    return;
  }

  container.innerHTML = sorted.map((a,i) => `
    <div class="top-offender-row">
      <div class="top-offender-left">
        <div style="font-size:12px;font-weight:800;color:${i<3?'#EF4444':'var(--muted)'};min-width:20px;">#${i+1}</div>
        <div class="agent-avatar" style="width:28px;height:28px;font-size:10px;">${initials(a.name)}</div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text);">${a.name}</div>
          <div style="font-size:10px;color:var(--muted);">${a.mins} min lost</div>
        </div>
      </div>
      <span class="badge badge-danger">${a.count}</span>
    </div>
  `).join('');
}

// ═══════════ WAIVE FLOW ═══════════
function openWaiveModal(id) {
  const r = currentData.find(x => x.id === id);
  if (!r) return;
  waiveTargetId = id;
  document.getElementById('waive-preview').innerHTML = `
    <div style="background:var(--surface2);border-radius:10px;padding:12px 14px;">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">${r.agent_name}</div>
      <div style="font-size:12px;color:var(--muted);">
        <strong class="${typeClass(r.deviation_type)}">${typeIcon(r.deviation_type)} ${r.deviation_type}</strong>
        · ${formatDateShort(r.deviation_date)} · <strong>${r.deviation_minutes} min</strong>
      </div>
    </div>
  `;
  document.getElementById('waive-reason').value = '';
  document.getElementById('waive-modal').classList.add('open');
}

function closeWaiveModal() {
  document.getElementById('waive-modal').classList.remove('open');
  waiveTargetId = null;
}

async function confirmWaive() {
  const reason = document.getElementById('waive-reason').value.trim();
  if (!reason) { showToast('Please enter a reason', 'warning'); return; }
  if (!waiveTargetId) return;

  try {
    const _rec = (typeof allDeviations !== 'undefined' ? allDeviations : []).find?.(d => d.id === waiveTargetId);
    const { error } = await db.from('adherence_deviations').update({
      is_waived:    true,
      waived_by:    session?.username || 'Admin',
      waived_at:    new Date().toISOString(),
      waive_reason: reason,
    }).eq('id', waiveTargetId);
    if (error) throw error;
    logAudit({ module: 'Adherence', action: 'UPDATE', targetTable: 'adherence_deviations', targetId: waiveTargetId,
      description: _rec
        ? `Waived ${_rec.deviation_type} (${_rec.deviation_minutes} min) for ${_rec.agent_name} on ${_rec.deviation_date} — reason: ${reason}`
        : `Waived deviation (id: ${waiveTargetId}) — reason: ${reason}` });

    showToast('Deviation waived successfully', 'success');
    closeWaiveModal();
    await loadData();
  } catch(e) { showToast('Failed: '+e.message, 'error'); }
}

function showWaiveDetails(id) {
  const r = currentData.find(x => x.id === id);
  if (!r) return;
  openModal('Waive Details',
    `Waived by: ${r.waived_by || '—'}\nAt: ${r.waived_at ? new Date(r.waived_at).toLocaleString() : '—'}\n\nReason:\n${r.waive_reason || '(no reason)'}`,
    () => {}
  );
  document.getElementById('modal-confirm').style.display = 'none';
  setTimeout(() => { document.getElementById('modal-confirm').style.display = 'inline-flex'; }, 100);
}

// ═══════════ ADD DEVIATION ═══════════
function openAddModal() {
  document.getElementById('add-agent').value    = '';
  document.getElementById('add-date').value     = getToday();
  document.getElementById('add-type').value     = 'Late Login';
  document.getElementById('add-scheduled').value= '';
  document.getElementById('add-actual').value   = '';
  document.getElementById('add-minutes').value  = '';
  document.getElementById('add-notes').value    = '';
  onAddTypeChange();
  document.getElementById('add-modal').classList.add('open');
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
}

function onAddTypeChange() {
  const t = document.getElementById('add-type').value;
  const schedL = document.getElementById('add-sched-label');
  const actualL= document.getElementById('add-actual-label');
  const schedI = document.getElementById('add-scheduled');
  const actualI= document.getElementById('add-actual');

  if (t === 'Late Login' || t === 'Early Logout') {
    schedL.innerText = 'Scheduled Time';
    actualL.innerText = 'Actual Time';
    schedI.placeholder = '09:00';
    actualI.placeholder = '09:15';
  } else if (t === 'Long Break' || t === 'Extra Break') {
    schedL.innerText = 'Scheduled Duration';
    actualL.innerText = 'Actual Duration';
    schedI.placeholder = '15 min';
    actualI.placeholder = '25 min';
  } else if (t === 'Missed Shift') {
    schedL.innerText = 'Scheduled Shift';
    actualL.innerText = 'Status';
    schedI.placeholder = '09:00 - 17:00';
    actualI.placeholder = 'No-show';
  }
}

async function saveDeviation() {
  const agentId = document.getElementById('add-agent').value;
  const date    = document.getElementById('add-date').value;
  const type    = document.getElementById('add-type').value;
  const sched   = document.getElementById('add-scheduled').value.trim();
  const actual  = document.getElementById('add-actual').value.trim();
  const mins    = parseInt(document.getElementById('add-minutes').value);
  const notes   = document.getElementById('add-notes').value.trim();

  if (!agentId) { showToast('Please select an agent','warning'); return; }
  if (!date)    { showToast('Please select a date','warning'); return; }
  if (isNaN(mins) || mins < 0) { showToast('Please enter deviation minutes','warning'); return; }

  const agent = allAgents.find(a => a.id === agentId);
  if (!agent) return;

  try {
    const { error } = await db.from('adherence_deviations').insert({
      agent_id:          agentId,
      agent_name:        agent.formal_name,
      deviation_date:    date,
      deviation_type:    type,
      scheduled_value:   sched || null,
      actual_value:      actual || null,
      deviation_minutes: mins,
      notes:             notes || null,
      source:            'Manual',
      created_by:        session?.username || 'Admin',
    });
    if (error) throw error;
    logAudit({ module: 'Adherence', action: 'INSERT', targetTable: 'adherence_deviations',
      description: `Added manual deviation for ${agent.formal_name}: ${type} (${mins} min) on ${date}` });

    showToast('Deviation added successfully', 'success');
    closeAddModal();
    await loadData();
  } catch(e) { showToast('Failed: '+e.message, 'error'); }
}


// ── HELPERS ──
function formatDateShort(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short' });
}

init();

function refreshCurrentTab() {
  const isMonthly = document.getElementById("tab-monthly")?.style.display !== "none";
  if (isMonthly) {
    loadMonthlyAdherence();
  } else {
    loadData();
  }
}

// ══════════════════════════════════════════
//  AUTO-CHECK ENGINE
// ══════════════════════════════════════════
async function runAutoCheck() {
  const btn = document.getElementById('auto-check-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking…';

  const TOL_LOGIN = parseInt(localStorage.getItem('nos_tol_login') ?? '4');
  const TOL_BRK   = parseInt(localStorage.getItem('nos_tol_break') ?? '2');
  const session   = checkAuth();
  const createdBy = session?.username || 'Auto-Check';

  try {
    // Get date range from current filter
    const { from, to } = getDateRange();

    const [{ data: brkData }, { data: perfData }, { data: existingDevs }] = await Promise.all([
      db.from('breaks')
        .select('agent_id, break_date, shift_time, break1, lunch, break2')
        .gte('break_date', from).lte('break_date', to),
      db.from('daily_performance')
        .select('agent_id, perf_date, login_time, logout_time, actual_break1, actual_lunch, actual_break2')
        .gte('perf_date', from).lte('perf_date', to),
      db.from('adherence_deviations')
        .select('agent_id, deviation_date, deviation_type, scheduled_value')
        .gte('deviation_date', from).lte('deviation_date', to),
    ]);

    const perfMap = {};
    const offsetHours = getHourOffset();
    (perfData || []).forEach(p => {
      const adjusted = Object.assign({}, p);
      if (offsetHours !== 0) {
        adjusted.login_time    = adjustTimeStr(p.login_time,    offsetHours);
        adjusted.logout_time   = adjustTimeStr(p.logout_time,   offsetHours);
        adjusted.actual_break1 = adjustTimeStr(p.actual_break1, offsetHours);
        adjusted.actual_lunch  = adjustTimeStr(p.actual_lunch,  offsetHours);
        adjusted.actual_break2 = adjustTimeStr(p.actual_break2, offsetHours);
      }
      perfMap[p.agent_id + '_' + p.perf_date] = adjusted;
    });

    // Key includes scheduled_value so break1 / lunch / break2 are tracked separately
    // (prev bug: all three shared agentId_date_Long Break → only first was logged)
    const existingSet = new Set(
      (existingDevs || []).map(d =>
        `${d.agent_id}_${d.deviation_date}_${d.deviation_type}_${d.scheduled_value || ''}`
      )
    );

    const timeDiff = (ref, actual) => {
      if (!ref || !actual) return null;
      const [rh, rm] = ref.substring(0,5).split(':').map(Number);
      const [ah, am] = actual.substring(0,5).split(':').map(Number);
      return (ah * 60 + am) - (rh * 60 + rm);
    };

    const parseShift = s => {
      if (!s) return { start: null, end: null };
      const p = s.split(' - ');
      return { start: p[0]?.trim()||null, end: p[1]?.trim()||null };
    };

    const toInsert = [];

    (brkData || []).forEach(b => {
      const perf = perfMap[b.agent_id + '_' + b.break_date];
      if (!perf) return;

      const shift     = parseShift(b.shift_time);
      const agentId   = b.agent_id;
      const date      = b.break_date;
      const agent     = allAgents.find(a => a.id === agentId);
      const agentName = agent?.formal_name || agentId;

      const checks = [
        { type: 'Late Login',    ref: shift.start, actual: perf.login_time,    tol: TOL_LOGIN, invert: false,
          sched: shift.start,                       act: perf.login_time?.substring(0,5) },
        { type: 'Long Break',    ref: b.break1,    actual: perf.actual_break1, tol: TOL_BRK,   invert: false,
          sched: b.break1?.substring(0,5),          act: perf.actual_break1?.substring(0,5) },
        { type: 'Long Break',    ref: b.lunch,     actual: perf.actual_lunch,  tol: TOL_BRK,   invert: false,
          sched: b.lunch?.substring(0,5),           act: perf.actual_lunch?.substring(0,5) },
        { type: 'Long Break',    ref: b.break2,    actual: perf.actual_break2, tol: TOL_BRK,   invert: false,
          sched: b.break2?.substring(0,5),          act: perf.actual_break2?.substring(0,5) },
        { type: 'Early Logout',  ref: shift.end,   actual: perf.logout_time,   tol: TOL_LOGIN, invert: true,
          sched: shift.end,                         act: perf.logout_time?.substring(0,5) },
      ];

      checks.forEach(({ type, ref, actual, tol, sched, act, invert }) => {
        const diff = timeDiff(ref, actual);
        if (diff === null) return;
        const isViolation = invert ? diff < -tol : diff > tol;
        if (!isViolation) return;

        // sched included in key → break1 / lunch / break2 each logged independently
        const devKey = `${agentId}_${date}_${type}_${sched || ''}`;
        if (existingSet.has(devKey)) return;
        existingSet.add(devKey);

        toInsert.push({
          agent_id:          agentId,
          agent_name:        agentName,
          deviation_date:    date,
          deviation_type:    type,
          scheduled_value:   sched || '—',
          actual_value:      act   || '—',
          deviation_minutes: Math.abs(diff),
          notes:             `Auto: ${sched} → ${act} (${diff > 0 ? '+' : ''}${diff} min)`,
          source:            'Auto',
          created_by:        createdBy,
          is_waived:         false,
        });
      });
    });

    if (!toInsert.length) {
      showToast('✅ No new deviations found', 'success');
    } else {
      for (let i = 0; i < toInsert.length; i += 100) {
        const { error } = await db.from('adherence_deviations').insert(toInsert.slice(i, i+100));
        if (error) throw error;
      }
      logAudit({ module: 'Adherence', action: 'INSERT', targetTable: 'adherence_deviations',
        description: `Auto-check detected & saved ${toInsert.length} deviation(s)` });
      showToast(`⚠️ ${toInsert.length} deviation(s) detected & saved`, 'warning');
    }

    await loadData();

  } catch(e) {
    showToast('Auto-check failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot"></i> Run Auto-Check';
  }
}
