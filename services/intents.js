// ============================================================
// services/intents.js
// Detección de intención del mensaje del usuario para que el bot
// sepa si debe: dar información, agendar, cancelar, reagendar,
// consultar disponibilidad o derivar a un asesor humano.
// ============================================================

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Intención: agendar una cita (nueva)
function esAgendar(texto) {
  const t = normalizar(texto);
  const verbo = /(agendar|agendrar|agewndar|agenwdar|reservar|apartar|programar|schedule|book)/;
  return /(quiero|necesito|me gustaria|quisiera|deseo|puedo|queria|debo|i want|i need|i would like).*(agendar|agendrar|agewndar|agenwdar|agenda|cita|reservar|apartar|programar|schedule|book)/.test(t) ||
         (verbo.test(t) || /^(cita|citas|appointment|appointments)$/.test(t)) && !/(cancel|anular|reagend|regaend|reprogram|reschedul)/.test(t);
}

// Intención: cancelar una cita
function esCancelar(texto) {
  const t = normalizar(texto);
  return /(cancelar|canselar|cancel|cancelacion|anular|no podre|no voy a poder|no asistire|eliminar cita)/.test(t);
}

// Intención: reagendar / reprogramar una cita
function esReagendar(texto) {
  const t = normalizar(texto);
  return /(reagendar|regaendar|reagendrar|reprogramar|reschedule|rescheduling|cambiar.*(fecha|hora|cita)|posponer|cambiar mi cita|mover.*cita)/.test(t);
}

// Intención: consultar disponibilidad
function esConsultarDisponibilidad(texto) {
  const t = normalizar(texto);
  return /(disponibilidad|availability|horarios|horario|available time|available day|dias disponibles|que dias|a que hora|que horas|agenda disponible|tienen cupo|tienen espacio|tienen turno)/.test(t);
}

// Intención: hablar con un asesor humano
function esHablarConAsesor(texto) {
  const t = normalizar(texto);
  return /(asesor|persona|humano|alguien|agente|representante|hablar con|contactar.*(persona|asesor)|telefono|llamar)/.test(t) &&
         !/(info|informacion|cuanto|que ofrecen)/.test(t);
}

function detectarIntencion(texto) {
  if (esCancelar(texto)) return 'cancelar_cita';
  if (esReagendar(texto)) return 'reagendar_cita';
  if (esConsultarDisponibilidad(texto)) return 'consultar_disponibilidad';
  if (esAgendar(texto)) return 'agendar_cita';
  if (esHablarConAsesor(texto)) return 'hablar_asesor';
  return 'informacion';
}

module.exports = {
  detectarIntencion,
  esAgendar,
  esCancelar,
  esReagendar,
  esConsultarDisponibilidad,
  esHablarConAsesor,
};
