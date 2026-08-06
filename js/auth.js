// ═══════════════════════════════════════════
// NOS Admin — Auth & Permissions
// اللوجين الحقيقي: Supabase Auth (JWT)
// الـ sessionStorage فيه "لقطة" سريعة (اسم/رول/صلاحيات) للفحص الفوري
// ═══════════════════════════════════════════
const BASE = '/admin-portal2';
const EMAIL_DOMAIN = 'nationsofsky.com';  // اليوزرنيم + الدومين ده = الإيميل الحقيقي

// ── مفاتيح الصفحات (نفسها المستخدمة في الصلاحيات والسايدبار) ──
// اسم الملف من غير .html هو مفتاح الصلاحية — index = dashboard
const PAGE_KEYS = [
  'dashboard','agents','annual-leave','schedule','schedule-audit','breaks',
  'requests','kpis','excuses','adherence','waiving',
  'xcally-live','xcally-import','xcally-reports','fcr',
  'quality','calllog','audit-log','reference','reports','hr-report','users'
];

// ترتيب الصفحات عشان نوجّه المستخدم لأول صفحة مسموحة له
const PAGE_URLS = {
  'dashboard':      'index.html',
  'agents':         'pages/agents.html',
  'annual-leave':   'pages/annual-leave.html',
  'schedule':       'pages/schedule.html',
  'schedule-audit': 'pages/schedule-audit.html',
  'breaks':         'pages/breaks.html',
  'requests':       'pages/requests.html',
  'kpis':           'pages/kpis.html',
  'excuses':        'pages/excuses.html',
  'adherence':      'pages/adherence.html',
  'waiving':        'pages/waiving.html',
  'xcally-live':    'pages/xcally-live.html',
  'xcally-import':  'pages/xcally-import.html',
  'xcally-reports': 'pages/xcally-reports.html',
  'fcr':            'pages/fcr.html',
  'quality':        'pages/quality.html',
  'calllog':        'pages/calllog.html',
  'audit-log':      'pages/audit-log.html',
  'reference':      'pages/reference.html',
  'reports':        'pages/reports.html',
  'hr-report':      'pages/hr-report.html',
  'users':          'pages/users.html'
};

