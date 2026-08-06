// ═══════════════════════════════════════════
// NOS Admin — Audit Log helper
// ═══════════════════════════════════════════
// fire-and-forget: لو التسجيل فشل، العملية الأساسية ما بتتأثرش

async function logAudit({ module, action, description, targetTable = null, targetId = null, oldValue = null, newValue = null }) {
  try {
    const raw = sessionStorage.getItem('nos-admin') || sessionStorage.getItem('nos-quality');
    const who = raw ? (JSON.parse(raw).username || 'Unknown') : 'Unknown';
    await db.from('audit_log').insert({
      admin_username: who,
      action,                                   // INSERT / UPDATE / DELETE / IMPORT
      module,                                   // Schedule / Adherence / Waiving / xCally Import / Annual Leave
      target_table: targetTable,
      target_id: targetId ? String(targetId) : null,
      description,
      old_value: oldValue,
      new_value: newValue,
      page: window.location.pathname.split('/').pop(),
    });
  } catch (e) {
    console.warn('[audit] failed:', e?.message || e);
  }
}
