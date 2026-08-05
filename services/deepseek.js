// ============================================================
// services/deepseek.js
// Cliente para DeepSeek (API key) como alternativa/fallback a
// LM Studio para la respuesta de la IA del bot.
// ============================================================

const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_URL = process.env.DEEPSEEK_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

function _systemPrompt(idioma) {
  if (idioma === 'en') {
    return `You are Sofia, Stemwell Regenerative Medicine assistant in Bogotá, Colombia.
- Address: Kr 13 #118-08, Usaquén, Bogotá
- Phone: +57 310 406 8755
- Hours: Mon-Fri 8am-5pm, Sat 8am-12pm
- FREE evaluation: ${AGENDA_URL}
SERVICES: Stem Cells, PRP, Exosomes, Hyperbaric Chamber, IV Therapy, Longevity.
RULES: ONLY ENGLISH. Be warm and empathetic. NEVER claim cure or guarantee. Invite to book: ${AGENDA_URL}`;
  }
  return `Eres Sofía, asesora de Stemwell Medicina Regenerativa en Bogotá, Colombia.
- Dirección: Kr 13 #118-08, Usaquén, Bogotá
- Teléfono: +57 310 406 8755
- Horarios: Lunes a Viernes 8am-5pm, Sábados 8am-12pm
- Agenda SIN COSTO: ${AGENDA_URL}
SERVICIOS: Células Madre, PRP, Exosomas, Cámara Hiperbárica, Sueroterapia, Longevidad.
REGLAS: SOLO ESPAÑOL. Sé cálida y empática. NUNCA afirmes cura o garantía. Invita a agendar: ${AGENDA_URL}`;
}

async function responderDeepSeek(mensajeUsuario, idioma) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY no configurada');
  }
  const { data } = await axios.post(DEEPSEEK_URL, {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: _systemPrompt(idioma) },
      { role: 'user', content: mensajeUsuario },
    ],
    temperature: 0.5,
    max_tokens: 300,
  }, {
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    timeout: 30000,
  });
  const respuesta = data.choices?.[0]?.message?.content?.trim() || '';
  if (!respuesta || respuesta.length < 10) throw new Error('Empty DeepSeek response');
  return respuesta;
}

module.exports = { responderDeepSeek };
