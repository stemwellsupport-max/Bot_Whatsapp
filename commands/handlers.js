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
const identidad = require('../services/identidad');
const { isPaused, savePendingInbound, requestAdvisor, isBusinessHours } = require('../services/human-control');

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

function agregarOpcionesContacto(respuesta, idioma) {
  const texto = String(respuesta || '');
  const normalizado = normalizarAux(texto);
  const yaInvitaAgendar = /(agendar|agenda|book.*appointment|schedule.*appointment)/.test(normalizado);
  const yaInvitaAsesor = /(hablar.*asesor|asesor.*contact|speak.*advisor|advisor.*contact)/.test(normalizado);
  if (yaInvitaAgendar && yaInvitaAsesor) return texto;
  return texto + (idioma === 'en'
    ? '\n\nWould you like to *book an appointment* or *speak to an advisor*?'
    : '\n\n¿Te gustaría *agendar una cita* o *hablar con un asesor*?');
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

function informacionStemwell(idioma = 'es') {
  if (idioma === 'en') return 'Stemwell is a regenerative medicine clinic in Bogota. We provide responsible information about our procedures without diagnosing by chat. A physician must assess every individual case.\n\nFree medical advisory call: COP $0\nVirtual consultation: COP $50,000\nIn-person consultation: COP $80,000\n\nReception: +57 310 406 8755';
  return 'Stemwell es una clinica de medicina regenerativa en Bogota. Podemos orientarte sobre nuestros procedimientos sin diagnosticar por chat; cada caso debe ser valorado por un medico.\n\nConsultoria con el medico: sin costo\nConsulta virtual: $50.000 COP\nConsulta presencial: $80.000 COP\n\nRecepcion: +57 310 406 8755';
}

function confirmacionCita(nombre, fecha, hora, tipoConsulta, idioma = 'es') {
  const tipo = tipoConsulta || 'Consultoria sin costo';
  const consultoria = normalizarAux(tipo).includes('consultoria');
  const virtual = normalizarAux(tipo).includes('virtual');
  const presencial = normalizarAux(tipo).includes('presencial');
  const precio = virtual ? '$50.000 COP' : presencial ? '$80.000 COP' : 'sin costo';
  const pago = virtual ? '\nPago: https://checkout.bold.co/payment/LNK_TOWWHZAP5P' : '';
  const fechaTexto = idioma === 'en'
    ? new Date(fecha).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : formatearFecha(new Date(fecha));
  if (consultoria && idioma === 'en') {
    return `Hello ${nombre || 'patient'}, your free phone advisory call with a Stemwell physician is scheduled for ${fechaTexto} at ${hora}.\n\nThe physician will call you at this WhatsApp number. You do not need to come to the clinic.`;
  }
  if (consultoria) {
    return `Hola ${nombre || 'paciente'}, confirmamos tu consultoria telefonica sin costo con un medico de Stemwell para el ${fechaTexto} a las ${hora}.\n\nEl medico te llamara a este mismo numero de WhatsApp. No necesitas venir a la clinica.`;
  }
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
    /\b(que|como|cual|cuales|por que|puede|pueden|sirve|sirven|ayuda|ayudar|riesgo|peligro|contraindic|cancer|dolor|rodilla|hombro|espalda|celula|stem ?cell|prp|exosoma|foto\s*biomod|laser|tratamiento|procedimiento|difference|what|how|why|can|could|danger|risk|pain|knee|shoulder|back|cancer|certif|ubicacion|ubicaciones|direccion|donde|queda|llegar|mapa|address|location|where)\b/.test(t);
}

function esEntradaEsperada(st, texto) {
  const paso = st && st.paso;
  const t = normalizarAux(texto);
  if (!paso) return false;
  if (paso === 'pedir_correo') return esCorreoCliente(texto);
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
      ? 'I do not have a registered price for photobiomodulation, so I should not invent one. Reception can confirm the current price at +57 310 406 8755. The only free service is the physician advisory phone call; the virtual medical consultation costs COP $50,000 and the in-person medical consultation costs COP $80,000.'
      : 'No tengo registrado el precio de la fotobiomodulacion, por lo que no debo inventarlo. Recepcion puede confirmar el valor vigente en el +57 310 406 8755. Lo unico sin costo es la consultoria telefonica con el medico; la consulta medica virtual cuesta $50.000 COP y la presencial $80.000 COP.';
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
  if (!paso || paso === 'menu_principal') return idioma === 'en' ? '\n\nI can also help you book, reschedule or cancel an appointment.' : '\n\nTambien puedo ayudarte a agendar, reagendar o cancelar una cita.';
  const en = idioma === 'en';
  const pistas = {
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
      tipoConsulta: tipoConsulta || 'Consultoria sin costo',
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
    let escalado = false;        // true si ya se escalo a un asesor (evita el CTA redundante de abajo)
    const textoGlobal = normalizarAux(texto);
    const intencionGlobal = detectarIntencion(texto);
    const interrumpeFlujo = !['menu_principal', 'validado', 'validado_nuevo', 'confirmar_cancelar'].includes(st.paso);

    // El paciente repite (casi) el mismo mensaje varias veces seguidas: senal
    // de que el bot no esta logrando resolverle, sin importar por que camino
    // del flujo entre. Se ignoran mensajes cortos (si/no/gracias) para evitar
    // falsos positivos en confirmaciones normales del flujo de agenda.
    const esRepeticion = textoGlobal.length >= 4 && textoGlobal === (sesion.ultimo_msg_norm || '');
    const repeticiones = esRepeticion ? (sesion.repeticiones || 0) + 1 : 0;
    await setSesion(telefono, { ultimo_msg_norm: textoGlobal, repeticiones });

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
    }

    // ── PASO: MENÚ PRINCIPAL ──
    else if (st.paso === 'menu_principal') {
      if (texto.includes('📅 Agendar') || intencionGlobal === 'agendar_cita') {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_tipo', accion: 'agendar' });
        listRespuesta = {
          texto: idioma === 'en' ? 'What would you like to book?' : 'Que deseas agendar?',
          buttonLabel: idioma === 'en' ? 'Choose service' : 'Elegir servicio',
          sections: [{ title: idioma === 'en' ? 'Appointments' : 'Citas', rows: [
            { id: 'tipo_consultoria', title: idioma === 'en' ? 'Free advisory call' : 'Consultoria sin costo', description: idioma === 'en' ? 'Call with a physician - free' : 'Llamada con un medico - sin costo' },
            { id: 'tipo_virtual', title: idioma === 'en' ? 'Virtual consultation' : 'Consulta virtual', description: '$50.000 COP' },
            { id: 'tipo_presencial', title: idioma === 'en' ? 'In-person consult' : 'Consulta presencial', description: '$80.000 COP' },
            { id: 'tipo_medilink', title: idioma === 'en' ? 'Book on website' : 'Agendar en la pagina', description: 'Medilink' },
          ]}],
        };
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
        } else {
          botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
        }
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    }

    // ── PASO: SIN ESTADO (primera interacción) → menú ──
    else if (!st.paso || st.paso === 'inicio') {
      botonesRespuesta = menuPrincipalStemwell(nombre, idioma);
      await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
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
          : 'Consultoria sin costo';
        const doctores = await getDoctoresActivos().catch(() => []);
        if (doctores.length) {
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

    // ── PASO: ELEGIR MEDICO ──
    else if (st.paso === 'pedir_doctor') {
      const selected = (st.doctores || []).find(d => normalizarAux(texto).includes(normalizarAux(d.nombre)) || normalizarAux(texto) === 'doctor_' + d.id);
      if (!selected) {
        respuesta = idioma === 'en' ? 'Please choose a physician from the list.' : 'Por favor elige un medico de la lista.';
      } else {
        await agenda.setEstadoAgenda(telefono, { ...st, paso: 'pedir_correo', doctorId: selected.id, doctorNombre: selected.nombre });
        respuesta = idioma === 'en' ? 'Please enter your email so I can find your patient record and appointments.' : pedirEmailIdentidad();
      }
    }

    // ── PASO: PEDIR CORREO (validación de identidad) ──
    else if (st.paso === 'pedir_correo') {
      if (esCorreoCliente(texto)) {
        const email = texto.trim();
        const lead = await buscarLeadTrasValidar(telefono, email);
        if (lead) {
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
                tipoConsulta: st.tipoConsulta || 'Consultoria sin costo',
                doctorId: st.doctorId || null,
                doctorNombre: st.doctorNombre || '',
              },
            });
          }
          respuesta = agendado.message;
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
                tipoConsulta: st.tipoConsulta || 'Consultoria sin costo',
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
          respuesta = '¡Entendido! Un asesor de Stemwell te atenderá con gusto. 🙋\n\n📞 Escríbenos o llámanos al *+57 310 406 8755*\n💬 O agenda tu consultoria telefonica sin costo con el medico: ' + AGENDA_URL + '\n\nUn asesor se comunicará contigo pronto.';
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
    const pasosAgenda = ['pedir_tipo','pedir_doctor','pedir_correo','validado','validado_nuevo','seleccionar_dia','seleccionar_hora','confirmar_cancelar','post_agendado'];
    if (respuesta && !pasosAgenda.includes(st.paso) && intencionGlobal !== 'hablar_asesor' && !escalado) {
      respuesta = agregarOpcionesContacto(respuesta, idioma);
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
      tipoConsulta: st.tipoConsulta || 'Consultoria sin costo',
      notas: 'Cita ' + (st.esReagenda ? 'REAGENDADA' : 'AGENDADA') + ' por bot de WhatsApp - actualizar en Medilink.',
    });
    return { ok: true, message: confirmacionCita(lead.nombre || nombre, fecha, hora, st.tipoConsulta, idioma) };
  } catch (e) {
    console.error('❌ agendaReal:', e.message);
    return { ok: false, message: 'Tuvimos un problema al registrar tu cita. 🙏 Agenda aquí: ' + AGENDA_URL };
  }
}

module.exports = { handleIncomingMessage, esNotificacionFormularioCampana, telefonoWhatsAppValido, respuestaMedicaSegura };
