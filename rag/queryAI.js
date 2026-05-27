// ══════════════════════════════════════════════════════════
// STEMWELL - RAG: CONSULTA A LA BASE DE CONOCIMIENTO MÉDICA
// Usa pgvector + Anthropic API para respuestas contextuales
// ══════════════════════════════════════════════════════════
const { responderConIA } = require('../rag/queryAI');
const { pool } = require('../services/postgres');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// ── GENERAR EMBEDDING (texto → vector) ───────────────────
// Usamos Voyage AI (recomendado por Anthropic) o puedes
// cambiar por OpenAI text-embedding-3-small
async function getEmbedding(texto) {
  // Si no hay API de embeddings configurada, retorna null
  // y el RAG usará búsqueda por palabras clave como fallback
  const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
  if (!VOYAGE_KEY) return null;

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_KEY}`,
    },
    body: JSON.stringify({
      input: [texto],
      model: 'voyage-large-2',
    }),
  });
  const data = await res.json();
  return data?.data?.[0]?.embedding || null;
}

// ── BUSCAR CONTEXTO RELEVANTE ─────────────────────────────
async function buscarContextoRAG(pregunta, limite = 5) {
  try {
    const embedding = await getEmbedding(pregunta);

    if (embedding) {
      // Búsqueda semántica con pgvector
      const vectorStr = `[${embedding.join(',')}]`;
      const r = await pool.query(
        `SELECT contenido, fuente, categoria,
                1 - (embedding <=> $1::vector) AS similitud
         FROM rag_documentos
         WHERE activo = 1
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [vectorStr, limite]
      );
      return r.rows.filter(r => r.similitud > 0.7);
    } else {
      // Fallback: búsqueda por palabras clave (sin embeddings)
      const limpio = pregunta.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9 ]/g, ' ').trim();
      const palabras = limpio.split(' ').filter(p => p.length > 3).slice(0, 5);
      if (!palabras.length) return [];

      const conds = palabras
        .map((_, i) => `contenido ILIKE $${i + 1}`)
        .join(' OR ');
      const params = palabras.map(p => `%${p}%`);
      params.push(limite);

      const r = await pool.query(
        `SELECT contenido, fuente, categoria
         FROM rag_documentos
         WHERE activo = 1 AND (${conds})
         LIMIT $${palabras.length + 1}`,
        params
      );
      return r.rows;
    }
  } catch (err) {
    console.error('❌ RAG buscarContexto error:', err.message);
    return [];
  }
}

// ── RESPUESTA MÉDICA CON CONTEXTO ─────────────────────────
async function responderConRAG(pregunta, nombrePaciente, historialChat = []) {
  const contextoRows = await buscarContextoRAG(pregunta);
  const contexto = contextoRows
    .map(r => `[${r.fuente || r.categoria}]: ${r.contenido}`)
    .join('\n\n');

  const systemPrompt = `Eres el asistente médico virtual de Stemwell, una clínica de medicina regenerativa en Bogotá, Colombia. 

IDENTIDAD:
- Tu nombre es Sofia, asistente de Stemwell
- Diriges al Dr. Camilo White como Director Médico
- Clínica ubicada en Kr 13 #118-08, Santa Bárbara, Bogotá
- Teléfonos: (+57) 311 501 1920 / (+57) 314 807 9475
- Agenda de citas: ${process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN'}

ESPECIALIDADES DE STEMWELL:
- Medicina regenerativa (células madre mesenquimales, PRP, exosomas)
- Ortopedia y lesiones deportivas
- Dolor crónico y articular
- Longevidad y anti-aging
- Enfermedades neurológicas (Parkinson, EM, neuropatías)
- Enfermedades autoinmunes
- Salud cardiovascular
- Medicina funcional y sueroterapia

REGLAS CRÍTICAS:
1. SIEMPRE responde en español, de forma cálida y profesional
2. NUNCA prometas curas ni resultados garantizados
3. SIEMPRE menciona que cada caso es diferente
4. Cuando el paciente tenga dolor o enfermedad seria → invita a evaluación GRATUITA
5. Sé preciso médicamente, no inventures información
6. Máximo 3-4 párrafos por respuesta en WhatsApp
7. Usa emojis con moderación (máximo 2-3 por mensaje)
8. Si no sabes algo → di "nuestro equipo médico puede orientarte mejor"

CONTEXTO MÉDICO DISPONIBLE:
${contexto || 'No hay contexto específico para esta consulta. Responde con conocimiento general de Stemwell.'}`;

  const messages = [
    ...historialChat.slice(-6), // últimos 6 turnos como contexto
    { role: 'user', content: `${nombrePaciente} pregunta: ${pregunta}` },
  ];

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages,
    }),
  });

  const data = await res.json();
  return data?.content?.[0]?.text || null;
}

module.exports = { buscarContextoRAG, responderConRAG };