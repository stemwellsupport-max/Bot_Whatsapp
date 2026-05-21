const axios = require('axios');

const META_TOKEN      = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const API_VERSION     = 'v19.0';
const BASE_URL        = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const HEADERS = () => ({
  Authorization:  `Bearer ${META_TOKEN}`,
  'Content-Type': 'application/json',
});

// ── Mensaje de texto simple ──────────────────────────────
async function sendMessage(to, text) {
  try {
    const res = await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }, { headers: HEADERS() });
    console.log(`✅ Enviado → ${to}`);
    return res.data;
  } catch (error) {
    console.error('❌ Error sendMessage:', error.response?.data || error.message);
    throw error;
  }
}

// ── Mensaje con botones (máx 3) ──────────────────────────
async function sendButtons(to, bodyText, buttons = []) {
  try {
    const res = await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((btn, i) => ({
            type:  'reply',
            reply: { id: `btn_${i}`, title: String(btn).slice(0, 20) },
          })),
        },
      },
    }, { headers: HEADERS() });
    return res.data;
  } catch (error) {
    // Si falla el interactivo, manda texto plano como fallback
    console.warn('⚠️  Botones fallaron, enviando texto:', error.response?.data?.error?.message);
    await sendMessage(to, bodyText + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b}`).join('\n'));
  }
}

// ── Lista de opciones (máx 10 items) ────────────────────
async function sendList(to, bodyText, buttonLabel, sections) {
  try {
    const res = await axios.post(BASE_URL, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonLabel,
          sections,
        },
      },
    }, { headers: HEADERS() });
    return res.data;
  } catch (error) {
    console.warn('⚠️  Lista falló, enviando texto:', error.response?.data?.error?.message);
    const items = sections.flatMap(s => s.rows.map(r => `• ${r.title}`));
    await sendMessage(to, bodyText + '\n\n' + items.join('\n'));
  }
}

module.exports = { sendMessage, sendButtons, sendList };