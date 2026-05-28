// ══════════════════════════════════════════════════════════
// STEMWELL - MOTOR DE APRENDIZAJE LOCAL
// Aprende de cada conversación y mejora con el tiempo
// ══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const MEMORIA_FILE = path.join(__dirname, '..', 'memoria_preguntas.json');

function cargarMemoria() {
  try {
    if (fs.existsSync(MEMORIA_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORIA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { preguntas: [], respuestas: {} };
}

function guardarMemoria(memoria) {
  fs.writeFileSync(MEMORIA_FILE, JSON.stringify(memoria, null, 2));
}

function guardarPreguntaNoRespondida(pregunta, telefono) {
  const memoria = cargarMemoria();
  // Evitar duplicados
  const yaExiste = memoria.preguntas.find(p => p.pregunta.toLowerCase() === pregunta.toLowerCase());
  if (!yaExiste) {
    memoria.preguntas.push({
      pregunta,
      telefono,
      fecha: new Date().toISOString(),
      respondida: false
    });
    guardarMemoria(memoria);
    console.log(`📝 Nueva pregunta guardada para aprendizaje: "${pregunta}"`);
  }
}

function guardarRespuesta(pregunta, respuesta) {
  const memoria = cargarMemoria();
  const preguntaLimpia = pregunta.toLowerCase().trim();
  memoria.respuestas[preguntaLimpia] = respuesta;
  
  // Marcar como respondida en la lista
  const pendiente = memoria.preguntas.find(p => p.pregunta.toLowerCase() === preguntaLimpia);
  if (pendiente) pendiente.respondida = true;
  
  guardarMemoria(memoria);
  console.log(`✅ Respuesta aprendida: "${preguntaLimpia}"`);
}

function buscarRespuestaLocal(pregunta) {
  const memoria = cargarMemoria();
  const preguntaLimpia = pregunta.toLowerCase().trim();
  
  // 1. Búsqueda exacta
  if (memoria.respuestas[preguntaLimpia]) {
    console.log(`🧠 Respuesta encontrada (exacta): "${preguntaLimpia}"`);
    return memoria.respuestas[preguntaLimpia];
  }
  
  // 2. Búsqueda por palabras clave (al menos 2 coincidencias)
  const palabras = preguntaLimpia.split(' ').filter(p => p.length > 3);
  for (const [preg, resp] of Object.entries(memoria.respuestas)) {
    const coincidencias = palabras.filter(p => preg.includes(p));
    if (coincidencias.length >= 2) {
      console.log(`🧠 Respuesta encontrada (similar): "${preg}"`);
      return resp;
    }
  }
  
  return null;
}

function getEstadisticas() {
  const memoria = cargarMemoria();
  return {
    totalPreguntas: memoria.preguntas.length,
    preguntasSinResponder: memoria.preguntas.filter(p => !p.respondida).length,
    respuestasAprendidas: Object.keys(memoria.respuestas).length
  };
}

function getPreguntasSinResponder() {
  const memoria = cargarMemoria();
  return memoria.preguntas.filter(p => !p.respondida);
}

function getTodasRespuestas() {
  const memoria = cargarMemoria();
  return memoria.respuestas;
}

module.exports = {
  buscarRespuestaLocal,
  guardarPreguntaNoRespondida,
  guardarRespuesta,
  getEstadisticas,
  getPreguntasSinResponder,
  getTodasRespuestas
};