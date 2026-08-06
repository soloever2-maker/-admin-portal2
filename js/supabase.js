// ═══════════════════════════════════════════
// NOS Admin — Supabase Config
// ✅ المفتاح هنا هو anon (public) — آمن يظهر في المتصفح
//    لأن كل الجداول محمية بـ RLS ومحتاجة لوجين
// ═══════════════════════════════════════════

const SUPABASE_URL = 'https://xzxdaupwwwdcwfnqweub.supabase.co';

// ── المفتاح الجديد (publishable) من:
// Supabase Dashboard → Project Settings → API Keys → Publishable key
// ⚠️ متحطش أي مفتاح secret أو service_role هنا أبداً
const SUPABASE_KEY = 'sb_publishable_o6WgAntCWj8sD9jBhQQ0Tw_FA3GngrR';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,       // السيشن الحقيقية (JWT) بتتخزن وبتتجدد تلقائي
    autoRefreshToken: true,
    storageKey: 'nos-admin-auth',  // ⚠️ مفتاح مختلف عن الـ Agent Portal ('ns-auth-session') — يمنع أي تداخل
  }
});
window.db = db;
