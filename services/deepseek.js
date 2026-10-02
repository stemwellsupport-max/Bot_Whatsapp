// ============================================================
// services/deepseek.js
// Cliente para DeepSeek (API key) como alternativa/fallback a
// LM Studio para la respuesta de la IA del bot.
// La personalidad y las reglas viven en sofia-prompt.js (compartidas).
// ============================================================

const axios = require('axios');
const { systemPrompt, armarMensajes } = require('./sofia-prompt');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_URL = process.env.DEEPSEEK_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function responderDeepSeek(mensajeUsuario, idioma, historial) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY no configurada');
  }
  const { data } = await axios.post(DEEPSEEK_URL, {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt(idioma) },
      ...armarMensajes(historial, mensajeUsuario),
    ],
    temperature: 0.5,
    max_tokens: 400,
  }, {
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    timeout: 30000,
  });
  const respuesta = data.choices?.[0]?.message?.content?.trim() || '';
  if (!respuesta || respuesta.length < 10) throw new Error('Empty DeepSeek response');
  return respuesta;
}

module.exports = { responderDeepSeek };
