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
  const m = t.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = String(parseInt(m[1], 10)).padStart(2, '0');
  const min = m[2] ? m[2] : '00';
  return h + ':' + min;
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
    if (t.startsWith(normalizarAux(DIAS_MENU[i]))) return normalizarAux(DIAS_MENU[i]);
  }
  return null;
}

// ══════════════════════════════════════════════════════════

// ── Registrar un LEAD NUEVO en el CRM (Fase 2) ─────────────
// Crea el lead y agenda la cita. Devuelve { ok, leadId, nombre }.
async function registrarLeadNuevo({ nombre, telefono, email, fecha, hora, doctorId }) {
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
      doctorId: doctorId || null,
      tipoConsulta: 'Primera Consulta',
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

  if (tipo === 'text') texto = message.text?.body || '';
  else if (tipo === 'interactive') texto = message.interactive?.button_reply?.title || '';

  if (!texto || texto.length < 2) return;

  const sesion = await getSesion(telefono);
  const idioma = sesion.idioma || detectarIdioma(texto);

  console.log('📩 [' + telefono + '] ' + nombre + ': "' + texto + '" (' + idioma + ')');

  await upsertContactoBasico(telefono, nombre).catch(function(){});
  await logMensaje(telefono, nombre, 'entrada', texto);
  await setSesion(telefono, { mensajes: (sesion.mensajes || 0) + 1, idioma: idioma });

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
      if (texto.includes('📅 Agendar') || (st.accion === 'agendar' && normalizarAux(texto).includes('agendar'))) {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'agendar' });
        respuesta = pedirEmailIdentidad();
      } else if (texto.includes('🔄 Reagendar') || normalizarAux(texto).includes('reagendar')) {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'reagendar' });
        respuesta = pedirEmailIdentidad();
      } else if (texto.includes('❌ Cancelar') || normalizarAux(texto).includes('cancelar')) {
        await agenda.setEstadoAgenda(telefono, { paso: 'pedir_correo', accion: 'cancelar' });
        respuesta = pedirEmailIdentidad();
      } else {
        // Mostrar menú principal con botones
        botonesRespuesta = menuPrincipal(nombre);
        await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
      }
    }

    // ── PASO: SIN ESTADO (primera interacción) → menú ──
    else if (!st.paso || st.paso === 'inicio') {
      botonesRespuesta = menuPrincipal(nombre);
      await agenda.setEstadoAgenda(telefono, { paso: 'menu_principal' });
    }

    // ── PASO: PEDIR CORREO (validación de identidad) ──
    else if (st.paso === 'pedir_correo') {
      if (esCorreoCliente(texto)) {
        const email = texto.trim();
        const lead = await buscarLeadTrasValidar(telefono, email);
        if (lead) {
          // Es cliente existente
          const citas = await identidad.getCitasPorTelefono({ pool, telefono });
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
        botonesRespuesta = menuPrincipal(nombre);
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
        const { libres } = await agenda.getDisponibilidad({ pool, fecha });
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
        respuesta = 'Por favor elige un día de la lista. 📅';
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
          const agendado = await agendaReal(st, fecha, hora, nombre, telefono);
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
          });
          await agenda.resetEstadoAgenda(telefono);
          respuesta = reg.ok
            ? '¡Listo! 🎉 reservamos tu cita para *' + formatearFecha(new Date(fecha)) + '* a las *' + hora + '*.\n\nTe confirmaremos por WhatsApp. ¡Nos vemos en Stemwell! 💙'
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
        botonesRespuesta = menuPrincipal(nombre);
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
          botonesRespuesta = menuPrincipal(nombre);
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
async function agendaReal(st, fecha, hora, nombre, telefono) {
  const lead = await buscarLeadTrasValidar(telefono, st.email);
  if (!lead) return '⚠️ No pudimos confirmar tu registro. Intenta de nuevo o agenda aquí: ' + AGENDA_URL;
  try {
    await agenda.apiAgendar({
      leadId: lead.id,
      estado: st.esReagenda ? 'Rescheduled' : 'Agendado',
      fecha: new Date(fecha).toISOString().slice(0, 10),
      hora,
      doctorId: lead.doctor_id || undefined,
      tipoConsulta: 'Primera Consulta',
      notas: 'Cita ' + (st.esReagenda ? 'REAGENDADA' : 'AGENDADA') + ' por bot de WhatsApp - actualizar en Medilink.',
    });
    return '¡Perfecto ' + (lead.nombre || nombre) + '! ✅ Tu cita quedó ' + (st.esReagenda ? 'reagendada' : 'reservada') + ' para *' + formatearFecha(new Date(fecha)) + '* a las *' + hora + '*.\n\nTe confirmaremos por WhatsApp. 💙';
  } catch (e) {
    console.error('❌ agendaReal:', e.message);
    return 'Tuvimos un problema al registrar tu cita. 🙏 Agenda aquí: ' + AGENDA_URL;
  }
}

module.exports = { handleIncomingMessage };
