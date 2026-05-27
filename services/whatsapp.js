const axios = require('axios');

const META_TOKEN      = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const API_VERSION     = 'v19.0';
const BASE_URL        = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const HEADERS = () => ({
  Authorization:  `Bearer ${META_TOKEN}`,
  'Content-Type': 'application/json',
});

// ── Texto simple ─────────────────────────────────────────
async function sendMessage(to, text) {
  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }, { headers: HEADERS() });
    console.log(`✅ Enviado → ${to}`);
  } catch (error) {
    console.error('❌ sendMessage:', error.response?.data || error.message);
    throw error;
  }
}

// ── Botones (máx 3) ──────────────────────────────────────
// WhatsApp SOLO permite 3 botones. Si pasas más, usa sendList.
async function sendButtons(to, bodyText, buttons = []) {
  // Limitar a 3 y truncar títulos a 20 chars
  const safeButtons = buttons.slice(0, 3).map((btn, i) => ({
    type:  'reply',
    reply: {
      id:    `btn_${i}_${Date.now()}`,
      title: String(btn).slice(0, 20),
    },
  }));

  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: { buttons: safeButtons },
      },
    }, { headers: HEADERS() });
    console.log(`✅ Botones → ${to}`);
  } catch (error) {
    // Fallback: texto plano numerado
    console.warn('⚠️ Botones fallaron, enviando texto:', error.response?.data?.error?.message);
    const fallback = bodyText + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b}`).join('\n');
    await sendMessage(to, fallback);
  }
}

// ── Lista interactiva (hasta 10 opciones) ────────────────
// Úsala cuando tengas más de 3 opciones.
// sections = [{ title: 'Sección', rows: [{ id, title, description? }] }]
async function sendList(to, bodyText, buttonLabel, sections) {
  // Validar y truncar
  const safeSections = sections.map(s => ({
    title: String(s.title || '').slice(0, 24),
    rows:  (s.rows || []).slice(0, 10).map((r, i) => ({
      id:          String(r.id || `row_${i}`).slice(0, 200),
      title:       String(r.title || '').slice(0, 24),
      description: String(r.description || '').slice(0, 72),
    })),
  }));

  try {
    await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button:   String(buttonLabel).slice(0, 20),
          sections: safeSections,
        },
      },
    }, { headers: HEADERS() });
    console.log(`✅ Lista → ${to}`);
  } catch (error) {
    console.warn('⚠️ Lista falló, enviando texto:', error.response?.data?.error?.message);
    const items = sections.flatMap(s => s.rows.map(r => `• ${r.title}`));
    await sendMessage(to, bodyText + '\n\n' + items.join('\n'));
  }
}

module.exports = { sendMessage, sendButtons, sendList };