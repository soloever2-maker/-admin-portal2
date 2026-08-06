// ═══════════════════════════════════════════
// NOS Admin — UI Helpers
// ═══════════════════════════════════════════
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type]||'✅'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(()=>toast.remove(),400); }, 3500);
}
function openModal(title, msg, onConfirm) {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-msg').innerText = msg;
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-confirm').onclick = () => { closeModal(); onConfirm(); };
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
function openPanel(title) {
  if (title !== undefined) document.getElementById('panel-title').innerText = title;
  document.getElementById('panel-overlay').classList.add('open');
  document.getElementById('slide-panel').classList.add('open');
}
function closePanel() {
  document.getElementById('panel-overlay').classList.remove('open');
  document.getElementById('slide-panel').classList.remove('open');
}
function loading(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="loading-wrap"><div class="spinner"></div><div>Loading...</div></div>`;
}
function empty(id, msg='No data found') {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span>${msg}</div>`;
}
function statusBadge(status) {
  const map = {
    'Active':'badge-success','Inactive':'badge-danger',
    'Approved':'badge-success','Rejected':'badge-danger','Pending':'badge-warning',
    'Published':'badge-info','Open':'badge-success','Closed':'badge-danger',
    'Draft':'badge-muted','Admin':'badge-purple','Manager':'badge-info','Agent':'badge-muted',
    'Work':'badge-success','Off':'badge-muted','Annual':'badge-purple',
    'Sick':'badge-danger','Casual':'badge-warning','PH':'badge-info','Task':'badge-blue'
  };
  return `<span class="badge ${map[status]||'badge-muted'}">${status}</span>`;
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
}
function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function formatTime(t) {
  if (!t) return '-';
  return t.substring(0,5);
}
function debounce(fn, delay=300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(()=>fn(...args), delay); };
}

// ═══════════════════════════════════════════
// NOS Admin — Theme Toggle
// ═══════════════════════════════════════════

