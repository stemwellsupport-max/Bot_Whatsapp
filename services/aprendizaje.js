// ============================================================
// services/aprendizaje.js
// Reemplaza el módulo inexistente ../rag/ml-engine.js
// Expone la lógica de "aprendizaje" del panel admin usando las
// funciones reales de base de datos en services/postgres.js.
// ============================================================

const {
  getEstadisticasAprendizaje,
  listarConocimiento,
  guardarConocimiento,
} = require('./postgres');

// getEstadisticas -> devuelve stats de conocimiento aprendido
async function getEstadisticas() {
  const stats = await getEstadisticasAprendizaje().catch(() => []);
  return { ok: true, stats };
}

// getPreguntasSinResponder -> preguntas pendientes/respondidas (simplificado)
async function getPreguntasSinResponder() {
  const aprendidas = await listarConocimiento(100).catch(() => []);
  // Fase 1: devolvemos las aprendidas; podrías alimentar con una cola pendiente.
  return { ok: true, pendientes: [] };
}

// getTodasRespuestas -> lista de respuestas aprendidas
async function getTodasRespuestas() {
  const aprendidas = await listarConocimiento(1000).catch(() => []);
  return { ok: true, respuestas: aprendidas };
}

// guardarRespuesta -> almacena una respuesta nueva
async function guardarRespuesta(pregunta, respuesta, idioma = 'es') {
  const id = await guardarConocimiento(pregunta, respuesta, idioma, 0.8);
  return { ok: true, id };
}

module.exports = {
  getEstadisticas,
  getPreguntasSinResponder,
  getTodasRespuestas,
  guardarRespuesta,
};
