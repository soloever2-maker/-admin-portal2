/**
 * XCALLY Motion → Admin Portal Live Proxy
 * -----------------------------------------
 * بيعمل login على XCALLY ويجدد التوكن تلقائيًا،
 * وبيوفر endpoint واحد نضيف للبورتال: GET /live/agents
 *
 * تشغيل:
 *   npm install express node-fetch@2
 *   node xcally-proxy.js
 */

const express = require('express');
const fetch = require('node-fetch');
const https = require('https');

// ================== الإعدادات ==================
const XCALLY_URL = 'https://172.16.1.20';   // عنوان سيرفر XCALLY
const XCALLY_USER = 'admin';                 // يفضّل تعمل يوزر مخصص للـ API
const XCALLY_PASS = 'Fathy600*';
const PORT = 3055;
// ===============================================

// السيرتيفيكيت self-signed (زي ما ظاهر عندك "Not secure") فبنتجاوزه داخليًا
const agent = new https.Agent({ rejectUnauthorized: false });

const app = express();
let token = null;

async function login() {
  const res = await fetch(`${XCALLY_URL}/api/auth/local`, {
    method: 'POST',
    agent,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: XCALLY_USER, password: XCALLY_PASS }),
  });
  if (!res.ok) throw new Error(`XCALLY login failed: ${res.status}`);
  const data = await res.json();
  token = data.token;
  console.log('[xcally-proxy] logged in, token refreshed');
}

async function xcallyGet(path) {
  if (!token) await login();
  let res = await fetch(`${XCALLY_URL}${path}`, {
    agent,
    headers: { Authorization: `Bearer ${token}` },
  });
  // التوكن انتهى؟ نجدد ونحاول تاني مرة واحدة
  if (res.status === 401) {
    await login();
    res = await fetch(`${XCALLY_URL}${path}`, {
      agent,
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) throw new Error(`XCALLY ${path} failed: ${res.status}`);
  return res.json();
}

// CORS للبورتال بتاعك — حدد الدومين بتاع الأدمن بورتال هنا
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // غيّرها لدومين البورتال في الإنتاج
  next();
});

// نفس داتا صفحة Realtime > Agents
app.get('/live/agents', async (req, res) => {
  try {
    const data = await xcallyGet('/api/rpc/agents');
    // بنرجّع الحقول المهمة بس للفرونت
    const rows = (data.rows || data).map(a => ({
      id: a.id,
      name: a.fullname || a.name,
      internal: a.internal,
      online: a.online,
      status: a.status,               // حالة الصوت العامة
      voiceStatus: a.voiceStatus || a.status,
      pause: a.pause,
      pauseType: a.pauseType,
      loginTime: a.lastLoginAt,
      phoneStatus: a.phoneStatus,
      chatStatus: a.chatStatus,
      mailStatus: a.mailStatus,
      smsStatus: a.smsStatus,
      openchannelStatus: a.openchannelStatus,
      faxStatus: a.faxStatus,
      whatsappStatus: a.whatsappStatus,
    }));
    res.json({ ok: true, ts: Date.now(), agents: rows });
  } catch (err) {
    console.error('[xcally-proxy]', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ممكن تضيف endpoints زيادة بنفس الطريقة:
//   /api/rpc/voice/queues   → حالة الكيوهات لايف
//   /api/rpc/telephones     → التليفونات
//   /api/rpc/trunks         → الترنكات
app.get('/live/queues', async (req, res) => {
  try {
    res.json(await xcallyGet('/api/rpc/voice/queues'));
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`[xcally-proxy] running on http://localhost:${PORT}/live/agents`)
);
