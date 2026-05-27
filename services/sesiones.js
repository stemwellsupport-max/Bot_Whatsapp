// ══════════════════════════════════════════════════════════
// STEMWELL - GESTOR DE SESIONES CONVERSACIONALES
// ══════════════════════════════════════════════════════════

const sesiones = {};

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

function getSesion(telefono) {
  if (!sesiones[telefono]) {
    sesiones[telefono] = { ...SESION_DEFAULT };
  }
  return sesiones[telefono];
}

function setSesion(telefono, data) {
  sesiones[telefono] = { ...getSesion(telefono), ...data };
}

function resetSesion(telefono) {
  sesiones[telefono] = { ...SESION_DEFAULT };
}

module.exports = { getSesion, setSesion, resetSesion };