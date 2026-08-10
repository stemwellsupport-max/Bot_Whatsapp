// ============================================================
// commands/handlers.js - VERSION CON VALIDACION DE IDENTIDAD
// Flujo: agendar / cancelar / reagendar con validacion por
// email + telefono para identificar al paciente en el CRM.
// ============================================================

const { sendMessage, sendButtons, sendList } = require('../services/whatsapp');
const { upsertContactoBasico, logMensaje } = require('../services/postgres');
const { getSesion, setSesion } = require('../services/sesiones');
const { responderConIA, detectarIdioma } = require('../services/ia-local');
const { detectarIntencion } = require('../services/intents');
const agenda = require('../services/agenda');
const identidad = require('../services/identidad');
const { isPaused } = require('../services/human-control');

// Pool reusado desde postgres.js para consultas de lectura
const { pool } = require('../services/postgres');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

function pausaNatural() {
  const ms = Math.floor(Math.random() * 800) + 400;
  return new Promise(resolve => setTimeout(resolve, ms));
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
      botones: ['About Stemwell', 'Book appointment', 'Reception'],
    };
  }
  return {
    texto: 'Hola' + (nombre ? ' ' + nombre : '') + '. Soy Sofia, asistente virtual de Stemwell. Como puedo ayudarte?',
    botones: ['Conocer Stemwell', 'Agendar cita', 'Recepcion'],
  };
}

function informacionStemwell(idioma = 'es') {
  if (idioma === 'en') return 'Stemwell is a regenerative medicine clinic in Bogota. We provide responsible information about our procedures without diagnosing by chat. A physician must assess every individual case.\n\nFree medical advisory call: COP $0\nVirtual consultation: COP $50,000\nIn-person consultation: COP $80,000\n\nReception: +57 310 406 8755';
  return 'Stemwell es una clinica de medicina regenerativa en Bogota. Podemos orientarte sobre nuestros procedimientos sin diagnosticar por chat; cada caso debe ser valorado por un medico.\n\nConsultoria con el medico: sin costo\nConsulta virtual: $50.000 COP\nConsulta presencial: $80.000 COP\n\nRecepcion: +57 310 406 8755';
}

function confirmacionCita(nombre, fecha, hora, tipoConsulta, idioma = 'es') {
  const tipo = tipoConsulta || 'Consultoria sin costo';
  const virtual = normalizarAux(tipo).includes('virtual');
  const presencial = normalizarAux(tipo).includes('presencial');
  const precio = virtual ? '$50.000 COP' : presencial ? '$80.000 COP' : 'sin costo';
  const pago = virtual ? '\nPago: https://checkout.bold.co/payment/LNK_TOWWHZAP5P' : '';
  const fechaTexto = idioma === 'en'
    ? new Date(fecha).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : formatearFecha(new Date(fecha));
  if (idioma === 'en') return `Hello ${nombre || 'patient'}, your ${tipo} at Stemwell is scheduled for ${fechaTexto} at ${hora}. Price: ${precio}.${pago}\nLocation: Cra 13 #118-08, Bogota - https://maps.app.goo.gl/3WFrcsNHF2zjzJtP6\nBring your laboratory tests, diagnostic images and medical records.`;
  return `Hola ${nombre || 'paciente'}, confirmamos tu ${tipo} en Stemwell para el ${fechaTexto} a las ${hora}. Valor: ${precio}.${pago}\nUbicacion: Cra 13 #118-08, Bogota - https://maps.app.goo.gl/3WFrcsNHF2zjzJtP6\nPor favor trae tus pruebas de laboratorio, imagenes diagnosticas y copia de tu historia clinica.`;
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

async function handleIncomingMessage(message, contact) {
  const telefono = contact.wa_id;
  const nombre = contact.profile?.name || '';
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

  const sesion = await getSesion(telefono);
  const idioma = sesion.idioma || detectarIdioma(texto);

  console.log('📩 [' + telefono + '] ' + nombre + ': "' + texto + '" (' + idioma + ')');

  await upsertContactoBasico(telefono, nombre).catch(function(){});
  await logMensaje(telefono, nombre, 'entrada', texto);
  await setSesion(telefono, { mensajes: (sesion.mensajes || 0) + 1, idioma: idioma });

  // Cuando recepcion toma el chat desde el CRM, conservamos el historial pero
  // detenemos por completo las respuestas automaticas para evitar duplicados.
  if (await isPaused(telefono)) {
    console.log('[' + telefono + '] Conversacion bajo control humano');
    return;
  }

  try {
    const st = await agenda.getEstadoAgenda(telefono) || {};
    let respuesta = null;        // texto simple
    let botonesRespuesta = null; // {botones:[], texto}
    let listRespuesta = null;    // {texto, buttonLabel, sections}

    // ═══════════════════════════════════════════════════════
    // NUEVO FLUJO GUIADO POR BOTONES
    // ═══════════════════════════════════════════════════════

    // ── PASO: MENÚ PRINCIPAL ──
    if (st.paso === 'menu_principal') {
      if (texto.includes('📅 Agendar') || normalizarAux(texto).includes('agendar') || normalizarAux(texto).includes('book appointment')) {
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
      } else if (texto.includes('🔄 Reagendar') || normalizarAux(texto).includes('reagendar')) {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'reagendar' });
        respuesta = pedirEmailIdentidad();
      } else if (texto.includes('❌ Cancelar') || normalizarAux(texto).includes('cancelar')) {
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
        normalizarAux(texto).includes('agendar');
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
      } else if (texto.includes('Reagendar')) {
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
      } else if (texto.includes('Cancelar')) {
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
          await agenda.resetEstadoAgenda(telefono);
          respuesta = agendado;
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
          await agenda.resetEstadoAgenda(telefono);
          respuesta = reg.ok
            ? confirmacionCita(nombre, fecha, hora, st.tipoConsulta, idioma)
            : 'Parece que ya existe un registro con esos datos. 📋 Agenda aquí: ' + AGENDA_URL;
        }
      } else {
        respuesta = 'Elige un horario de la lista, por ejemplo: "17:00". 🕐';
        botonesRespuesta = { texto: respuesta, botones: (st.horarios || []).slice(0, 3).map(h => '🕐 ' + h) };
        respuesta = null;
      }
    }

    // ── PASO: CONFIRMAR CANCELACIÓN ──
    else if (st.paso === 'confirmar_cancelar') {
      if (texto.includes('Sí, cancelar') || /^(si|sí|yes)$/i.test(texto.trim())) {
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
          respuesta = '¡Entendido! Un asesor de Stemwell te atenderá con gusto. 🙋\n\n📞 Escríbenos o llámanos al *+57 310 406 8755*\n💬 O agenda tu evaluación SIN COSTO: ' + AGENDA_URL + '\n\nUn asesor se comunicará contigo pronto.';
        } else {
          // Si no es flujo, usar IA
          respuesta = await responderConIA(texto, nombre, telefono, idioma, sendMessage);
        }
      }
    }

    // ═══ ENVÍO DE RESPUESTA (texto, botones o lista) ═══
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
  if (!lead) return '⚠️ No pudimos confirmar tu registro. Intenta de nuevo o agenda aquí: ' + AGENDA_URL;
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
    return confirmacionCita(lead.nombre || nombre, fecha, hora, st.tipoConsulta, idioma);
  } catch (e) {
    console.error('❌ agendaReal:', e.message);
    return 'Tuvimos un problema al registrar tu cita. 🙏 Agenda aquí: ' + AGENDA_URL;
  }
}

module.exports = { handleIncomingMessage };
