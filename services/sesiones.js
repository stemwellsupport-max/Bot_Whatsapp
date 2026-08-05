// ══════════════════════════════════════════════════════════
// STEMWELL - GESTOR DE SESIONES CONVERSACIONALES
// ══════════════════════════════════════════════════════════

const { obtenerEstado, guardarEstado, borrarEstado } = require('./agenda');

const SESION_DEFAULT = {
  paso:               'inicio',
  mensajes:           0,
  intencion:          null,
  dolor_zona:         null,
  dolor_tiempo:       null,
  enfermedad:         null,
  interesado_en:      null,
  nivel_interes:      'cold',
  quiere_agendar:     false,
  pidio_asesor:       false,
  vio_testimonios:    false,
  capturo_nombre:     false,
  capturo_email:      false,
  ultimo_cta:         null,
  hizo_pregunta:      false,
  esperando:          null,   // 'nombre' | 'email' | 'motivo' | 'datos_lead'
};

async function getSesion(telefono) {
  const guardada = await obtenerEstado(telefono, 'sesion');
  if (guardada) return { ...SESION_DEFAULT, ...guardada };
  return { ...SESION_DEFAULT };
}

async function setSesion(telefono, data) {
  const actual = await getSesion(telefono);
  const nueva = { ...actual, ...data };
  await guardarEstado(telefono, nueva, 'sesion');
}

async function resetSesion(telefono) {
  await borrarEstado(telefono, 'sesion');
}

module.exports = { getSesion, setSesion, resetSesion };