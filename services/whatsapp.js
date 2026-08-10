const axios = require('axios');

const META_TOKEN      = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const API_VERSION     = 'v19.0';
const BASE_URL        = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const HEADERS = () => ({
  Authorization:  `Bearer ${META_TOKEN}`,
  'Content-Type': 'application/json',
});

function normalizarDestino(to) {
  const telefono = String(to || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(telefono)) {
    console.error('ENVIO_WHATSAPP_BLOQUEADO: destinatario ausente o invalido');
    return '';
  }
  return telefono;
}

// ── Texto simple ─────────────────────────────────────────
async function sendMessage(to, text, reintentos = 2) {
  to = normalizarDestino(to);
  if (!to) return false;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      await axios.post(BASE_URL, {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      }, { headers: HEADERS(), timeout: 15000 });
      console.log(`✅ Enviado → ${to}`);
      return true;
    } catch (error) {
      const detalle = error.response?.data?.error?.message || error.message;
      console.error(`❌ sendMessage (intento ${intento + 1}/${reintentos + 1}):`, detalle);
      // Si es error transitorio de red/DNS, reintentamos; si es token inválido o
      // error de API, no tiene sentido reintentar y NO debemos derribar el proceso.
      if (intento < reintentos && isTransientError(error)) {
        await new Promise(r => setTimeout(r, 1500 * (intento + 1)));
      } else {
        // Nunca lanzamos: un fallo de envío NO debe tumbar el bot.
        return false;
      }
    }
  }
  return false;
}

// Determina si un error es transitorio (red/DNS/timeout) y vale la pena reintentar.
function isTransientError(error) {
  if (!error) return false;
  const msg = (error.message || '') + ((error.code) ? ' ' + error.code : '');
  // Errores de resolución DNS, timeouts, ECONNRESET, etc.
  return /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNABORTED|socket hang up|timeout/i.test(msg);
}

// ── Botones (máx 3) ──────────────────────────────────────
// WhatsApp SOLO permite 3 botones. Si pasas más, usa sendList.
// Devuelve true si se envió con botones interactivos, false si se usó fallback.
async function sendButtons(to, bodyText, buttons = []) {
  to = normalizarDestino(to);
  if (!to) return false;
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
    }, { headers: HEADERS(), timeout: 15000 });
    console.log(`✅ Botones → ${to}`);
    return true;
  } catch (error) {
    // Fallback: texto plano numerado
    console.warn('⚠️ Botones fallaron, enviando texto:', error.response?.data?.error?.message);
    const fallback = bodyText + '\n\n' + buttons.slice(0, 3).map((b, i) => `${i + 1}. ${b}`).join('\n');
    await sendMessage(to, fallback);
    return false;
  }
}

// ── Lista interactiva (hasta 10 opciones) ────────────────
// Úsala cuando tengas más de 3 opciones.
// sections = [{ title: 'Sección', rows: [{ id, title, description? }] }]
async function sendList(to, bodyText, buttonLabel, sections) {
  to = normalizarDestino(to);
  if (!to) return false;
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

module.exports = { sendMessage, sendButtons, sendList, normalizarDestino };
