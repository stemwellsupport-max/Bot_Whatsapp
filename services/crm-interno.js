// ============================================================
// services/crm-interno.js
// Puerta interna del CRM para reservar sesiones de paquetes
// (rehabilitacion, recuperacion muscular, presoterapia, camara, combos).
//
// El bot NO escribe esas citas por su cuenta: las pide al CRM, que aplica
// las mismas reglas que recepcion (cupo por tipo, un dia por sesion, choques
// de horario del medico). Se autentica con BOT_INTERNAL_KEY (igual en el CRM).
// ============================================================
const axios = require('axios');

const BASE = (process.env.CRM_API_URL || 'http://api:8001').replace(/\/$/, '');
const KEY = process.env.BOT_INTERNAL_KEY || '';

async function llamar(method, path, { params, data } = {}) {
  if (!KEY) return { ok: false, status: 0, detail: 'BOT_INTERNAL_KEY sin configurar' };
  try {
    const r = await axios({ method, url: BASE + path, params, data, timeout: 20000, headers: { 'X-Bot-Key': KEY } });
    return { ok: true, status: r.status, data: r.data };
  } catch (e) {
    const status = e.response ? e.response.status : 0;
    const detail = (e.response && e.response.data && e.response.data.detail) || e.message;
    console.error(`CRM_INTERNO ${method} ${path} -> ${status} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    return { ok: false, status, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  }
}

// Sesiones por agendar de un servicio: { opciones: [{paquete_id, paquete, componente, etiqueta, restantes}] }
const sesionesPorAgendar = (leadId, servicio) => llamar('get', `/bot-interno/sesiones/${leadId}`, { params: { servicio } });
// Horas libres de un dia (YYYY-MM-DD) para el paquete: { libres: ['08:00', ...] }
const horariosLibres = (paqueteId, fecha) => llamar('get', '/bot-interno/horarios', { params: { paquete_id: paqueteId, fecha } });
// Reserva una sesion
const agendarSesion = ({ leadId, paqueteId, fecha, hora, componente }) =>
  llamar('post', '/bot-interno/sesiones/agendar', { data: { lead_id: leadId, paquete_id: paqueteId, fecha, hora, componente: componente || null } });

// Sin paquete: deja la solicitud (servicio, bono y disponibilidad) para que recepcion confirme y cobre
const solicitudSesiones = ({ leadId, servicio, bono, detalle }) =>
  llamar('post', '/bot-interno/solicitudes', { data: { lead_id: leadId, servicio, bono, detalle: detalle || '' } });

module.exports = { sesionesPorAgendar, horariosLibres, agendarSesion, solicitudSesiones };