// ── قراءة اللقطة المخزنة ────────────────────────────────────
function getSession() {
  const raw = sessionStorage.getItem('nos-admin');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveSessionSnapshot(profile) {
  sessionStorage.setItem('nos-admin', JSON.stringify({
    uid:         profile.id,
    username:    profile.username,
    fullName:    profile.full_name || profile.username,
    role:        profile.role,
    permissions: profile.permissions || [],
    loginTime:   Date.now()
  }));
}

// ── هل عنده صلاحية على صفحة معينة؟ ─────────────────────────
function hasPermission(session, pageKey) {
  if (!session) return false;
  if (session.role === 'super_admin') return true;              // السوبر أدمن يشوف كل حاجة
  if (pageKey === 'users') return false;                        // صفحة اليوزرز للسوبر أدمن بس
  return Array.isArray(session.permissions) && session.permissions.includes(pageKey);
}

// مفتاح الصفحة الحالية من الـ URL
function currentPageKey() {
  const file = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');
  return file === 'index' || file === '' ? 'dashboard' : file;
}

// أول صفحة مسموحة للمستخدم (للتوجيه بعد اللوجين أو عند الرفض)
function firstAllowedUrl(session) {
  const isRoot = !window.location.pathname.includes('/pages/');
  const base   = isRoot ? '' : '../';
  for (const key of PAGE_KEYS) {
    if (key === 'users' && session.role !== 'super_admin') continue;
    if (hasPermission(session, key)) return base + PAGE_URLS[key];
  }
  return null; // مفيش أي صلاحية
}

// ═══════════════════════════════════════════
// الفحص الرئيسي — كل صفحة بتناديه أول ما تفتح
// ═══════════════════════════════════════════
function checkAuth() {
  const session = getSession();
  if (!session) { window.location.replace(BASE + '/login.html'); return null; }

  // فحص الصلاحية على الصفحة الحالية
  const key = currentPageKey();
  if (!hasPermission(session, key)) {
    const target = firstAllowedUrl(session);
    if (target) {
      window.location.replace(target + '?denied=1');
    } else {
      // مفيش أي صلاحيات — خروج
      forceSignOut();
    }
    return null;
  }

  // فحص غير متزامن في الخلفية: السيشن الحقيقية + آخر نسخة من الصلاحيات
  validateSessionAsync();

  return session;
}

// ── التحقق من السيشن الحقيقية وتحديث الصلاحيات ──────────────
async function validateSessionAsync() {
  if (!window.db) return;
  try {
    const { data: { session: authSession } } = await db.auth.getSession();
    if (!authSession) { forceSignOut(); return; }

    const { data: profile, error } = await db
      .from('portal_users')
      .select('*')
      .eq('id', authSession.user.id)
      .single();

    if (error || !profile || !profile.is_active) { forceSignOut(); return; }

    // لازم يغير الباسورد؟
    if (profile.must_change_password && !window.location.pathname.includes('change-password')) {
      saveSessionSnapshot(profile);
      const isRoot = !window.location.pathname.includes('/pages/');
      window.location.replace((isRoot ? '' : '../') + 'change-password.html');
      return;
    }

    // حدّث اللقطة (لو السوبر أدمن غيّر صلاحياته وهو فاتح)
    const old = getSession();
    saveSessionSnapshot(profile);
    const key = currentPageKey();
    if (old && !hasPermission({ role: profile.role, permissions: profile.permissions }, key)) {
      const target = firstAllowedUrl({ role: profile.role, permissions: profile.permissions });
      if (target) window.location.replace(target + '?denied=1');
      else forceSignOut();
    }
  } catch (e) {
    // مشكلة شبكة مؤقتة — منطردش المستخدم
    console.warn('Session validation skipped:', e);
  }
}

// ── الخروج ──────────────────────────────────────────────────
async function forceSignOut() {
  try { if (window.db) await db.auth.signOut({ scope: 'local' }); } catch (e) {}
  sessionStorage.removeItem('nos-admin');
  sessionStorage.removeItem('nos-quality');
  sessionStorage.removeItem(IDLE_KEY);
  window.location.replace(BASE + '/login.html');
}

function logout() { forceSignOut(); }

function getAdminName() {
  const s = getSession();
  return s ? (s.fullName || s.username || 'Admin') : 'Admin';
}

// ═══════════════════════════════════════════
// Quality-Only Auth (متوافق مع الكود القديم)
// مستخدم الـ quality بقى مستخدم عادي معاه صلاحية quality بس
// ═══════════════════════════════════════════
function checkQualityAuth() {
  const s = getSession();
  if (!s) { window.location.replace(BASE + '/login.html'); return null; }
  if (!hasPermission(s, 'quality')) {
    const target = firstAllowedUrl(s);
    if (target) window.location.replace(target + '?denied=1'); else forceSignOut();
    return null;
  }
  validateSessionAsync();
  // qualityOnly = معندوش غير صلاحية quality
  const onlyQuality = s.role !== 'super_admin'
    && Array.isArray(s.permissions)
    && s.permissions.filter(p => p !== 'quality').length === 0;
  return { ...s, qualityOnly: onlyQuality };
}

function logoutQuality() { forceSignOut(); }

// ═══════════════════════════════════════════
// bfcache Protection — الرجوع بزرار Back بعد الخروج
// ═══════════════════════════════════════════
window.addEventListener('pageshow', function (e) {
  if (!e.persisted) return;
  const path = window.location.pathname;
  if (path.includes('login.html')) return;
  if (!sessionStorage.getItem('nos-admin')) {
    document.body.style.visibility = 'hidden';
    window.location.replace(BASE + '/login.html');
  }
});

// ═══════════════════════════════════════════
// Idle Session Timeout — خروج تلقائي بعد فترة عدم استخدام
// ═══════════════════════════════════════════
const IDLE_TIMEOUT_MINUTES = 30;           // ← غيّر المدة من هنا
const IDLE_KEY = 'nos-last-activity';

(function initIdleTimeout() {
  const path = window.location.pathname;
  if (path.includes('login.html')) return;
  if (!sessionStorage.getItem('nos-admin')) return;

  const LIMIT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
  let idleTimer = null;
  let lastWrite = 0;

  function recordActivity() {
    const now = Date.now();
    if (now - lastWrite > 5000) {
      sessionStorage.setItem(IDLE_KEY, String(now));
      lastWrite = now;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(forceSignOut, LIMIT_MS);
  }

  function checkStoredIdle() {
    const last = Number(sessionStorage.getItem(IDLE_KEY) || Date.now());
    if (Date.now() - last > LIMIT_MS) { forceSignOut(); return true; }
    return false;
  }

  if (checkStoredIdle()) return;

  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt =>
    document.addEventListener(evt, recordActivity, { passive: true })
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!checkStoredIdle()) recordActivity();
    }
  });

  recordActivity();
})();