(function initTheme() {
  const saved = localStorage.getItem('nos-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('nos-theme', next);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = next === 'dark'
    ? '<i class="fas fa-moon"></i>'
    : '<i class="fas fa-sun"></i>';
}

function applyThemeIcon() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = current === 'dark'
    ? '<i class="fas fa-moon"></i>'
    : '<i class="fas fa-sun"></i>';
}

// ═══════════════════════════════════════════
// NOS Admin — Sidebar
// ═══════════════════════════════════════════
function renderSidebar() {
  const path   = window.location.pathname;
  const isRoot = path.endsWith('index.html') || path.endsWith('/admin/') || path.endsWith('/admin');
  const base   = isRoot ? '' : '../';

  const items = [
    { section: 'MAIN' },
    { label: 'Dashboard',     key: 'dashboard',      icon: 'fa-tachometer-alt', href: base + 'index.html' },
    { label: 'Agents',        key: 'agents',         icon: 'fa-users',          href: base + 'pages/agents.html' },
    { label: 'Annual Leave',  key: 'annual-leave',   icon: 'fa-umbrella-beach', href: base + 'pages/annual-leave.html' },
    { label: 'Schedule',      key: 'schedule',       icon: 'fa-calendar-alt',   href: base + 'pages/schedule.html' },
    { label: 'Schedule Audit',key: 'schedule-audit', icon: 'fa-chart-gantt',    href: base + 'pages/schedule-audit.html' },
    { label: 'Breaks',        key: 'breaks',         icon: 'fa-coffee',         href: base + 'pages/breaks.html' },
    { section: 'Operations' },
    { label: 'Requests',      key: 'requests',       icon: 'fa-file-alt',       href: base + 'pages/requests.html', badge: 'pending-count' },
    { label: 'KPIs',          key: 'kpis',           icon: 'fa-chart-line',     href: base + 'pages/kpis.html' },
    { label: 'Excuses',       key: 'excuses',        icon: 'fa-clock',          href: base + 'pages/excuses.html' },
    { label: 'Adherence',     key: 'adherence',      icon: 'fa-user-check',     href: base + 'pages/adherence.html' },
    { label: 'Waiving',       key: 'waiving',        icon: 'fa-hand-holding-heart', href: base + 'pages/waiving.html' },
    { label: 'xCALLY Live',   key: 'xcally-live',    icon: 'fa-satellite-dish', href: base + 'pages/xcally-live.html' },
    { label: 'xCALLY Import', key: 'xcally-import',  icon: 'fa-upload',         href: base + 'pages/xcally-import.html' },
    { label: 'xCALLY Reports', key: 'xcally-reports', icon: 'fa-chart-pie',      href: base + 'pages/xcally-reports.html' },
    { label: 'FCR Analytics',  key: 'fcr',            icon: 'fa-redo',           href: base + 'pages/fcr.html' },
    { label: 'Quality',       key: 'quality',        icon: 'fa-star',           href: base + 'pages/quality.html' },
    { label: 'Call Log',      key: 'calllog',        icon: 'fa-phone-alt',      href: base + 'pages/calllog.html' },
    { section: 'Config' },
    { label: 'Audit Log',     key: 'audit-log',      icon: 'fa-clipboard-list', href: base + 'pages/audit-log.html' },
    { label: 'Reference',     key: 'reference',      icon: 'fa-database',       href: base + 'pages/reference.html' },
    { label: 'Reports',       key: 'reports',        icon: 'fa-chart-bar',      href: base + 'pages/reports.html' },
    { label: 'HR Report',     key: 'hr-report',      icon: 'fa-file-medical-alt', href: base + 'pages/hr-report.html' },
    { label: 'Users',         key: 'users',          icon: 'fa-user-shield',    href: base + 'pages/users.html' },
  ];

  // ── فلترة العناصر حسب صلاحيات المستخدم ──
  const _session = (typeof getSession === 'function') ? getSession() : null;
  const visible  = items.filter(item => {
    if (item.section) return true;
    if (!_session)    return false;
    return (typeof hasPermission === 'function') ? hasPermission(_session, item.key) : true;
  });

  // شيل أي عنوان قسم مفيش تحته أي صفحة ظاهرة
  const filtered = visible.filter((item, i) => {
    if (!item.section) return true;
    const next = visible.slice(i + 1);
    const untilNextSection = [];
    for (const n of next) { if (n.section) break; untilNextSection.push(n); }
    return untilNextSection.length > 0;
  });

  const currentFile = path.split('/').pop() || 'index.html';

  let nav = '';
  filtered.forEach(item => {
    if (item.section) {
      nav += `<div class="nav-section">${item.section}</div>`;
    } else {
      const itemFile = item.href.split('/').pop();
      const isActive = currentFile === itemFile ? 'active' : '';
      const badge    = item.badge ? `<span class="nav-badge" id="${item.badge}">0</span>` : '';
      nav += `
        <a class="nav-item ${isActive}" href="${item.href}">
          <div class="nav-icon"><i class="fas ${item.icon}"></i></div>
          <span class="nav-label">${item.label}</span>
          ${badge}
        </a>`;
    }
  });

  const aside = document.getElementById('sidebar');
  if (!aside) return;

  aside.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-logo">
        <img src="${base}logo.png" alt="NOS Logo" style="width:100%;height:100%;object-fit:contain;border-radius:11px;">
      </div>
      <div class="brand-text">
        <div class="brand-name">NATIONS OF SKY</div>
        <div class="brand-sub">ADMIN PANEL</div>
      </div>
    </div>
    <nav class="sidebar-nav">${nav}</nav>
    <div class="sidebar-footer">
      <button class="logout-btn" style="margin-bottom:8px; background:transparent; border:1px solid var(--border); color:var(--muted);"
              onclick="window.location.href = base + 'change-password.html'"
              onmouseover="this.style.color='var(--gold)'; this.style.borderColor='var(--gold)';"
              onmouseout="this.style.color='var(--muted)'; this.style.borderColor='var(--border)';">
        <i class="fas fa-key"></i> Change Password
      </button>
      <button class="logout-btn" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> Sign Out
      </button>
    </div>`;

  // Scroll active nav item into view automatically
  const activeItem = aside.querySelector('.nav-item.active');
  if (activeItem) {
    setTimeout(() => {
      activeItem.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, 50);
  }
}

// ═══════════════════════════════════════════
// NOS Admin — Date Helpers
// ═══════════════════════════════════════════
function getWeekStart() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const d = new Date(today + 'T12:00:00');
  const diff = d.getDate() - d.getDay(); // Sunday = 0
  d.setDate(diff);
  return d.toLocaleDateString('en-CA');
}

function getWeekEnd() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const d = new Date(today + 'T12:00:00');
  const diff = d.getDate() - d.getDay() + 6; // Saturday
  d.setDate(diff);
  return d.toLocaleDateString('en-CA');
}

function getToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}
