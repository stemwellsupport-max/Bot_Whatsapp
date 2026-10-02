// ============================================================
// services/claude.js
// Cliente para Claude (Anthropic API) como alternativa/fallback
// a DeepSeek y LM Studio para la respuesta de la IA del bot.
// Misma interfaz que services/deepseek.js (responderX(mensaje, idioma, historial))
// para poder enchufarlo en ia-local.js sin tocar su orquestación.
// La personalidad y las reglas viven en sofia-prompt.js (compartidas).
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { systemPrompt, armarMensajes } = require('./sofia-prompt');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
// Opus 5 by default per Anthropic's own guidance (never silently downgrade
// for cost) - but this is a high-volume, short, simple-chat workload, so
// CLAUDE_MODEL is deliberately overridable via env if the team decides the
// cost/quality tradeoff differently for this specific bot.
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

async function responderClaude(mensajeUsuario, idioma, historial) {
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY no configurada');
  }
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: systemPrompt(idioma),
    messages: armarMensajes(historial, mensajeUsuario),
  });
  const respuesta = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!respuesta || respuesta.length < 10) throw new Error('Empty Claude response');
  return respuesta;
}

module.exports = { responderClaude };
