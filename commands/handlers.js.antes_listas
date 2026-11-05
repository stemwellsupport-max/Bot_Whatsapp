// ============================================================
// commands/handlers.js - VERSION CON VALIDACION DE IDENTIDAD
// Flujo: agendar / cancelar / reagendar con validacion por
// email + telefono para identificar al paciente en el CRM.
// ============================================================

const { sendMessage, sendButtons, sendList } = require('../services/whatsapp');
const { upsertContactoBasico, logMensaje } = require('../services/postgres');
const { getSesion, setSesion } = require('../services/sesiones');
const { responderConIA, detectarIdioma, consumioFalloTotal } = require('../services/ia-local');
const { detectarIntencion } = require('../services/intents');
const agenda = require('../services/agenda');
const crmInterno = require('../services/crm-interno');
const identidad = require('../services/identidad');
const { isPaused, estaBloqueado, savePendingInbound, requestAdvisor, isBusinessHours } = require('../services/human-control');

// Pool reusado desde postgres.js para consultas de lectura
const { pool } = require('../services/postgres');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

function telefonoWhatsAppValido(valor) {
  const telefono = String(valor || '').replace(/\D/g, '');
  return /^\d{8,15}$/.test(telefono) ? telefono : '';
}

// Los formularios publicitarios pueden llegar al mismo webhook. Son avisos
// para ventas, no mensajes escritos por pacientes, y no deben entrar a la IA.
function esNotificacionFormularioCampana(texto) {
  const normalizado = String(texto || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const marcadores = [
    /^\s*full name\s*:/im,
    /^\s*phone number\s*:/im,
    /^\s*email\s*:/im,
    /^\s*inbox url\s*:/im,
    /^\s*especialidad medica\s*:/im,
    /con que frecuencia.*sala de cirugia/i,
    /cuando te gustaria recibir informacion/i,
  ].filter(regex => regex.test(normalizado)).length;
  const anunciaFormulario = /complete el formulario|completed the form|lead form|form submission/.test(normalizado);
  const contieneInbox = /^\s*inbox url\s*:/im.test(normalizado);
  return (anunciaFormulario && marcadores >= 2) || (contieneInbox && marcadores >= 3) || marcadores >= 5;
}

function pausaNatural() {
  const ms = Math.floor(Math.random() * 800) + 400;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Botones que acompañan CADA respuesta libre del bot, para que la persona
// siempre pueda agendar, hablar con un asesor o volver al menu con un toque.
// Los titulos coinciden con lo que ya reconoce el resto del flujo (intents.js
// y el comando global "menu"). WhatsApp limita el titulo a 20 caracteres.
function botonesContacto(idioma) {
  return idioma === 'en'
    ? ['Book appointment', 'Speak to an advisor', 'Menu']
    : ['Agendar cita', 'Hablar con un asesor', 'Menú'];
}

// Pone los botones de contacto en la respuesta. El cuerpo de un mensaje con
// botones admite ~1024 caracteres; si la respuesta es mas larga se envia como
// texto y los botones van en un mensaje corto aparte.
async function prepararRespuestaConBotones(telefono, nombre, respuesta, idioma) {
  const botones = botonesContacto(idioma);
  if (respuesta.length <= 900) return { texto: respuesta, botones };
  await pausaNatural();
  await sendMessage(telefono, respuesta);
  await logMensaje(telefono, nombre, 'salida', respuesta);
  return {
    texto: idioma === 'en' ? 'What would you like to do?' : '¿Qué te gustaría hacer?',
    botones,
  };
}

const PALABRAS_SALUDO = new Set(['hola', 'hello', 'hi', 'hey', 'buenas', 'buenos', 'dias', 'tardes', 'noches',
  'good', 'morning', 'afternoon', 'evening', 'que', 'tal', 'como', 'estas', 'estan', 'ok', 'okay', 'vale', 'listo']);

// Un mensaje "abierto" es una consulta real escrita con libertad (no un saludo
// ni una respuesta de una palabra). En ese caso el bot conversa en vez de
// volver a mostrar el menu.
function esConversacionAbierta(texto) {
  const palabras = normalizarAux(texto).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (palabras.length && palabras.every(p => PALABRAS_SALUDO.has(p))) return false;
  return parecePreguntaLibre(texto) || palabras.length >= 4;
}

const DIAS_ES = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function hoyLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatearFecha(fecha) {
  const d = new Date(fecha);
  return DIAS_ES[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_ES[d.getMonth()];
}

function normalizarAux(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

function parsearFecha(texto, ref) {
  const t = normalizarAux(texto);
  if (!ref) ref = hoyLocal();
  if (t.includes('hoy') || t.includes('para hoy')) return new Date(ref);
  if (t.includes('pasado manana')) {
    const d = new Date(ref); d.setDate(d.getDate() + 2); return d;
  }
  if (t.includes('manana')) {
    const d = new Date(ref); d.setDate(d.getDate() + 1); return d;
  }
  for (let i = 0; i < DIAS_ES.length; i++) {
    if (t.includes(DIAS_ES[i])) {
      const delta = i - ref.getDay();
      const d = new Date(ref); d.setDate(d.getDate() + (delta <= 0 ? delta + 7 : delta));
      return d;
    }
  }
  return null;
}

function esHoraValida(texto) {
  // Acepta: "17", "17:00", "17:00", "a las 5", "las 17", comillas, "hora/s"
  const t = normalizarAux(texto);
  const m = t.match(/(?:a\s+las|las|:)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:hrs?|horas?)?/);
  if (!m) return false;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h >= 0 && h <= 23 && min >= 0 && min < 60;
}

function extraerHora(texto) {
  const t = normalizarAux(texto);
  // Acepta: "10:00", "🕐 10:00", "a las 10", "10h"
  const m = t.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  // Solo horarios válidos de atención: 8:00 - 17:45
  if (h < 8 || h > 17 || min < 0 || min >= 60) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

// ── Reconocer si un texto parece un email ──────────────────
function esEmail(texto) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
}

// ── Responder disponibilidad de un dia ─────────────────────
async function responderDisponibilidad(telefono, fecha) {
  try {
    const { libres } = await agenda.getDisponibilidad({ pool, fecha });
    if (!libres || !libres.length) {
      return 'Lo siento, para ' + formatearFecha(fecha) + ' no hay horarios disponibles. 😔\n\nPuedes pedirme otro dia, por ejemplo "manana" o "el martes".';
    }
    const lista = libres.map(h => '🕐 ' + h).join('\n');
    return 'Para ' + formatearFecha(fecha) + ' tenemos estos horarios disponibles:\n\n' + lista + '\n\n¿Cual te gustaria reservar? Dime la hora, por ejemplo: "15:00" o "a las 5".';
  } catch (e) {
    console.error('❌ responderDisponibilidad:', e.message);
    return '⚠️ Hubo un problema consultando la disponibilidad. Intenta de nuevo o agenda aqui: ' + AGENDA_URL;
  }
}

// ── Validar identidad del paciente (email) ──────────────────
async function validarIdentidad(telefono, email) {
  try {
    const leads = await identidad.buscarLead({ pool, telefono, email });
    return leads || [];
  } catch (e) {
    console.error('❌ validarIdentidad:', e.message);
    return [];
  }
}

// ── Mostrar citas del paciente ──────────────────────────────
async function mostrarCitasPaciente(telefono, lead) {
  try {
    const citasCrm = await identidad.getCitasPorTelefono({ pool, telefono });
    const citas = citasCrm.length ? citasCrm : (lead ? [lead] : []);
    if (!citas || !citas.length) {
      return 'No encontre citas registradas para tu numero. 😔\n\n¿Quieres que te ayude a agendar una? Dime un dia y hora.';
    }
    const lista = citas.map(c => identidad.formatearCita(c)).join('\n');
    return 'Estas son tus citas:\n\n' + lista;
  } catch (e) {
    console.error('❌ mostrarCitas:', e.message);
    return '⚠️ Hubo un problema consultando tus citas.';
  }
}

// ── Mensaje para pedir email (validacion) ──────────────────
function pedirEmail(motivo) {
  return 'Para poder ' + motivo + ' necesito confirmar tu identidad. 🔐\n\n¿Me confirmas el *correo electrónico* que usaste al registrarte en Stemwell?';
}

// ── Buscar lead tras validar email ─────────────────────────
async function buscarLeadTrasValidar(telefono, email) {
  const leads = await validarIdentidad(telefono, email);
  return leads && leads.length ? leads[0] : null;
}

// ══════════════════════════════════════════════════════════
// NUEVO FLUJO GUIADO POR BOTONES
// ══════════════════════════════════════════════════════════

// Menú principal con botones
function menuPrincipal(nombre) {
  return {
    texto: '¡Hola' + (nombre ? ' ' + nombre : '') + '! 👋 Soy Sofía.\n\nPuedo ayudarte con tus citas en Stemwell:\n\n📅 *Agendar* una nueva cita\n🔄 *Reagendar* (cambiar) tu cita\n❌ *Cancelar* tu cita\n\nPara empezar, elige una opción:',
    botones: ['📅 Agendar', '🔄 Reagendar', '❌ Cancelar'],
  };
}

// Pedir correo (validación de identidad)
function menuPrincipalStemwell(nombre, idioma = 'es') {
  if (idioma === 'en') {
    return {
      texto: 'Hello' + (nombre ? ' ' + nombre : '') + '! I am Sofia, the Stemwell virtual assistant. How can I help you?',
      botones: ['About Stemwell', 'Book appointment', 'Speak to an advisor'],
    };
  }
  return {
    texto: 'Hola' + (nombre ? ' ' + nombre : '') + '. Soy Sofia, asistente virtual de Stemwell. Como puedo ayudarte?',
    botones: ['Conocer Stemwell', 'Agendar cita', 'Hablar con un asesor'],
  };
}

// ── Servicios que se pueden agendar (2026-11-04): consulta, fisioterapia y camara hiperbarica ──
function listaServicios(idioma = 'es') {
  const en = idioma === 'en';
  return {
    texto: en ? 'What would you like to book?' : 'Que deseas agendar?',
    buttonLabel: en ? 'Choose service' : 'Elegir servicio',
    sections: [{ title: en ? 'Services' : 'Servicios', rows: [
      { id: 'srv_consulta', title: en ? 'Medical consultation' : 'Consulta medica', description: en ? 'Virtual or in-person' : 'Virtual o presencial' },
      { id: 'srv_rehab', title: en ? 'Rehabilitation' : 'Rehabilitacion', description: en ? 'With a physiotherapist' : 'Con fisioterapeuta' },
      { id: 'srv_recuperacion', title: en ? 'Muscle recovery' : 'Recuperacion muscular', description: en ? 'Pressotherapy + percussion + massage' : 'Presoterapia + vibropercusion + masaje' },
      { id: 'srv_presoterapia', title: en ? 'Pressotherapy' : 'Presoterapia', description: en ? '45-minute session' : 'Sesion de 45 minutos' },
      { id: 'srv_camara', title: en ? 'Hyperbaric chamber' : 'Camara hiperbarica', description: en ? 'Prior assessment required' : 'Requiere valoracion previa' },
      { id: 'srv_paquetes', title: en ? 'Combined packages' : 'Paquetes combinados', description: en ? 'Better price than separate' : 'Mejor precio que por separado' },
    ]}],
  };
}

function listaTiposConsulta(idioma = 'es') {
  const en = idioma === 'en';
  return {
    texto: en ? 'What type of consultation would you like?' : 'Que tipo de consulta deseas?',
    buttonLabel: en ? 'Choose type' : 'Elegir tipo',
    sections: [{ title: en ? 'Consultations' : 'Consultas', rows: [
      { id: 'tipo_virtual', title: en ? 'Virtual consultation' : 'Consulta virtual', description: '$50.000 COP' },
      { id: 'tipo_presencial', title: en ? 'In-person consult' : 'Consulta presencial', description: '$80.000 COP' },
      { id: 'tipo_medilink', title: en ? 'Book on website' : 'Agendar en la pagina', description: 'Medilink' },
    ]}],
  };
}

function infoServicio(clave, idioma = 'es') {
  const en = idioma === 'en';
  const pie = en ? '\n\nPrices in COP. Packs are personal and non-transferable, valid for the period shown.\n\nAlready have your pack? Tap *Book session*. Do not have it yet? Reception will help you get it: +57 310 406 8755.' : '\n\nPrecios en COP. Los paquetes son personales e intransferibles, con la vigencia indicada.\n\nYa tienes tu bono? Toca *Agendar sesion*. Aun no lo tienes? Recepcion te ayuda a comprarlo: +57 310 406 8755.';
  const t = {
    rehab: en
      ? '*Rehabilitation at Stemwell*\nWith a physiotherapist, 1 or 2 times a week.\n- Single session: $140,000\n- 5-session pack: $675,000 ($135,000 each), valid 30 days\n- 10-session pack: $1,300,000 ($130,000 each), valid 45 days'
      : '*Rehabilitacion en Stemwell*\nCon fisioterapeuta, 1 a 2 veces por semana.\n- Sesion individual: $140.000\n- Bono 5 sesiones: $675.000 ($135.000 c/u), vigencia 30 dias\n- Bono 10 sesiones: $1.300.000 ($130.000 c/u), vigencia 45 dias',
    recuperacion: en
      ? '*Muscle recovery and release*\nPressotherapy + percussion + sports massage.\n- Upper body (~1 h): $155,000\n- Lower body (~1 h): $155,000\n- Full body (~1 h 30): $230,000\n- 5-pack upper or lower: $735,000 ($147,000 each), valid 5 months\n- 5-pack full body: $1,090,000 ($218,000 each), valid 5 months'
      : '*Recuperacion y descarga muscular*\nPresoterapia + vibropercusion + masaje deportivo.\n- Tren superior (~1 h): $155.000\n- Tren inferior (~1 h): $155.000\n- Cuerpo completo (~1 h 30): $230.000\n- Bono 5 superior o inferior: $735.000 ($147.000 c/u), 5 meses\n- Bono 5 cuerpo completo: $1.090.000 ($218.000 c/u), 5 meses',
    presoterapia: en
      ? '*Pressotherapy*\n45-minute session with a double cycle.\n- Single session: $70,000\n- 5-session pack: $310,000 ($62,000 each), valid 45 days\n- 10-session pack: $600,000 ($60,000 each), valid 90 days'
      : '*Presoterapia*\nSesion de 45 minutos con doble ciclo.\n- Sesion individual: $70.000\n- Bono 5 sesiones: $310.000 ($62.000 c/u), vigencia 45 dias\n- Bono 10 sesiones: $600.000 ($60.000 c/u), vigencia 90 dias',
    camara: en
      ? '*Hyperbaric chamber at Stemwell*\nRequires a prior assessment.\n- Single session: $150,000\n- 5-session pack: $675,000 ($135,000 each), valid 45 days\n- 10-session pack: $1,275,000 ($127,500 each), valid 75 days\n- 20-session intensive cycle: $2,400,000 ($120,000 each), valid 120 days'
      : '*Camara hiperbarica en Stemwell*\nRequiere valoracion previa.\n- Sesion individual: $150.000\n- Bono 5 sesiones: $675.000 ($135.000 c/u), vigencia 45 dias\n- Bono 10 sesiones: $1.275.000 ($127.500 c/u), vigencia 75 dias\n- Bono 20 ciclo intensivo: $2.400.000 ($120.000 c/u), vigencia 120 dias',
    paquetes: en
      ? '*Combined packages* (better price than buying each service separately)\n- Sports recovery: 4 releases + 4 chamber: $1,100,000, valid 120 days (save $120,000)\n- Musculoskeletal injury: 8 rehab + 4 pressotherapy + 5 chamber: $1,965,000, valid 30 days (save $185,000)\n- Legs and edema: 8 pressotherapy + 3 drainage + 3 chamber: $1,120,000, valid 60 days (save $130,000)\n- Monthly maintenance: 2 releases + 2 chamber: $550,000, valid 30 days (save $60,000)'
      : '*Paquetes combinados* (mejor precio que comprar cada servicio por separado)\n- Recuperacion deportiva: 4 descargas + 4 camara: $1.100.000, vigencia 120 dias (ahorras $120.000)\n- Lesion musculoesqueletica: 8 rehab + 4 presoterapia + 5 camara: $1.965.000, vigencia 30 dias (ahorras $185.000)\n- Piernas y edema: 8 presoterapia + 3 drenaje + 3 camara: $1.120.000, vigencia 60 dias (ahorras $130.000)\n- Mantenimiento mensual: 2 descargas + 2 camara: $550.000, vigencia 30 dias (ahorras $60.000)',
  };
  return t[clave] + pie;
}

// ── Reserva de sesiones de paquetes por el bot (2026-11-04) ──
// El bot no escribe la cita: la pide al CRM (services/crm-interno.js), que aplica las reglas de recepcion.
// Si la persona no tiene el bono, elige cuantas sesiones/que bono quiere y el bot deja una SOLICITUD para recepcion
// (no vende, no crea paquetes ni cobros).
const TXT_RECEPCION = '+57 310 406 8755';
const MEDICO_VALORACION = 'gustavo castro';   // quien hace la valoracion previa de la camara (coincide con el nombre en usuarios)

const SERVICIO_NOMBRE = {
  rehab: 'Rehabilitacion', recuperacion: 'Recuperacion y descarga muscular', presoterapia: 'Presoterapia',
  camara: 'Camara hiperbarica', paquetes: 'Paquete combinado',
};

// Catalogo oficial (titulo <= 24 caracteres: limite de WhatsApp en las listas)
const BONOS = {
  rehab: [
    { titulo: 'Sesion individual', desc: '$140.000' },
    { titulo: 'Bono 5 sesiones', desc: '$675.000 ($135.000 c/u) · 30 dias' },
    { titulo: 'Bono 10 sesiones', desc: '$1.300.000 ($130.000 c/u) · 45 dias' },
  ],
  recuperacion: [
    { titulo: 'Tren superior (~1 h)', desc: '$155.000' },
    { titulo: 'Tren inferior (~1 h)', desc: '$155.000' },
    { titulo: 'Cuerpo completo', desc: '$230.000 (~1 h 30)' },
    { titulo: 'Bono 5 sup. o inf.', desc: '$735.000 ($147.000 c/u) · 5 meses' },
    { titulo: 'Bono 5 cuerpo completo', desc: '$1.090.000 ($218.000 c/u) · 5 meses' },
  ],
  presoterapia: [
    { titulo: 'Sesion individual', desc: '$70.000 (45 min)' },
    { titulo: 'Bono 5 sesiones', desc: '$310.000 ($62.000 c/u) · 45 dias' },
    { titulo: 'Bono 10 sesiones', desc: '$600.000 ($60.000 c/u) · 90 dias' },
  ],
  camara: [
    { titulo: 'Sesion individual', desc: '$150.000' },
    { titulo: 'Bono 5 sesiones', desc: '$675.000 ($135.000 c/u) · 45 dias' },
    { titulo: 'Bono 10 sesiones', desc: '$1.275.000 ($127.500 c/u) · 75 dias' },
    { titulo: 'Bono 20 intensivo', desc: '$2.400.000 ($120.000 c/u) · 120 dias' },
  ],
  paquetes: [
    { titulo: 'Recuperacion deportiva', desc: '$1.100.000 · 4 descargas + 4 camara · 120 dias' },
    { titulo: 'Lesion musculoesquel.', desc: '$1.965.000 · 8 rehab + 4 presoterapia + 5 camara · 30 dias' },
    { titulo: 'Piernas y edema', desc: '$1.120.000 · 8 presoterapia + 3 drenaje + 3 camara · 60 dias' },
    { titulo: 'Mantenimiento mensual', desc: '$550.000 · 2 descargas + 2 camara · 30 dias' },
  ],
};

function fechaISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function listaDiasSesion(idioma, texto) {
  const en = idioma === 'en';
  return {
    texto: texto || (en ? 'Which day works for you?' : 'Que dia te sirve?'),
    buttonLabel: en ? 'Choose day' : 'Elegir dia',
    sections: [{ title: en ? 'Days' : 'Dias', rows: DIAS_MENU.map(d => ({
      id: 'dia_' + normalizarAux(d), title: d, description: formatearFecha(fechaParaDia(normalizarAux(d))),
    })) }],
  };
}

function listaHorasSesion(horas, fecha, idioma) {
  const en = idioma === 'en';
  let muestra = horas;
  if (horas.length > 9) {   // WhatsApp admite 10 filas: se reparten 9 horas a lo largo del dia y queda "Otro dia"
    muestra = [];
    for (let i = 0; i < 9; i++) muestra.push(horas[Math.round(i * (horas.length - 1) / 8)]);
    muestra = Array.from(new Set(muestra));
  }
  const rows = muestra.map(x => ({ id: 'hora_' + x, title: x }));
  rows.push({ id: 'otro_dia', title: en ? 'Another day' : 'Otro dia' });
  return {
    texto: (en ? 'Times available on ' : 'Horas disponibles el ') + formatearFecha(fecha) + (en ? '. Choose one, or type another time like 15:30.' : '. Elige una, o escribe otra hora, por ejemplo 15:30.'),
    buttonLabel: en ? 'Choose time' : 'Elegir hora',
    sections: [{ title: en ? 'Times' : 'Horas', rows }],
  };
}

function listaCantidad(opcion, idioma) {
  const en = idioma === 'en';
  const max = Math.min(opcion.restantes, 10);
  const rows = [];
  for (let k = 1; k <= max; k++) {
    rows.push({ id: 'cant_' + k, title: k + (en ? (k === 1 ? ' session' : ' sessions') : (k === 1 ? ' sesion' : ' sesiones')),
      description: k === opcion.restantes ? (en ? 'All the sessions you have left' : 'Todas las que te quedan') : '' });
  }
  return {
    texto: en ? `You have ${opcion.restantes} sessions left of ${opcion.etiqueta}. How many do you want to book now?`
      : `Tienes ${opcion.restantes} sesiones por agendar de ${opcion.etiqueta}. Cuantas quieres agendar ahora?`,
    buttonLabel: en ? 'Choose number' : 'Elegir cantidad',
    sections: [{ title: en ? 'Sessions' : 'Sesiones', rows: rows.map(r => (r.description ? r : { id: r.id, title: r.title })) }],
  };
}

function listaBonos(clave, idioma, intro) {
  const en = idioma === 'en';
  return {
    texto: intro,
    buttonLabel: en ? 'Choose pack' : 'Elegir bono',
    sections: [{ title: en ? 'Options' : 'Opciones', rows: [
      ...((clave === 'camara' || clave === 'paquetes') ? [{ id: 'valoracion', title: en ? 'Book my assessment' : 'Agendar mi valoracion', description: en ? 'Appointment with the doctor, required first' : 'Cita con el medico, es el primer paso' }] : []),
      ...(BONOS[clave] || []).map((b, i) => ({ id: 'bono_' + i, title: b.titulo, description: b.desc.slice(0, 72) })),
    ] }],
  };
}

// Despues de saber quien es la persona: ¿que sesiones le quedan por agendar de este servicio?
async function prepararSesiones({ st, lead, nombre, idioma }) {
  const en = idioma === 'en';
  const recep = en ? 'Reception can help you: ' + TXT_RECEPCION + '.' : 'Recepcion te ayuda: ' + TXT_RECEPCION + '.';
  const volver = en ? ['Speak to an advisor', 'Menu'] : ['Hablar con un asesor', 'Menu'];
  const base = { paso: 'menu_principal', servicioClave: st.servicioClave };
  if (!lead) {
    return { estado: base, botones: volver, texto: en
      ? 'I could not find a record with that email, so I cannot book a session yet. To buy your pack, ' + recep
      : 'No encontre un registro con ese correo, asi que todavia no puedo agendar una sesion. Para comprar tu bono o paquete, ' + recep };
  }
  const persona = { leadId: lead.id, leadNombre: lead.nombre, email: st.email };
  const res = await crmInterno.sesionesPorAgendar(lead.id, st.servicioClave);
  if (!res.ok) {
    return { estado: { ...base, ...persona }, botones: volver, texto: en
      ? 'I had a problem checking your pack. ' + recep
      : 'Tuve un problema consultando tu paquete. ' + recep };
  }
  const opciones = (res.data && res.data.opciones) || [];
  if (!opciones.length) {   // sin bono: elige que quiere y se deja la solicitud para recepcion
    return {
      estado: { ...base, ...persona, paso: 'solicitud_bono' },
      lista: listaBonos(st.servicioClave, idioma, en
        ? 'You do not have an active pack for this service yet. ' + ((st.servicioClave === 'camara' || st.servicioClave === 'paquetes') ? 'The hyperbaric chamber requires a prior assessment with the doctor: book it here, or choose your pack and reception will confirm the schedule and payment.' : 'Choose what you would like and reception will confirm the schedule and payment with you.')
        : 'Aun no tienes un bono activo de este servicio. ' + ((st.servicioClave === 'camara' || st.servicioClave === 'paquetes') ? 'La camara hiperbarica requiere valoracion previa con el medico: puedes agendarla aqui, o elegir tu bono y recepcion te confirma horarios y pago.' : 'Elige lo que quieres y recepcion te confirma los horarios y el pago.')),
    };
  }
  if (opciones.length === 1) return elegirOpcionSesion({ base, persona, opcion: opciones[0], idioma });
  return {
    estado: { ...base, ...persona, paso: 'sesion_paquete', opciones },
    lista: {
      texto: en ? 'Which of your packs do you want to use?' : 'Cual de tus paquetes quieres usar?',
      buttonLabel: en ? 'Choose pack' : 'Elegir paquete',
      sections: [{ title: en ? 'Your packs' : 'Tus paquetes', rows: opciones.slice(0, 10).map((o, i) => ({
        id: 'opc_' + i,
        title: (String(i + 1) + '. ' + o.etiqueta).slice(0, 24),
        description: (en ? 'Sessions left: ' : 'Sesiones por agendar: ') + o.restantes,
      })) }],
    },
  };
}

// La camara exige valoracion previa: se agenda como una consulta medica (mismo flujo de consultas), conservando a la
// persona si ya dio su correo para no volver a pedirlo.
function empezarValoracion(st) {
  return { paso: 'pedir_tipo', accion: 'agendar', valoracion: true,
    ...(st.leadId ? { leadId: st.leadId, leadNombre: st.leadNombre, email: st.email } : {}) };
}

function textoDia(opcion, total, hechas, idioma) {
  const en = idioma === 'en';
  if (total > 1) return en ? `Session ${hechas + 1} of ${total} of ${opcion.etiqueta}. Which day works for you?` : `Sesion ${hechas + 1} de ${total} de ${opcion.etiqueta}. Que dia te sirve?`;
  return en ? `You have ${opcion.restantes} session(s) left of ${opcion.etiqueta}. Which day works for you?` : `Te quedan ${opcion.restantes} sesion(es) de ${opcion.etiqueta}. Que dia te sirve?`;
}

function empezarDias({ base, persona, opcion, total, idioma }) {
  return {
    estado: { ...base, ...persona, paso: 'sesion_dia', opcion, total, hechas: 0, reservadas: [] },
    lista: listaDiasSesion(idioma, textoDia(opcion, total, 0, idioma)),
  };
}

function elegirOpcionSesion({ base, persona, opcion, idioma }) {
  if (opcion.restantes > 1) return { estado: { ...base, ...persona, paso: 'sesion_cantidad', opcion }, lista: listaCantidad(opcion, idioma) };
  return empezarDias({ base, persona, opcion, total: 1, idioma });
}

function informacionStemwell(idioma = 'es') {
  if (idioma === 'en') return 'Stemwell is a regenerative medicine clinic in Bogota. We provide responsible information about our procedures without diagnosing by chat. A physician must assess every individual case.\n\nVirtual consultation: COP $50,000\nIn-person consultation: COP $80,000\nWe also offer rehabilitation, muscle recovery, pressotherapy and hyperbaric chamber: choose Book appointment to see them.\n\nReception: +57 310 406 8755';
  return 'Stemwell es una clinica de medicina regenerativa en Bogota. Podemos orientarte sobre nuestros procedimientos sin diagnosticar por chat; cada caso debe ser valorado por un medico.\n\nConsulta virtual: $50.000 COP\nConsulta presencial: $80.000 COP\nTambien tenemos rehabilitacion, recuperacion muscular, presoterapia y camara hiperbarica: elige Agendar cita para verlas.\n\nRecepcion: +57 310 406 8755';
}

function confirmacionCita(nombre, fecha, hora, tipoConsulta, idioma = 'es') {
  const tipo = tipoConsulta || 'Consulta presencial - $80.000 COP';
  const virtual = normalizarAux(tipo).includes('virtual');
  const presencial = normalizarAux(tipo).includes('presencial');
  const precio = virtual ? '$50.000 COP' : presencial ? '$80.000 COP' : 'sin costo';
  const pago = virtual ? '\nPago: https://checkout.bold.co/payment/LNK_TOWWHZAP5P' : '';
  const fechaTexto = idioma === 'en'
    ? new Date(fecha).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : formatearFecha(new Date(fecha));
  if (virtual && idioma === 'en') {
    return `Hello ${nombre || 'patient'}, your virtual consultation is scheduled for ${fechaTexto} at ${hora}. Price: ${precio}.${pago}\n\nYou will receive the connection details through WhatsApp. Please have your laboratory tests, diagnostic images and medical history available.`;
  }
  if (idioma === 'en') return `Hello ${nombre || 'patient'}, your in-person consultation at Stemwell is scheduled for ${fechaTexto} at ${hora}. Price: ${precio}.\nLocation: Cra 13 #118-08, Bogota - https://maps.app.goo.gl/3WFrcsNHF2zjzJtP6\nBring your laboratory tests, diagnostic images and medical records.`;
  if (virtual) {
    return `Hola ${nombre || 'paciente'}, confirmamos tu consulta virtual en Stemwell para el ${fechaTexto} a las ${hora}. Valor: ${precio}.${pago}\n\nRecibiras por WhatsApp la informacion para conectarte. Por favor ten disponibles tus pruebas de laboratorio, imagenes diagnosticas y antecedentes medicos.`;
  }
  return `Hola ${nombre || 'paciente'}, confirmamos tu consulta presencial en Stemwell para el ${fechaTexto} a las ${hora}. Valor: ${precio}.\nUbicacion: Cra 13 #118-08, Bogota - https://maps.app.goo.gl/3WFrcsNHF2zjzJtP6\nPor favor trae tus pruebas de laboratorio, imagenes diagnosticas y copia de tu historia clinica.`;
}

function pedirEmailIdentidad() {
  return '🔐 Para validar si eres nuestro paciente, por favor escribe tu *correo electrónico*.\n\n(Ej: nombre@correo.com)';
}

function esCorreoCliente(texto) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
}

// Preparar botones de días de la semana (lunes-martes-miércoles-jueves-viernes-sábado)
const DIAS_MENU = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function fechaParaDia(diaSemana) {
  // diaSemana: 'lunes'...'sabado'
  // JS usa getDay(): domingo=0, lunes=1, martes=2 ... sábado=6
  // DIAS_MENU usa índice 0 para lunes → +1 para alinear con getDay().
  const hoy = hoyLocal();
  const idx = DIAS_MENU.findIndex(function(d) { return normalizarAux(d) === diaSemana; });
  const objetivo = idx + 1; // alinear con getDay
  let delta = objetivo - hoy.getDay();
  if (delta <= 0) delta += 7;
  const res = new Date(hoy);
  res.setDate(res.getDate() + delta);
  return res;
}

function extraerDiaSeleccionado(texto) {
  const t = normalizarAux(texto);
  for (let i = 0; i < DIAS_MENU.length; i++) {
    const dia = normalizarAux(DIAS_MENU[i]);
    // Acepta el día en cualquier posición: "Jueves", "📅 Jueves", "dia_jueves", etc.
    if (t === dia || t.startsWith(dia) || t.includes(dia) || t === 'dia_' + dia) {
      return dia;
    }
  }
  return null;
}

async function getDoctoresActivos() {
  const result = await pool.query("SELECT id,nombre FROM usuarios WHERE rol IN ('doctor','apoyo') AND activo=true ORDER BY nombre LIMIT 10");
  return result.rows || [];
}

function parecePreguntaLibre(texto) {
  const t = normalizarAux(texto);
  return /[?\u00bf]/.test(texto) ||
    /\b(que|como|cual|cuales|por que|puede|pueden|sirve|sirven|ayuda|ayudar|riesgo|peligro|contraindic|cancer|dolor|rodilla|hombro|espalda|celula|stem ?cell|prp|exosoma|foto\s*biomod|laser|tratamiento|procedimiento|difference|what|how|why|can|could|danger|risk|pain|knee|shoulder|back|cancer|certif|ubicacion|ubicaciones|direccion|donde|queda|llegar|mapa|address|location|where|cuanto|cuesta|vale|valor|precio|costo|cost|price|how much)\b/.test(t);
}

function esEntradaEsperada(st, texto) {
  const paso = st && st.paso;
  const t = normalizarAux(texto);
  if (!paso) return false;
  if (paso === 'pedir_correo') return esCorreoCliente(texto);
  if (paso === 'solicitud_detalle') return texto.trim().length >= 2;
  if (paso === 'solicitud_bono') return /(valoracion|assessment|sesion|bono|tren|cuerpo|intensivo|recuperacion|lesion|piernas|mantenimiento)/.test(t);
  if (paso === 'sesion_cantidad') return /\d/.test(t);
  if (paso === 'sesion_paquete') return /^(\s*\d+\.|opc_)/.test(t);
  if (paso === 'sesion_dia') return Boolean(extraerDiaSeleccionado(texto));
  if (paso === 'sesion_hora') return Boolean(extraerHora(texto)) || /(otro dia|another day)/.test(t);
  if (paso === 'pedir_servicio') return /(srv_|consulta|consult|fisio|physio|rehab|recuper|descarga|presoter|pressoth|hiperb|camara|chamber|paquete|combinad|package)/.test(t);
  // 'consultoria|advisory': listas viejas que aun la ofrecian; se tratan como entrada esperada para volver a preguntar el tipo.
  if (paso === 'pedir_tipo') return /(consultoria|advisory|virtual|presencial|in-person|pagina|website|medilink)/.test(t);
  if (paso === 'pedir_doctor') return (st.doctores || []).some(d => t.includes(normalizarAux(d.nombre)) || t === 'doctor_' + d.id);
  if (paso === 'seleccionar_dia') return Boolean(extraerDiaSeleccionado(texto));
  if (paso === 'seleccionar_hora') return Boolean(extraerHora(texto));
  if (paso === 'confirmar_cancelar') return /^(si|yes|no)|cancelar/.test(t);
  if (paso === 'validado' || paso === 'validado_nuevo') return /(agendar|reagendar|cancelar|no|gracias)/.test(t);
  if (paso === 'menu_principal') return /(conocer|about|informacion|information|recepcion|reception|menu|agendar|book|reagendar|cancelar)/.test(t);
  return false;
}

function respuestaMedicaSegura(texto, idioma = 'es') {
  const t = normalizarAux(texto);
  const en = idioma === 'en';
  if (/(foto\s*biomod|photo.?biomod|laser).*(cuanto|vale|precio|costo|cost|price|how much)|(cuanto|vale|precio|costo|cost|price|how much).*(foto\s*biomod|photo.?biomod|laser)/.test(t)) {
    return en
      ? 'I do not have a registered price for photobiomodulation, so I should not invent one. Reception can confirm the current price at +57 310 406 8755. The virtual medical consultation costs COP $50,000 and the in-person medical consultation costs COP $80,000.'
      : 'No tengo registrado el precio de la fotobiomodulacion, por lo que no debo inventarlo. Recepcion puede confirmar el valor vigente en el +57 310 406 8755. La consulta medica virtual cuesta $50.000 COP y la presencial $80.000 COP.';
  }
  if (/\b(cancer|canceroso|tumor|oncolog)/.test(t)) {
    return en
      ? 'I cannot confirm that a regenerative treatment is appropriate for a person with cancer. Cancer history, current disease and oncology treatment can change eligibility and must be reviewed by a physician before considering any procedure. Do not start or stop treatment based on this chat.'
      : 'No puedo confirmar que un tratamiento regenerativo sea adecuado para una persona con cancer. Los antecedentes, la enfermedad activa y el tratamiento oncologico pueden cambiar la elegibilidad y deben ser revisados por un medico antes de considerar cualquier procedimiento. No inicies ni suspendas tratamientos basandote en este chat.';
  }
  if (/(peligro|peligros|danin|danger|safe|segur|riesgo|contraindic|efecto secundario|side effect)/.test(t)) {
    return en
      ? 'Risks and contraindications depend on the procedure, medical history, medications and current condition. I cannot determine safety for your case by chat. A physician must review your history and tests and explain expected benefits, alternatives and possible adverse effects.'
      : 'Los riesgos y contraindicaciones dependen del procedimiento, los antecedentes, los medicamentos y la condicion actual. No puedo determinar por chat si es seguro para tu caso. Un medico debe revisar tu historia y examenes y explicarte beneficios esperados, alternativas y posibles efectos adversos.';
  }
  if (/(certif|licen|credential|profesional.*formacion)/.test(t)) {
    return en
      ? 'I do not have access to the professionals\' credential documents, so I should not confirm details I cannot verify. Reception can provide the corresponding professional and institutional information at +57 310 406 8755.'
      : 'No tengo acceso a los documentos de acreditacion de los profesionales, por lo que no debo confirmar datos que no puedo verificar. Recepcion puede entregarte la informacion profesional e institucional correspondiente en el +57 310 406 8755.';
  }
  if (/(diferencia|diferencias|difference|differences|todas.*opcion|all.*option|all.*service)/.test(t)) {
    return en
      ? 'In general: PRP uses platelets from your own blood; mesenchymal cells are studied and used in selected regenerative protocols; exosomes are cell-derived messengers; hyperbaric therapy increases oxygen exposure under pressure; IV therapy administers fluids or nutrients; and photobiomodulation uses low-level laser light in physician-guided protocols. They are not interchangeable, and the appropriate option depends on a medical assessment.'
      : 'En general: el PRP usa plaquetas de tu propia sangre; las celulas mesenquimales se estudian y utilizan en protocolos regenerativos seleccionados; los exosomas son mensajeros derivados de celulas; la terapia hiperbarica aumenta la exposicion a oxigeno bajo presion; la terapia intravenosa administra liquidos o nutrientes; y la fotobiomodulacion usa luz laser de baja intensidad dentro de protocolos definidos por el equipo medico. No son tratamientos intercambiables y la opcion adecuada depende de una valoracion medica.';
  }
  if (/(que son.*celula|what are.*stem|stem ?cell.*what)/.test(t)) {
    return en
      ? 'Stem cells are cells capable of self-renewal and, depending on their type, developing into specialized cells. Some uses are established and others remain under study. Whether they are relevant to a specific condition requires medical diagnosis and review of the available evidence.'
      : 'Las celulas madre son celulas capaces de autorrenovarse y, segun su tipo, convertirse en celulas especializadas. Algunos usos estan establecidos y otros siguen en investigacion. Saber si son pertinentes para una condicion concreta requiere diagnostico medico y revision de la evidencia disponible.';
  }
  if (/(celula|stem ?cell).*(sirve|ayuda|help|dolor|pain)|(sirve|ayuda|help).*(celula|stem ?cell)/.test(t)) {
    return en
      ? 'Stem-cell-based approaches may be considered in selected cases, but knee, shoulder or back pain can have many different causes. I cannot tell from chat whether they would help you. A physician needs your diagnosis, examination and usually imaging to discuss suitable options and realistic expectations.'
      : 'Los tratamientos basados en celulas pueden considerarse en casos seleccionados, pero el dolor de rodilla, hombro o espalda puede tener causas muy diferentes. No puedo decir por chat si te servirian. Un medico necesita conocer el diagnostico, examinarte y normalmente revisar imagenes para explicarte opciones adecuadas y expectativas realistas.';
  }
  return null;
}

function respuestaSeguimientoCita(st, texto, idioma = 'es') {
  if (!st || st.paso !== 'post_agendado' || !st.citaConfirmada) return null;
  const t = normalizarAux(texto);
  const cita = st.citaConfirmada;
  const tipo = normalizarAux(cita.tipoConsulta || '');
  const esConsultoria = tipo.includes('consultoria');
  const preguntaConfirmacion = /(call me|who.*call|office.*call|appointment|confirm|scheduled|avis|llam|quien|consultorio|agendad|reservad)/.test(t);
  if (!preguntaConfirmacion) return null;
  const fecha = cita.fecha ? new Date(cita.fecha) : null;
  const fechaTexto = fecha
    ? (idioma === 'en'
      ? fecha.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : formatearFecha(fecha))
    : '';
  const medico = cita.doctorNombre ? (idioma === 'en' ? ` with ${cita.doctorNombre}` : ` con ${cita.doctorNombre}`) : '';
  if (esConsultoria && idioma === 'en') {
    return `Your free phone advisory call${medico} is already registered for ${fechaTexto} at ${cita.hora}. The physician or Stemwell medical team will call you at this same WhatsApp number. You do not need to book again or visit the clinic.`;
  }
  if (esConsultoria) {
    return `Tu consultoria telefonica sin costo${medico} ya esta registrada para el ${fechaTexto} a las ${cita.hora}. El medico o el equipo medico de Stemwell te llamara a este mismo numero de WhatsApp. No necesitas volver a agendar ni venir a la clinica.`;
  }
  if (idioma === 'en') {
    return `Your appointment${medico} is already registered for ${fechaTexto} at ${cita.hora}. The Stemwell team will contact you through this WhatsApp number if any additional confirmation or connection details are needed. You do not need to book again.`;
  }
  return `Tu cita${medico} ya esta registrada para el ${fechaTexto} a las ${cita.hora}. El equipo de Stemwell te contactara por este mismo WhatsApp si necesita enviarte una confirmacion o instrucciones adicionales. No necesitas volver a agendar.`;
}

function pistaParaRetomar(st, idioma = 'es') {
  const paso = st && st.paso;
  // En el menu o sin flujo activo los botones fijos ya ofrecen agendar y asesor.
  if (!paso || paso === 'menu_principal') return '';
  const en = idioma === 'en';
  const pistas = {
    solicitud_bono: en ? 'When you are ready, choose an option from the previous list.' : 'Cuando quieras continuar, elige una opcion de la lista anterior.',
    solicitud_detalle: en ? 'To finish, tell me which days and times work for you.' : 'Para terminar, cuentame que dias y horarios te sirven.',
    sesion_cantidad: en ? 'When you are ready, choose how many sessions from the previous list.' : 'Cuando quieras continuar, elige cuantas sesiones de la lista anterior.',
    sesion_paquete: en ? 'When you are ready, choose your pack from the previous list.' : 'Cuando quieras continuar, elige tu paquete de la lista anterior.',
    sesion_dia: en ? 'When you are ready, choose a day from the previous list.' : 'Cuando quieras continuar, elige un dia de la lista anterior.',
    sesion_hora: en ? 'When you are ready, choose a time from the previous list.' : 'Cuando quieras continuar, elige una hora de la lista anterior.',
    pedir_servicio: en ? 'When you are ready, choose the service from the previous list.' : 'Cuando quieras continuar, elige el servicio de la lista anterior.',
    pedir_tipo: en ? 'When you are ready, choose the appointment type from the previous list.' : 'Cuando quieras continuar, elige el tipo de cita de la lista anterior.',
    pedir_doctor: en ? 'When you are ready, choose a physician from the previous list.' : 'Cuando quieras continuar, elige un medico de la lista anterior.',
    pedir_correo: en ? 'To continue, send the email used for your Stemwell record.' : 'Para continuar, escribe el correo usado en tu registro de Stemwell.',
    seleccionar_dia: en ? 'When you are ready, choose a day from the previous list.' : 'Cuando quieras continuar, elige un dia de la lista anterior.',
    seleccionar_hora: en ? 'When you are ready, choose one of the available times.' : 'Cuando quieras continuar, elige uno de los horarios disponibles.',
    validado: en ? 'You can continue with booking, rescheduling or cancellation.' : 'Puedes continuar con agendar, reagendar o cancelar.',
    validado_nuevo: en ? 'Tell me if you want to continue as a new patient.' : 'Indica si deseas continuar como paciente nuevo.',
    post_agendado: en ? 'Your appointment is already registered; you do not need to book again.' : 'Tu cita ya esta registrada; no necesitas volver a agendar.',
  };
  return pistas[paso] ? '\n\n' + pistas[paso] : '';
}

function listaDiasReagenda(idioma = 'es') {
  return {
    texto: idioma === 'en' ? 'Which new day would you prefer?' : 'Para que nuevo dia quieres reagendar tu cita?',
    buttonLabel: idioma === 'en' ? 'Choose day' : 'Elegir dia',
    sections: [{ title: idioma === 'en' ? 'New day' : 'Nuevo dia', rows: DIAS_MENU.map(d => ({
      id: 'dia_' + normalizarAux(d), title: d, description: formatearFecha(fechaParaDia(normalizarAux(d))),
    })) }],
  };
}

async function recuperarContextoCita(telefono, estadoActual = {}) {
  if (estadoActual.paso === 'post_agendado' && estadoActual.citaConfirmada) return estadoActual;
  const leads = await validarIdentidad(telefono, null);
  const lead = leads && leads[0];
  if (!lead) return estadoActual;
  const citas = await identidad.getCitasPorTelefono({ pool, telefono, leadId: lead.id });
  const terminales = /(anulado|cancelado|canceled|no show|no asiste|reagendado|cambio de fecha|atendido|completado|completada)/;
  const activas = (citas || []).filter(c => !terminales.test(normalizarAux(c.estado_cita || '')));
  if (!activas.length) return estadoActual;
  const hoy = hoyLocal().getTime();
  const proxima = activas.find(c => new Date(c.fecha_cita).getTime() >= hoy) || activas[activas.length - 1];
  return {
    ...estadoActual,
    paso: 'post_agendado',
    leadId: lead.id,
    leadNombre: lead.nombre,
    email: lead.email || estadoActual.email || '',
    citaConfirmada: {
      leadId: lead.id,
      fecha: proxima.fecha_cita,
      hora: String(proxima.hora_inicio || '').slice(0, 5),
      tipoConsulta: proxima.tipo_atencion || lead.modalidad_consulta || 'Consulta',
      doctorId: lead.doctor_id || null,
      doctorNombre: lead.doctor_nombre || '',
    },
  };
}

// ══════════════════════════════════════════════════════════

// ── Registrar un LEAD NUEVO en el CRM (Fase 2) ─────────────
// Crea el lead y agenda la cita. Devuelve { ok, leadId, nombre }.
async function registrarLeadNuevo({ nombre, telefono, email, fecha, hora, doctorId, tipoConsulta }) {
  try {
    const leadId = await agenda.apiCrearLead({
      nombre: nombre,
      telefono: telefono,
      email: email || '',
      canal: 'WhatsApp',
      notas: 'Lead creado por bot de WhatsApp (agendamiento online)',
    });
    // Agendar la cita en el CRM con el lead recién creado.
    await agenda.apiAgendar({
      leadId: leadId,
      estado: 'Agendado',
      fecha: fecha,
      hora: hora,
      email: email || '',
      doctorId: doctorId || null,
      tipoConsulta: tipoConsulta || 'Consulta presencial - $80.000 COP',
      notas: 'Cita agendada por bot de WhatsApp - actualizar en Medilink.',
    });
    return { ok: true, leadId: leadId, nombre: nombre };
  } catch (e) {
    console.error('❌ registrarLeadNuevo:', e.message);
    return { ok: false, error: e.message };
  }
}

// Escala la conversacion a un asesor humano cuando el bot detecta que no
// esta logrando resolver la consulta (en vez de solo cuando el paciente lo
// pide explicitamente). `motivo` queda registrado en wa_advisor_requests
// para que el asesor entienda por que se activo la cola sin pedirlo el paciente.
async function escalarPorFalloBot(telefono, nombre, idioma, texto, motivo) {
  const dentroDeHorario = isBusinessHours();
  const advisor = await requestAdvisor(telefono, nombre, idioma, `[AUTO:${motivo}] ${texto}`, { pauseBot: dentroDeHorario });
  await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
  if (!dentroDeHorario) {
    return idioma === 'en'
      ? 'I notice I have not been able to fully resolve this. Our advisors are available from 8:30 AM to 6:00 PM and I have already queued your request for then. In the meantime I can keep helping with what I can.'
      : 'Veo que no he logrado resolver esto del todo. Nuestros asesores atienden de 8:30 a.m. a 6:00 p.m. y ya dejé tu solicitud en cola para ese horario. Mientras tanto, sigo aquí para lo que pueda ayudarte.';
  }
  return idioma === 'en'
    ? `I notice I have not been able to fully resolve this. Let me connect you with ${advisor ? advisor.nombre : 'one of our advisors'} — they will contact you as soon as possible.`
    : `Veo que no he logrado resolver esto del todo. Te estoy conectando con ${advisor ? advisor.nombre : 'un asesor'}. Se comunicará contigo lo más pronto posible.`;
}

async function handleIncomingMessage(message, contact, options = {}) {
  const telefono = telefonoWhatsAppValido(message?.from || contact?.wa_id);
  const nombre = contact?.profile?.name || '';
  const tipo = message.type;
  let texto = '';

  if (tipo === 'text') {
    texto = message.text?.body || '';
  } else if (tipo === 'interactive') {
    // Botones normales → button_reply; Listas interactivas → list_reply
    texto = message.interactive?.button_reply?.title
         || message.interactive?.list_reply?.title
         || message.interactive?.list_reply?.id
         || '';
  }

  if (!texto || texto.length < 2) return;
  if (esNotificacionFormularioCampana(texto)) {
    console.log(`CAMPAIGN_LEAD_IGNORED [${telefono || 'sin-remitente'}] No se envio respuesta automatica`);
    return;
  }
  if (!telefono) {
    console.warn('WHATSAPP_MESSAGE_IGNORED Remitente ausente o invalido');
    return;
  }

  // Contacto bloqueado por Soporte: silencio total, sin respuesta, sin crear
  // contacto y sin guardar el mensaje.
  if (await estaBloqueado(telefono)) {
    console.log(`BLOCKED_CONTACT_IGNORED [${telefono}] No se envio respuesta automatica`);
    return;
  }

  const sesion = await getSesion(telefono);
  // Un paciente puede cambiar de idioma durante la misma conversacion.
  // Priorizamos el idioma del mensaje actual y conservamos el anterior solo
  // para entradas neutras como un correo, una fecha o una hora.
  const idiomaDetectado = detectarIdioma(texto);
  const idioma = idiomaDetectado || sesion.idioma || 'es';

  console.log('📩 [' + telefono + '] ' + nombre + ': "' + texto + '" (' + idioma + ')');

  await upsertContactoBasico(telefono, nombre).catch(function(){});
  if (!options.skipInboundLog) await logMensaje(telefono, nombre, 'entrada', texto);
  await setSesion(telefono, { mensajes: (sesion.mensajes || 0) + 1, idioma: idioma });

  // Cuando recepcion toma el chat desde el CRM, conservamos el historial pero
  // detenemos por completo las respuestas automaticas para evitar duplicados.
  if (await isPaused(telefono)) {
    console.log('[' + telefono + '] Conversacion bajo control humano');
    await savePendingInbound(telefono, nombre, texto);
    return;
  }

  try {
    const st = await agenda.getEstadoAgenda(telefono) || {};
    let respuesta = null;        // texto simple
    let botonesRespuesta = null; // {botones:[], texto}
    let listRespuesta = null;    // {texto, buttonLabel, sections}
    let sinBotonesLibres = false; // true cuando el bot pide un dato dentro de un flujo: no se le pegan los botones generales
    let escalado = false;        // true si ya se escalo a un asesor (evita el CTA redundante de abajo)
    const textoGlobal = normalizarAux(texto);
    const intencionGlobal = detectarIntencion(texto);
    const interrumpeFlujo = !['menu_principal', 'validado', 'validado_nuevo', 'confirmar_cancelar'].includes(st.paso);
    // Pedir agendar / ver horarios inicia el flujo de agenda, no una charla con la IA.
    const esIntencionAgenda = ['agendar_cita', 'consultar_disponibilidad'].includes(intencionGlobal);

    // El paciente repite (casi) el mismo mensaje varias veces seguidas: senal
    // de que el bot no esta logrando resolverle, sin importar por que camino
    // del flujo entre. Se ignoran mensajes cortos (si/no/gracias) para evitar
    // falsos positivos en confirmaciones normales del flujo de agenda.
    const esRepeticion = textoGlobal.length >= 4 && textoGlobal === (sesion.ultimo_msg_norm || '');
    const repeticiones = esRepeticion ? (sesion.repeticiones || 0) + 1 : 0;
    await setSesion(telefono, { ultimo_msg_norm: textoGlobal, repeticiones });

    // Responde una consulta escrita con libertad: primero respuestas medicas
    // seguras ya definidas, luego la IA con el historial de la conversacion.
    // Deja el resultado en `respuesta` / `escalado`, como el resto del flujo.
    const responderPreguntaLibre = async () => {
      const pareceSeguimiento = /(call me|who.*call|office.*call|appointment|confirm|scheduled|avis|llam|quien|consultorio|agendad|reservad)/.test(textoGlobal);
      const contexto = pareceSeguimiento ? await recuperarContextoCita(telefono, st) : st;
      if (contexto.paso === 'post_agendado' && st.paso !== 'post_agendado') {
        await agenda.setEstadoAgenda(telefono, contexto);
      }
      const seguimiento = respuestaSeguimientoCita(contexto, texto, idioma);
      const segura = respuestaMedicaSegura(texto, idioma);
      const consultaIA = contexto.paso === 'post_agendado' && contexto.citaConfirmada
        ? `[The patient already has a registered appointment. Do not recommend booking again and do not send a booking link. Answer only the new question.]\n${texto}`
        : texto;
      const usaIA = !seguimiento && !segura;
      respuesta = seguimiento || segura || await responderConIA(consultaIA, nombre, telefono, idioma, sendMessage);
      if (usaIA && consumioFalloTotal(telefono)) {
        respuesta = await escalarPorFalloBot(telefono, nombre, idioma, texto, 'ia_sin_respuesta');
        escalado = true;
      } else {
        if (!seguimiento) respuesta += pistaParaRetomar(contexto, idioma);
        if (!contexto.paso) await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    };

    // ═══════════════════════════════════════════════════════
    // NUEVO FLUJO GUIADO POR BOTONES
    // ═══════════════════════════════════════════════════════

    // Comandos globales: funcionan sin importar en que paso este el paciente.
    if (/^(menu|menÃº|inicio|start|volver|salir|reiniciar)$/.test(textoGlobal)) {
      await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
    }
    else if (/^(gracias|muchas gracias|thanks|thank you|listo)$/.test(textoGlobal)) {
      await agenda.resetEstadoAgenda(telefono);
      respuesta = idioma === 'en' ? 'You are welcome. I am here whenever you need us.' : 'Con gusto. Estoy aqui cuando nos necesites.';
    }
    else if (intencionGlobal === 'hablar_asesor') {
      const dentroDeHorario = isBusinessHours();
      const advisor = await requestAdvisor(telefono, nombre, idioma, texto, { pauseBot: dentroDeHorario });
      if (dentroDeHorario) {
        respuesta = idioma === 'en'
          ? (advisor ? `I am connecting you with ${advisor.nombre}. They will contact you as soon as possible.` : 'We are looking for an available advisor. We will contact you as soon as possible.')
          : (advisor ? `Te estoy conectando con ${advisor.nombre}. Se comunicará contigo lo más pronto posible.` : 'Estamos buscando un asesor disponible. Nos comunicaremos contigo lo más pronto posible.');
      } else {
        // No advisor is staffing the chat right now. Queue the request for
        // the morning, but keep Sofía active instead of going silent.
        respuesta = idioma === 'en'
          ? 'Our advisors are available from 8:30 AM to 6:00 PM. I have noted your request and someone will reach out as soon as that window opens. In the meantime I can answer questions, or help you book, reschedule or cancel an appointment.'
          : 'Nuestros asesores atienden de 8:30 a.m. a 6:00 p.m. Ya dejé registrada tu solicitud y alguien te va a contactar apenas empiece ese horario. Mientras tanto puedo resolver dudas, o ayudarte a agendar, reagendar o cancelar una cita.';
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    }
    // El paciente escribió (casi) lo mismo 3 veces seguidas sin que el bot lo
    // resolviera: se escala en vez de intentar una cuarta vez.
    else if (repeticiones >= 2) {
      await setSesion(telefono, { repeticiones: 0 });
      respuesta = await escalarPorFalloBot(telefono, nombre, idioma, texto, 'mensaje_repetido');
      escalado = true;
    }
    else if (st.paso && st.paso !== 'menu_principal' && /^(hola|hello|hey|buenas|buenos dias|buenas tardes)$/.test(textoGlobal)) {
      respuesta = (idioma === 'en' ? 'Hello! We can continue whenever you are ready.' : 'Hola. Podemos continuar cuando quieras.') + pistaParaRetomar(st, idioma);
    }
    else if (interrumpeFlujo && intencionGlobal === 'reagendar_cita') {
      if (st.leadId && st.email) {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_dia', esReagenda: true });
        listRespuesta = listaDiasReagenda(idioma);
      } else {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', accion: 'reagendar' });
        respuesta = idioma === 'en'
          ? 'To reschedule an existing appointment, please enter the email used for your Stemwell record.'
          : 'Para reagendar una cita existente, escribe el correo usado en tu registro de Stemwell.';
      }
    }
    else if (interrumpeFlujo && intencionGlobal === 'cancelar_cita') {
      if (st.leadId) {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'confirmar_cancelar' });
        botonesRespuesta = {
          texto: idioma === 'en' ? 'Do you confirm the appointment cancellation?' : 'Confirmas la cancelacion de tu cita?',
          botones: idioma === 'en' ? ['Yes, cancel', 'No'] : ['Si, cancelar', 'No'],
        };
      } else {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', accion: 'cancelar' });
        respuesta = idioma === 'en'
          ? 'To cancel an existing appointment, please enter the email used for your Stemwell record.'
          : 'Para cancelar una cita existente, escribe el correo usado en tu registro de Stemwell.';
      }
    }
    else if (parecePreguntaLibre(texto) && !esEntradaEsperada(st, texto) && intencionGlobal === 'informacion') {
      await responderPreguntaLibre();
    }

    // ── PASO: MENÚ PRINCIPAL ──
    else if (st.paso === 'menu_principal') {
      if (/(agendar valoracion|book assessment)/.test(normalizarAux(texto))) {
        await agenda.setEstadoAgenda(telefono, empezarValoracion(st));
        listRespuesta = listaTiposConsulta(idioma);
        listRespuesta.texto = (idioma === 'en' ? 'The assessment is a consultation with the doctor. ' : 'La valoracion es una consulta con el medico. ') + listRespuesta.texto;
      } else if (/(agendar (otra )?sesion|book (another )?session)/.test(normalizarAux(texto))) {
        if (!st.servicioClave) {
          await agenda.setEstadoAgenda(telefono, { paso: 'pedir_servicio', accion: 'agendar' });
          listRespuesta = listaServicios(idioma);
        } else if (st.leadId) {
          const r = await prepararSesiones({ st, lead: { id: st.leadId, nombre: st.leadNombre }, nombre, idioma });
          await agenda.setEstadoAgenda(telefono, r.estado);
          if (r.lista) listRespuesta = r.lista; else botonesRespuesta = { texto: r.texto, botones: r.botones };
        } else {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', accion: 'sesion' });
          respuesta = idioma === 'en' ? 'To find your pack, type the email you registered with.' : 'Para encontrar tu paquete, escribe el correo con el que te registraste.\n\n(Ej: nombre@correo.com)';
          sinBotonesLibres = true;
        }
      } else if (texto.includes('📅 Agendar') || intencionGlobal === 'agendar_cita') {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_servicio', accion: 'agendar' });
        listRespuesta = listaServicios(idioma);
      } else if (texto.includes('🔄 Reagendar') || intencionGlobal === 'reagendar_cita') {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'reagendar' });
        respuesta = pedirEmailIdentidad();
      } else if (texto.includes('❌ Cancelar') || intencionGlobal === 'cancelar_cita') {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'cancelar' });
        respuesta = pedirEmailIdentidad();
      } else {
        // Mostrar menú principal con botones
        const menuText = normalizarAux(texto);
        if (/(conocer|about|informacion|information)/.test(menuText)) {
          botonesRespuesta = {
            texto: informacionStemwell(idioma),
            botones: idioma === 'en' ? ['Book appointment', 'Reception', 'Menu'] : ['Agendar cita', 'Recepcion', 'Menu'],
          };
        } else if (/(recepcion|reception|especialista|specialist)/.test(menuText)) {
          botonesRespuesta = {
            texto: idioma === 'en'
              ? 'You can contact reception at *+57 310 406 8755*. I can also help you book here.'
              : 'Puedes comunicarte con recepcion al *+57 310 406 8755*. Tambien puedo ayudarte a agendar por este chat.',
            botones: idioma === 'en' ? ['Book appointment', 'Menu'] : ['Agendar cita', 'Menu'],
          };
        } else if (esConversacionAbierta(texto) && !esIntencionAgenda) {
          // Consulta escrita con libertad: se conversa, no se repite el menu.
          await responderPreguntaLibre();
        } else {
          botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
        }
        if (!respuesta) await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    }

    // ── PASO: SIN ESTADO (primera interacción) → menú, o conversación si ya escribió algo real ──
    else if (!st.paso || st.paso === 'inicio') {
      if (esConversacionAbierta(texto) && !esIntencionAgenda) {
        await responderPreguntaLibre();
      } else {
        botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    }

    // ── PASO: ELEGIR SERVICIO (consulta, rehabilitacion, recuperacion, presoterapia, camara, paquetes) ──
    else if (st.paso === 'pedir_servicio') {
      const s = normalizarAux(texto);
      const botonesBase = idioma === 'en' ? ['Book session', 'Speak to an advisor', 'Menu'] : ['Agendar sesion', 'Hablar con un asesor', 'Menu'];
      const botonesConValoracion = idioma === 'en' ? ['Book session', 'Book assessment', 'Menu'] : ['Agendar sesion', 'Agendar valoracion', 'Menu'];
      const clave = /(paquete|combinad|package)/.test(s) ? 'paquetes'
        : /(hiperb|camara|chamber)/.test(s) ? 'camara'
        : /(presoter|pressoth)/.test(s) ? 'presoterapia'
        : /(recuper|descarga|muscular|recovery)/.test(s) ? 'recuperacion'
        : /(rehab|fisio|physio)/.test(s) ? 'rehab'
        : null;
      if (clave) {
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal', servicioClave: clave });
        botonesRespuesta = { texto: infoServicio(clave, idioma), botones: (clave === 'camara' || clave === 'paquetes') ? botonesConValoracion : botonesBase };
      } else if (/(consult|medic|physician|doctor)/.test(s)) {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_tipo' });
        listRespuesta = listaTiposConsulta(idioma);
      } else {
        listRespuesta = listaServicios(idioma);
      }
    }

    // ── PASO: ELEGIR TIPO DE CITA ──
    else if (st.paso === 'pedir_tipo') {
      const typeText = normalizarAux(texto);
      if (typeText.includes('pagina') || typeText.includes('website') || typeText.includes('medilink')) {
        await agenda.resetEstadoAgenda(telefono);
        respuesta = (idioma === 'en' ? 'You can book directly here: ' : 'Puedes agendar directamente aqui: ') + AGENDA_URL;
      } else {
        const tipoConsulta = typeText.includes('virtual') ? 'Consulta virtual - $50.000 COP'
          : (typeText.includes('presencial') || typeText.includes('in-person')) ? 'Consulta presencial - $80.000 COP'
          : null;
        if (!tipoConsulta) {
          // Una lista vieja (con la consultoria que ya no existe) o un texto que no es de la lista: se vuelve a preguntar.
          listRespuesta = listaTiposConsulta(idioma);
        } else {
        let doctores = await getDoctoresActivos().catch(() => []);
        const soloGustavo = st.valoracion ? doctores.filter(d => normalizarAux(d.nombre).includes(MEDICO_VALORACION)) : [];
        if (soloGustavo.length === 1) {
          // La valoracion previa de la camara la hace solo el Dr. Gustavo Castro: no se pregunta el medico.
          const sel = soloGustavo[0];
          const intro = idioma === 'en' ? `Your assessment will be with ${sel.nombre}. ` : `Tu valoracion sera con ${sel.nombre}. `;
          if (st.leadId && st.email) {
            await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_dia', tipoConsulta, doctorId: sel.id, doctorNombre: sel.nombre });
            listRespuesta = listaDiasSesion(idioma, intro + (idioma === 'en' ? 'Which day would you like?' : '📅 ¿Para qué día te gustaría agendar?'));
          } else {
            await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', tipoConsulta, doctorId: sel.id, doctorNombre: sel.nombre });
            respuesta = intro + '\n\n' + (idioma === 'en' ? 'Please enter your email so I can find your patient record and appointments.' : pedirEmailIdentidad());
          }
        } else if (doctores.length) {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_doctor', tipoConsulta, doctores });
          listRespuesta = {
            texto: idioma === 'en' ? 'Choose the physician for your appointment.' : 'Elige el medico para tu cita.',
            buttonLabel: idioma === 'en' ? 'Choose physician' : 'Elegir medico',
            sections: [{ title: idioma === 'en' ? 'Physicians' : 'Medicos', rows: doctores.map(d => ({ id: 'doctor_' + d.id, title: d.nombre })) }],
          };
        } else {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', tipoConsulta });
          respuesta = idioma === 'en' ? 'Please enter your email so I can find your patient record and appointments.' : pedirEmailIdentidad();
        }
        }
      }
    }

    // ── PASO: ELEGIR CUAL PAQUETE (si tiene mas de uno del servicio) ──
    else if (st.paso === 'sesion_paquete') {
      const m = /^\s*(\d+)\./.exec(texto) || /^opc_(\d+)$/.exec(texto);
      const idx = m ? (m[0].startsWith('opc_') ? parseInt(m[1], 10) : parseInt(m[1], 10) - 1) : -1;
      const opcion = (st.opciones || [])[idx];
      if (!opcion) {
        respuesta = idioma === 'en' ? 'Please choose a pack from the list.' : 'Por favor elige un paquete de la lista.';
      } else {
        const r = elegirOpcionSesion({ base: { paso: 'menu_principal', servicioClave: st.servicioClave }, persona: { leadId: st.leadId, leadNombre: st.leadNombre, email: st.email }, opcion, idioma });
        await agenda.setEstadoAgenda(telefono, r.estado);
        listRespuesta = r.lista;
      }
    }

    // ── PASO: ¿CUANTAS SESIONES AGENDAR AHORA? ──
    else if (st.paso === 'sesion_cantidad') {
      const m = /(\d+)/.exec(texto);
      const n = m ? parseInt(m[1], 10) : 0;
      if (!n || n > Math.min(st.opcion.restantes, 10)) {
        listRespuesta = listaCantidad(st.opcion, idioma);
      } else {
        const r = empezarDias({ base: { paso: 'menu_principal', servicioClave: st.servicioClave }, persona: { leadId: st.leadId, leadNombre: st.leadNombre, email: st.email }, opcion: st.opcion, total: n, idioma });
        await agenda.setEstadoAgenda(telefono, r.estado);
        listRespuesta = r.lista;
      }
    }

    // ── PASO: ELEGIR DIA DE LA SESION ──
    else if (st.paso === 'sesion_dia') {
      const dia = extraerDiaSeleccionado(texto);
      if (!dia) {
        listRespuesta = listaDiasSesion(idioma, idioma === 'en' ? 'Please choose a day from the list.' : 'Por favor elige un dia de la lista.');
      } else {
        const fecha = fechaParaDia(dia);
        const h = await crmInterno.horariosLibres(st.opcion.paquete_id, fechaISO(fecha));
        if (!h.ok) {
          respuesta = (idioma === 'en' ? 'I had a problem checking the schedule. Reception can help you: ' : 'Tuve un problema consultando los horarios. Recepcion te ayuda: ') + TXT_RECEPCION + '.';
        } else if (!(h.data.libres || []).length) {
          listRespuesta = listaDiasSesion(idioma, (idioma === 'en' ? 'There are no times free on ' : 'Ese dia no hay horas libres (') + formatearFecha(fecha) + (idioma === 'en' ? '. Choose another day.' : '). Elige otro dia.'));
        } else {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'sesion_hora', fechaISO: fechaISO(fecha), horarios: h.data.libres });
          listRespuesta = listaHorasSesion(h.data.libres, fecha, idioma);
        }
      }
    }

    // ── PASO: ELEGIR HORA DE LA SESION Y RESERVAR ──
    else if (st.paso === 'sesion_hora') {
      const s = normalizarAux(texto);
      const fecha = new Date(st.fechaISO + 'T12:00:00');
      const hora = extraerHora(texto);
      const en = idioma === 'en';
      if (/(otro dia|another day)/.test(s)) {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'sesion_dia' });
        listRespuesta = listaDiasSesion(idioma, textoDia(st.opcion, st.total || 1, (st.reservadas || []).length, idioma));
      } else if (!hora || !(st.horarios || []).includes(hora)) {
        listRespuesta = listaHorasSesion(st.horarios || [], fecha, idioma);
      } else {
        const r = await crmInterno.agendarSesion({ leadId: st.leadId, paqueteId: st.opcion.paquete_id, fecha: st.fechaISO, hora, componente: st.opcion.componente });
        const base = { paso: 'menu_principal', servicioClave: st.servicioClave, leadId: st.leadId, leadNombre: st.leadNombre, email: st.email };
        const previas = st.reservadas || [];
        const total = st.total || 1;
        const lineas = (lista) => lista.map(x => '- ' + formatearFecha(new Date(x.fecha + 'T12:00:00')) + (en ? ' at ' : ' a las ') + x.hora).join('\n');
        const pila = String(st.leadNombre || nombre || '').split(' ')[0];
        if (r.ok) {
          const reservadas = [...previas, { fecha: st.fechaISO, hora }];
          if (reservadas.length < total) {   // faltan sesiones por elegir
            await agenda.setEstadoAgenda(telefono, { ...st, paso: 'sesion_dia', reservadas, hechas: reservadas.length, fechaISO: null, horarios: null });
            listRespuesta = listaDiasSesion(idioma, (en ? 'Booked: ' : 'Agendada: ') + formatearFecha(fecha) + (en ? ' at ' : ' a las ') + hora + '.\n\n' + textoDia(st.opcion, total, reservadas.length, idioma));
          } else {
            const quedan = Math.max(0, (st.opcion.restantes || reservadas.length) - reservadas.length);
            await agenda.setEstadoAgenda(telefono, base);
            const lugar = 'Cra 13 #118-08, Bogota - https://maps.app.goo.gl/3WFrcsNHF2zjzJtP6';
            const texto2 = en
              ? `Done${pila ? ', ' + pila : ''}! Your *${st.opcion.etiqueta}* ${reservadas.length > 1 ? 'sessions are' : 'session is'} booked:\n${lineas(reservadas)}\n\nSessions left to book in this pack: ${quedan}.\nLocation: ${lugar}\nTo change or cancel, contact reception: ${TXT_RECEPCION}.`
              : `Listo${pila ? ', ' + pila : ''}! ${reservadas.length > 1 ? 'Quedaron agendadas tus sesiones' : 'Quedo agendada tu sesion'} de *${st.opcion.etiqueta}*:\n${lineas(reservadas)}\n\nSesiones por agendar en este paquete: ${quedan}.\nUbicacion: ${lugar}\nPara cambiarlas o cancelarlas, comunicate con recepcion: ${TXT_RECEPCION}.`;
            botonesRespuesta = { texto: texto2, botones: quedan > 0 ? [en ? 'Book another session' : 'Agendar otra sesion', 'Menu'] : ['Menu'] };
          }
        } else if (r.status === 409) {
          const h = await crmInterno.horariosLibres(st.opcion.paquete_id, st.fechaISO);
          const libres = h.ok ? (h.data.libres || []) : [];
          if (libres.length) {
            await agenda.setEstadoAgenda(telefono, { ...st, horarios: libres });
            listRespuesta = listaHorasSesion(libres, fecha, idioma);
            listRespuesta.texto = (en ? 'That time was just taken. ' : 'Esa hora acaba de ocuparse. ') + listRespuesta.texto;
          } else {
            await agenda.setEstadoAgenda(telefono, { ...st, paso: 'sesion_dia' });
            listRespuesta = listaDiasSesion(idioma, en ? 'That day has no times left. Choose another day.' : 'Ese dia ya no tiene horas libres. Elige otro dia.');
          }
        } else {
          await agenda.setEstadoAgenda(telefono, base);
          const antes = previas.length ? (en ? 'These are booked:\n' : 'Estas quedaron agendadas:\n') + lineas(previas) + '\n\n' : '';
          botonesRespuesta = { texto: antes + (en ? 'I could not book the next one. Reception can help you: ' : 'No pude agendar la siguiente. Recepcion te ayuda: ') + TXT_RECEPCION + '.', botones: en ? ['Speak to an advisor', 'Menu'] : ['Hablar con un asesor', 'Menu'] };
        }
      }
    }

    // ── PASO: SIN BONO — ELEGIR QUE QUIERE ──
    else if (st.paso === 'solicitud_bono') {
      const s = normalizarAux(texto);
      const bonos = BONOS[st.servicioClave] || [];
      if (/(valoracion|assessment)/.test(s)) {
        await agenda.setEstadoAgenda(telefono, empezarValoracion(st));
        listRespuesta = listaTiposConsulta(idioma);
        listRespuesta.texto = (idioma === 'en' ? 'The assessment is a consultation with the doctor. ' : 'La valoracion es una consulta con el medico. ') + listRespuesta.texto;
      } else {
      const m = /^bono_(\d+)$/.exec(texto);
      const bono = m ? bonos[parseInt(m[1], 10)] : bonos.find(b => normalizarAux(b.titulo) === s);
      if (!bono) {
        listRespuesta = listaBonos(st.servicioClave, idioma, idioma === 'en' ? 'Please choose an option from the list.' : 'Por favor elige una opcion de la lista.');
      } else {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'solicitud_detalle', bono });
        const valoracion = st.servicioClave === 'camara' || st.servicioClave === 'paquetes'
          ? (idioma === 'en' ? '\n\nThe hyperbaric chamber requires a prior assessment; reception will arrange it if you do not have one yet.' : '\n\nLa camara hiperbarica requiere valoracion previa; recepcion la coordina contigo si aun no la tienes.')
          : '';
        respuesta = (idioma === 'en'
          ? `Great: ${bono.titulo}. Tell me which days and times work for you, for example: Tuesdays and Thursdays in the afternoon.`
          : `Perfecto: ${bono.titulo}. Cuentame que dias y horarios te sirven, por ejemplo: martes y jueves en la tarde.`) + valoracion;
      }
      }
    }

    // ── PASO: SIN BONO — DISPONIBILIDAD Y SOLICITUD PARA RECEPCION ──
    else if (st.paso === 'solicitud_detalle') {
      const en = idioma === 'en';
      const r = await crmInterno.solicitudSesiones({
        leadId: st.leadId, servicio: SERVICIO_NOMBRE[st.servicioClave] || st.servicioClave,
        bono: st.bono.titulo + ' · ' + st.bono.desc, detalle: texto.trim().slice(0, 500),
      });
      await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal', servicioClave: st.servicioClave, leadId: st.leadId, leadNombre: st.leadNombre, email: st.email });
      if (r.ok) {
        botonesRespuesta = { texto: en
          ? `Done! I left your request for ${st.bono.titulo} with reception. They will contact you to confirm the schedule and the payment.`
          : `Listo! Deje tu solicitud de ${st.bono.titulo} con recepcion. Te contactaran para confirmar los horarios y el pago.`, botones: ['Menu'] };
      } else {
        botonesRespuesta = { texto: (en ? 'I could not leave your request. Reception can help you: ' : 'No pude dejar tu solicitud. Recepcion te ayuda: ') + TXT_RECEPCION + '.', botones: en ? ['Speak to an advisor', 'Menu'] : ['Hablar con un asesor', 'Menu'] };
      }
    }

    // ── PASO: ELEGIR MEDICO ──
    else if (st.paso === 'pedir_doctor') {
      const selected = (st.doctores || []).find(d => normalizarAux(texto).includes(normalizarAux(d.nombre)) || normalizarAux(texto) === 'doctor_' + d.id);
      if (!selected) {
        respuesta = idioma === 'en' ? 'Please choose a physician from the list.' : 'Por favor elige un medico de la lista.';
      } else {
        if (st.leadId && st.email) {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_dia', doctorId: selected.id, doctorNombre: selected.nombre });
          listRespuesta = listaDiasSesion(idioma, idioma === 'en' ? 'Which day would you like your appointment?' : '📅 ¿Para qué día te gustaría agendar tu cita?');
        } else {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', doctorId: selected.id, doctorNombre: selected.nombre });
          respuesta = idioma === 'en' ? 'Please enter your email so I can find your patient record and appointments.' : pedirEmailIdentidad();
        }
      }
    }

    // ── PASO: PEDIR CORREO (validación de identidad) ──
    else if (st.paso === 'pedir_correo') {
      if (esCorreoCliente(texto)) {
        const email = texto.trim();
        const lead = await buscarLeadTrasValidar(telefono, email);
        if (st.accion === 'sesion') {
          const r = await prepararSesiones({ st: { ...st, email }, lead, nombre, idioma });
          await agenda.setEstadoAgenda(telefono, r.estado);
          if (r.lista) listRespuesta = r.lista; else botonesRespuesta = { texto: r.texto, botones: r.botones };
        } else if (lead) {
          // Es cliente existente
          const citas = await identidad.getCitasPorTelefono({ pool, telefono, leadId: lead.id });
          await agenda.setEstadoAgenda(telefono, {
            ...st, paso: 'validado', email, leadId: lead.id, leadNombre: lead.nombre,
            tieneCita: citas.length > 0, citas,
          });
          if (citas.length > 0) {
            respuesta = 'Hola ' + (lead.nombre || nombre) + '! ✅ Encontramos tu registro.\n\nTus citas:\n' +
              citas.map(c => identidad.formatearCita(c)).join('\n') +
              '\n\n¿Qué deseas hacer?';
            botonesRespuesta = { texto: respuesta, botones: ['📅 Agendar otra', '🔄 Reagendar', '❌ Cancelar'] };
            respuesta = null;
          } else {
            respuesta = 'Hola ' + (lead.nombre || nombre) + '! ✅ Te tenemos registrado, pero *no tienes una cita agendada*.\n\n¿Te gustaría agendar una cita?';
            botonesRespuesta = { texto: respuesta, botones: ['📅 Sí, agendar', '🔄 No gracias'] };
            respuesta = null;
          }
        } else {
          // No es cliente aún (lead nuevo)
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'validado_nuevo', email });
          respuesta = 'No encontramos un registro con ese correo. 🆕\n\n¿Deseas agendar una cita como *nuevo paciente*?';
          botonesRespuesta = { texto: respuesta, botones: ['✅ Sí, agendar', '❌ No'] };
          respuesta = null;
        }
      } else {
        respuesta = 'Eso no parece un correo. 📧 Escribe tu correo completo, por ejemplo: *nombre@correo.com*';
      }
    }

    // ── PASO: CLIENTE VALIDADO (agendar nueva cita) ──
    else if (st.paso === 'validado' || st.paso === 'validado_nuevo') {
      const quiereAgendar =
        texto.includes('Sí, agendar') || texto.includes('Agendar otra') ||
        intencionGlobal === 'agendar_cita';
      if (quiereAgendar) {
        // Mostrar días (Lunes a Sábado) como lista interactiva
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_dia' });
        listRespuesta = {
          texto: '📅 ¿Para qué día te gustaría agendar tu cita?',
          buttonLabel: 'Elegir día',
          sections: [{
            title: 'Día de la cita',
            rows: DIAS_MENU.map((d, i) => ({
              id: 'dia_' + normalizarAux(d),
              title: d,
              description: formatearFecha(fechaParaDia(normalizarAux(d))),
            })),
          }],
        };
        respuesta = null;
      } else if (texto.includes('Reagendar') || intencionGlobal === 'reagendar_cita') {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_dia', esReagenda: true });
        listRespuesta = {
          texto: '🔄 ¿Para qué *nuevo día* quieres reagendar tu cita?',
          buttonLabel: 'Elegir día',
          sections: [{
            title: 'Nuevo día',
            rows: DIAS_MENU.map((d, i) => ({
              id: 'dia_' + normalizarAux(d),
              title: d,
              description: formatearFecha(fechaParaDia(normalizarAux(d))),
            })),
          }],
        };
        respuesta = null;
      } else if (texto.includes('Cancelar') || intencionGlobal === 'cancelar_cita') {
        respuesta = 'Estás por *cancelar* tu cita.\n\n¿Confirmas la cancelación?';
        botonesRespuesta = { texto: respuesta, botones: ['✅ Sí, cancelar', '❌ No'] };
        respuesta = null;
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'confirmar_cancelar' });
      } else if (texto.includes('No') || texto.includes('gracias')) {
        await agenda.resetEstadoAgenda(telefono);
        respuesta = '¡Entendido! 😊 Estoy aquí por si necesitas algo más.';
      } else {
        botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    }

    // ── PASO: SELECCIONAR DÍA ──
    else if (st.paso === 'seleccionar_dia') {
      const diaSel = extraerDiaSeleccionado(texto);
      // El texto de la lista viene como el título del día (ej "Lunes")
      const diaEncontrado = diaSel || (function () {
        const t = normalizarAux(texto);
        for (let i = 0; i < DIAS_MENU.length; i++) if (t.includes(normalizarAux(DIAS_MENU[i]))) return normalizarAux(DIAS_MENU[i]);
        return null;
      })();
      if (diaEncontrado) {
        const fecha = fechaParaDia(diaEncontrado);
        const { libres } = await agenda.getDisponibilidad({ pool, fecha, doctorNombre: st.doctorNombre || '' });
        if (!libres || !libres.length) {
          respuesta = 'Lo siento, para ' + formatearFecha(fecha) + ' no hay horarios disponibles. 😔\n\nElige otro día de la lista.';
          listRespuesta = {
            texto: respuesta, buttonLabel: 'Otro día',
            sections: [{ title: 'Otros días', rows: DIAS_MENU.map(d => ({ id: 'dia_' + normalizarAux(d), title: d })) }],
          };
          respuesta = null;
        } else {
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_hora', fecha: fecha.getTime() });
          respuesta = 'Para *' + formatearFecha(fecha) + '* tenemos estos horarios:\n\nElige el horario:';
          botonesRespuesta = { texto: respuesta, botones: libres.slice(0, 3).map(h => '🕐 ' + h) };
          respuesta = null;
          // Guardar horarios restantes para preguntar "ver más"
          await agenda.setEstadoAgenda(telefono, { ...st, paso: 'seleccionar_hora', fecha: fecha.getTime(), horarios: libres });
        }
      } else {
        listRespuesta = {
          texto: 'Por favor elige un día de la lista. 📅',
          buttonLabel: 'Elegir día',
          sections: [{
            title: 'Día de la cita',
            rows: DIAS_MENU.map(d => ({
              id: 'dia_' + normalizarAux(d),
              title: d,
              description: formatearFecha(fechaParaDia(normalizarAux(d))),
            })),
          }],
        };
      }
    }

    // ── PASO: SELECCIONAR HORA ──
    else if (st.paso === 'seleccionar_hora') {
      const horaElegida = extraerHora(texto);
      if (horaElegida) {
        const fecha = st.fecha;
        const hora = horaElegida;
        if (st.leadId && st.leadNombre && st.email) {
          // Cliente existente agendando/reagendando
          const agendado = await agendaReal(st, fecha, hora, nombre, telefono, idioma);
          if (agendado.ok) {
            await agenda.setEstadoAgenda(telefono, {
              ...st,
              paso: 'post_agendado',
              citaConfirmada: {
                leadId: st.leadId,
                fecha,
                hora,
                tipoConsulta: st.tipoConsulta || 'Consulta presencial - $80.000 COP',
                doctorId: st.doctorId || null,
                doctorNombre: st.doctorNombre || '',
              },
            });
          }
          respuesta = agendado.message;
          if (agendado.ok && st.valoracion) respuesta += idioma === 'en' ? '\n\nAfter your assessment, reception will help you with your pack and booking the chamber sessions.' : '\n\nDespues de tu valoracion, recepcion te ayuda con tu bono y a agendar las sesiones de camara.';
        } else {
          // Lead nuevo que se validó con correo
          const email = st.email;
          const reg = await registrarLeadNuevo({
            nombre: nombre || 'Paciente',
            telefono, email,
            fecha: new Date(fecha).toISOString().slice(0, 10),
            hora,
            doctorId: st.doctorId,
            tipoConsulta: st.tipoConsulta,
          });
          if (reg.ok) {
            await agenda.setEstadoAgenda(telefono, {
              ...st,
              paso: 'post_agendado',
              leadId: reg.leadId,
              leadNombre: nombre || 'Paciente',
              citaConfirmada: {
                leadId: reg.leadId,
                fecha,
                hora,
                tipoConsulta: st.tipoConsulta || 'Consulta presencial - $80.000 COP',
                doctorId: st.doctorId || null,
                doctorNombre: st.doctorNombre || '',
              },
            });
            respuesta = confirmacionCita(nombre, fecha, hora, st.tipoConsulta, idioma);
          } else {
            await agenda.resetEstadoAgenda(telefono);
            respuesta = 'Parece que ya existe un registro con esos datos. 📋 Agenda aquí: ' + AGENDA_URL;
          }
        }
      } else {
        respuesta = 'Elige un horario de la lista, por ejemplo: "17:00". 🕐';
        botonesRespuesta = { texto: respuesta, botones: (st.horarios || []).slice(0, 3).map(h => '🕐 ' + h) };
        respuesta = null;
      }
    }

    // ── PASO: CONFIRMAR CANCELACIÓN ──
    else if (st.paso === 'confirmar_cancelar') {
      if (/(^|,|\s)(si|yes)(,|\s|$).*cancel/.test(normalizarAux(texto)) || /^(si|yes)$/i.test(normalizarAux(texto))) {
        if (st.leadId) {
          await agenda.apiAgendar({ leadId: st.leadId, estado: 'Canceled' }).catch(function(e) {
            console.error('❌ cancelar:', e.message);
          });
        }
        await agenda.resetEstadoAgenda(telefono);
        respuesta = 'Tu cita ha sido *cancelada*. ✅\n\nSi deseas reagendar o necesitas ayuda, aquí estoy. 😊';
      } else {
        await agenda.resetEstadoAgenda(telefono);
        respuesta = '¡Perfecto! 👍 Mantenemos tu cita. ¿Te ayudo con algo más?';
      }
    }

    // ── OTROS MENSAJES: detectar intención y mostrar menú ──
    else {
      const t = normalizarAux(texto);
      const esAgenda = /(agendar|agenda cita|cita|reagendar|reservar|horario|disponibilidad)/.test(t) && !/(cancelar|anular)/.test(t);
      if (esAgenda) {
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
        botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
      } else {
        const intencion = detectarIntencion(texto);
        if (intencion === 'cancelar_cita') {
          await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'cancelar' });
          respuesta = pedirEmailIdentidad();
        } else if (intencion === 'reagendar_cita') {
          await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'reagendar' });
          respuesta = pedirEmailIdentidad();
        } else if (intencion === 'agendar_cita' || intencion === 'consultar_disponibilidad') {
          await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
          botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
        } else if (intencion === 'hablar_asesor') {
          respuesta = '¡Entendido! Un asesor de Stemwell te atenderá con gusto. 🙋\n\n📞 Escríbenos o llámanos al *+57 310 406 8755*\n\nUn asesor se comunicará contigo pronto.';
        } else {
          // Si no es flujo, usar IA
          respuesta = await responderConIA(texto, nombre, telefono, idioma, sendMessage);
          if (consumioFalloTotal(telefono)) {
            respuesta = await escalarPorFalloBot(telefono, nombre, idioma, texto, 'ia_sin_respuesta');
            escalado = true;
          }
        }
      }
    }

    // ═══ ENVÍO DE RESPUESTA (texto, botones o lista) ═══
    const pasosAgenda = ['solicitud_bono','solicitud_detalle','sesion_cantidad','sesion_paquete','sesion_dia','sesion_hora','pedir_servicio','pedir_tipo','pedir_doctor','pedir_correo','validado','validado_nuevo','seleccionar_dia','seleccionar_hora','confirmar_cancelar','post_agendado'];
    // Toda respuesta libre lleva siempre los botones: agendar, asesor y menu.
    if (respuesta && !botonesRespuesta && !listRespuesta && !pasosAgenda.includes(st.paso) && !sinBotonesLibres && intencionGlobal !== 'hablar_asesor' && !escalado) {
      botonesRespuesta = await prepararRespuestaConBotones(telefono, nombre, respuesta, idioma);
      respuesta = null;
    }
    if (botonesRespuesta && botonesRespuesta.botones && botonesRespuesta.botones.length > 0) {
      await pausaNatural();
      await sendButtons(telefono, botonesRespuesta.texto, botonesRespuesta.botones);
      await logMensaje(telefono, nombre, 'salida', botonesRespuesta.texto);
    } else if (listRespuesta && listRespuesta.sections) {
      await pausaNatural();
      await sendList(telefono, listRespuesta.texto, listRespuesta.buttonLabel, listRespuesta.sections);
      await logMensaje(telefono, nombre, 'salida', listRespuesta.texto);
    } else if (respuesta) {
      await pausaNatural();
      await sendMessage(telefono, respuesta);
      await logMensaje(telefono, nombre, 'salida', respuesta);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    await sendMessage(telefono, 'Lo siento, tuve un error. 🙏');
  }
}

// Función auxiliar: agendar cita para cliente existente (agendar/reagendar)
async function agendaReal(st, fecha, hora, nombre, telefono, idioma = 'es') {
  const lead = await buscarLeadTrasValidar(telefono, st.email);
  if (!lead) return { ok: false, message: '⚠️ No pudimos confirmar tu registro. Intenta de nuevo o agenda aquí: ' + AGENDA_URL };
  try {
    await agenda.apiAgendar({
      leadId: lead.id,
      estado: st.esReagenda ? 'Rescheduled' : 'Agendado',
      fecha: new Date(fecha).toISOString().slice(0, 10),
      hora,
      email: st.email || '',
      doctorId: st.doctorId || lead.doctor_id || undefined,
      tipoConsulta: st.tipoConsulta || 'Consulta presencial - $80.000 COP',
      notas: 'Cita ' + (st.esReagenda ? 'REAGENDADA' : 'AGENDADA') + ' por bot de WhatsApp - actualizar en Medilink.',
    });
    return { ok: true, message: confirmacionCita(lead.nombre || nombre, fecha, hora, st.tipoConsulta, idioma) };
  } catch (e) {
    console.error('❌ agendaReal:', e.message);
    return { ok: false, message: 'Tuvimos un problema al registrar tu cita. 🙏 Agenda aquí: ' + AGENDA_URL };
  }
}

module.exports = { handleIncomingMessage, esNotificacionFormularioCampana, telefonoWhatsAppValido, respuestaMedicaSegura };
