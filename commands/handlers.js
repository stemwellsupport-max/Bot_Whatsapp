const { sendMessage, sendButtons } = require('../services/whatsapp');
const {
  saveContacto, getContactoByTelefono, upsertContactoBasico, updateLeadData,
  logMensaje, guardarMensajeRAG, getHistorialRAG,
} = require('../services/postgres');
const { getSesion, setSesion, resetSesion } = require('../services/sesiones');
const { getRespuestaMedica } = require('../services/inteligencia');
const { responderConIA } = require('../rag/queryAI');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

// ═══════════════════════════
// UTILIDAD: RESUMIR TEXTO
// ═══════════════════════════
function resumirTexto(texto) {
  if (!texto) return 'No especificado';
  const tl = texto.toLowerCase();
  if (tl.includes('10 año') || tl.includes('diez año')) return '10 años';
  if (tl.includes('año') || tl.includes('años')) { const m = texto.match(/(\d+)\s*años?/); return m ? `${m[1]} años` : 'Varios años'; }
  if (tl.includes('mes')) { const m = texto.match(/(\d+)\s*meses?/); return m ? `${m[1]} meses` : 'Meses'; }
  if (tl.includes('semana')) return 'Semanas';
  if (tl.includes('cirugía') || tl.includes('cirugia') || tl.includes('operé') || tl.includes('opere')) return 'Cirugía previa';
  if (tl.includes('fisioterapia') || tl.includes('rehabilitación')) return 'Fisioterapia';
  if (tl.includes('medicamento') || tl.includes('antiinflamatorio')) return 'Medicamentos';
  if (tl.includes('inyección') || tl.includes('infiltración')) return 'Inyecciones';
  if (tl.includes('remedio') || tl.includes('natural')) return 'Remedios naturales';
  if (tl.includes('caminar')) return 'Dificultad al caminar';
  if (tl.includes('dormir') || tl.includes('noche')) return 'Le despierta en la noche';
  if (tl.includes('trabajo') || tl.includes('trabajar')) return 'Afecta su trabajo';
  if (tl.includes('ejercicio') || tl.includes('deporte')) return 'Le impide hacer ejercicio';
  return texto.length > 50 ? texto.slice(0, 50) + '...' : texto;
}

// ═══════════════════════════
// SALUDO INICIAL
// ═══════════════════════════
async function enviarSaludo(telefono, nombre) {
  const n = nombre.split(' ')[0] || 'amig@';
  await sendButtons(telefono,
    `👋 ¡Hola ${n}! Soy *Sofía*, asistente de *Stemwell Medicina Regenerativa*.\n\n¿Qué te trae por aquí hoy?`,
    ['🦵 Tengo dolor o lesión', '🧠 Condición neurológica', '✨ Longevidad y bienestar', '📅 Quiero agendar', '💬 Hablar con un asesor']
  );
}

// ═══════════════════════════
// FLUJO DOLOR
// ═══════════════════════════
async function flujoDolor(telefono, texto, sesion, contacto) {
  const nombre = (contacto?.nombre || 'Paciente').split(' ')[0];
  const tl = texto.toLowerCase();

  if (!sesion.dolor_descripcion) {
    let zona = 'articular';
    if (tl.includes('rodilla')) zona = 'la rodilla';
    else if (tl.includes('cadera')) zona = 'la cadera';
    else if (tl.includes('hombro')) zona = 'el hombro';
    else if (tl.includes('espalda') || tl.includes('lumbar') || tl.includes('columna')) zona = 'la espalda/columna';
    else if (tl.includes('cervical') || tl.includes('cuello')) zona = 'la zona cervical';
    else if (tl.includes('codo')) zona = 'el codo';
    else if (tl.includes('muñeca')) zona = 'la muñeca';
    else if (tl.includes('tobillo')) zona = 'el tobillo';
    else if (tl.includes('mano')) zona = 'las manos';
    else if (tl.includes('pie')) zona = 'los pies';
    else if (tl.includes('ciática')) zona = 'el nervio ciático';
    else if (tl.includes('hernia')) zona = 'una hernia discal';
    else if (tl.includes('artritis') || tl.includes('artrosis')) zona = 'las articulaciones';
    else if (tl.includes('tendinitis') || tl.includes('tendon') || tl.includes('tendón')) zona = 'un tendón';
    setSesion(telefono, { paso: 'dolor_tiempo', dolor_descripcion: texto, dolor_zona: zona });
    await sendMessage(telefono, `Entiendo, ${nombre}. Vivir con molestia en *${zona}* puede ser muy desgastante. 😔\n\n¿Hace cuánto tiempo empezó? Cuéntame con tus palabras.`);
    return;
  }
  if (!sesion.dolor_tiempo) {
    setSesion(telefono, { paso: 'dolor_tratamientos', dolor_tiempo: texto });
    await sendMessage(telefono, `Gracias. ¿Has intentado algún tratamiento? Medicamentos, fisioterapia, cirugía... o dime "no he probado nada".`);
    return;
  }
  if (!sesion.dolor_tratamientos) {
    setSesion(telefono, { paso: 'dolor_impacto', dolor_tratamientos: texto });
    await sendMessage(telefono, `Te entiendo. ¿Cómo afecta este dolor tu día a día? ¿Caminar, dormir, trabajar?`);
    return;
  }
  if (!sesion.dolor_impacto) {
    const tieneNombre = contacto?.nombre && contacto.nombre !== '' && contacto.nombre !== 'Paciente';
    const tieneEmail = contacto?.email && contacto.email !== '';
    if (!tieneNombre) {
      setSesion(telefono, { paso: 'dolor_pedir_nombre', dolor_impacto: texto, menciono_dolor: true });
      await sendMessage(telefono, `✨ ${nombre}, gracias por compartir tu historia.\n\nAntes de continuar, necesito tu *nombre completo*:`);
      return;
    }
    if (!tieneEmail) {
      setSesion(telefono, { paso: 'dolor_pedir_email', dolor_impacto: texto, menciono_dolor: true });
      await sendMessage(telefono, `Gracias, ${contacto.nombre.split(' ')[0]}. 🙏\n\nAhora necesito tu *correo electrónico*:`);
      return;
    }
    await enviarOfertaFinal(telefono, nombre, sesion, contacto);
    return;
  }
  if (sesion.paso === 'dolor_pedir_nombre') {
    await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
    setSesion(telefono, { paso: 'dolor_pedir_email', dolor_impacto: sesion.dolor_impacto, menciono_dolor: true });
    await sendMessage(telefono, `Gracias, *${texto.split(' ')[0]}*. 🙏\n\nAhora tu *correo electrónico*:`);
    return;
  }
  if (sesion.paso === 'dolor_pedir_email') {
    if (!texto.includes('@') || !texto.includes('.')) {
      await sendMessage(telefono, `Ese correo no parece válido. Revisa:\n_Ejemplo: tunombre@gmail.com_`);
      return;
    }
    await saveContacto({ nombre: contacto?.nombre || '', apellido: '', email: texto, telefono });
    const c = await getContactoByTelefono(telefono);
    await enviarOfertaFinal(telefono, nombre, sesion, c);
    return;
  }
}

// ═══════════════════════════
// OFERTA FINAL
// ═══════════════════════════
async function enviarOfertaFinal(telefono, nombre, sesion, contacto) {
  setSesion(telefono, { paso: 'inicio', menciono_dolor: true });
  await updateLeadData(telefono, { interes: 'dolor', dolor_principal: sesion.dolor_zona, nivel_interes: 'hot' });
  await sendButtons(telefono,
    `✨ *${nombre}*, gracias por compartir tu historia.\n\n` +
    `Esto entendí:\n• Dolor en *${sesion.dolor_zona}*\n• Tiempo: *${resumirTexto(sesion.dolor_tiempo)}*\n• Tratamientos: *${resumirTexto(sesion.dolor_tratamientos)}*\n• Impacto: *${resumirTexto(sesion.dolor_impacto || '')}*\n\n` +
    `👤 ${contacto?.nombre}\n📧 ${contacto?.email}\n📱 ${telefono}\n\n` +
    `En Stemwell trabajamos con *medicina regenerativa*. El primer paso es una *evaluación SIN COSTO* con el Dr. Camilo White.\n\n¿Agendamos?`,
    ['✅ Sí, agendar', '📞 Que me llamen', '📋 Más información']
  );
}

// ═══════════════════════════
// FLUJO AGENDAR
// ═══════════════════════════
async function flujoAgendar(telefono, texto, sesion, contacto) {
  const nombre = (contacto?.nombre || 'Paciente').split(' ')[0];
  if (!contacto?.nombre || contacto.nombre === '') {
    setSesion(telefono, { paso: 'agenda_nombre' });
    await sendMessage(telefono, `🌟 ¡Qué bueno! Para agendar tu *evaluación gratuita*, necesito tu *nombre completo*:`);
    return;
  }
  if (!contacto?.email || contacto.email === '') {
    setSesion(telefono, { paso: 'agenda_email' });
    await sendMessage(telefono, `Gracias, ${contacto.nombre.split(' ')[0]}. 🙏\n\nAhora tu *correo electrónico*:`);
    return;
  }
  setSesion(telefono, { paso: 'inicio', quiere_agendar: true });
  await updateLeadData(telefono, { quiere_agendar: true, nivel_interes: 'hot' });
  await sendButtons(telefono,
    `✅ *${nombre}, todo listo.*\n\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\nAgenda tu evaluación:`,
    ['📅 Agendar ahora', '📞 Prefiero que me llamen']
  );
}

// ═══════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════
async function handleIncomingMessage(message, contact) {
  const telefono = contact.wa_id;
  const nombre = contact.profile?.name || '';
  const tipo = message.type;

  let texto = '';
  if (tipo === 'text') texto = message.text?.body || '';
  else if (tipo === 'interactive') texto = message.interactive?.button_reply?.title || '';
  if (!texto) return;
  const tl = texto.toLowerCase().trim();

  console.log(`📩 [${telefono}] ${nombre}: "${texto}"`);

  await upsertContactoBasico(telefono, nombre).catch(() => {});
  await logMensaje(telefono, nombre, 'entrada', texto);

  const sesion = getSesion(telefono);
  const contacto = await getContactoByTelefono(telefono);
  setSesion(telefono, { mensajes: sesion.mensajes + 1 });

  try {
    // ═══════════════════════════
    // COMANDOS GLOBALES
    // ═══════════════════════════
    if (['menu', 'menú', 'inicio', 'hola', 'hi', 'hello', 'buenas', '0'].includes(tl)) {
      resetSesion(telefono);
      await enviarSaludo(telefono, contacto?.nombre || nombre);
      return;
    }
    if (['cancelar', 'salir'].includes(tl)) {
      resetSesion(telefono);
      await sendMessage(telefono, `Cuando quieras, escribe *hola*. 😊`);
      return;
    }

    // ═══════════════════════════
    // FLUJOS ACTIVOS
    // ═══════════════════════════
    const esFlujoDolor = sesion.paso && (sesion.paso.startsWith('dolor_') || sesion.paso === 'dolor_pedir_nombre' || sesion.paso === 'dolor_pedir_email');
    if (esFlujoDolor) { await flujoDolor(telefono, texto, sesion, contacto); return; }

    if (sesion.paso === 'agenda_nombre') {
      await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
      setSesion(telefono, { paso: 'agenda_email' });
      await sendMessage(telefono, `Gracias, *${texto.split(' ')[0]}*. 🙏\n\nTu *correo electrónico*:`);
      return;
    }
    if (sesion.paso === 'agenda_email') {
      if (!texto.includes('@') || !texto.includes('.')) { await sendMessage(telefono, `Ese correo no parece válido. Revisa.`); return; }
      await saveContacto({ nombre: contacto?.nombre || '', apellido: '', email: texto, telefono });
      setSesion(telefono, { paso: 'inicio', quiere_agendar: true });
      await updateLeadData(telefono, { quiere_agendar: true, nivel_interes: 'hot' });
      await sendButtons(telefono, `✅ *Correo guardado.*\n\n👤 ${contacto?.nombre}\n📧 ${texto}\n📱 ${telefono}\n\nAgenda:`, ['📅 Agendar ahora', '📞 Que me llamen']);
      return;
    }

    // ═══════════════════════════
    // BOTONES PRINCIPALES
    // ═══════════════════════════
    if (tl.includes('dolor') || tl.includes('lesión') || tl.includes('🦵')) { await flujoDolor(telefono, texto, sesion, contacto); return; }
    if (tl.includes('agendar') || tl.includes('cita') || tl.includes('📅')) { await flujoAgendar(telefono, texto, sesion, contacto); return; }
    if (tl.includes('asesor') || tl.includes('hablar') || tl.includes('💬')) {
      await sendButtons(telefono, `👨‍⚕️ *Con mucho gusto.*\n📞 (+57) 311 501 1920\n📞 (+57) 314 807 9475\n🕘 Lun–Vie 8am–6pm\n\n¿Prefieres que te llamemos?`, ['📞 Sí, que me llamen', '✅ Ya mismo llamo']);
      return;
    }

    // ═══════════════════════════
    // BOTONES FINALES
    // ═══════════════════════════
    if (tl.includes('sí') || tl.includes('agendar') || tl.includes('✅')) {
      await sendMessage(telefono, `🗓️ *¡Perfecto!* Reserva aquí:\n👉 ${AGENDA_URL}\n\nSolo toma 2 minutos. ✅`);
      setSesion(telefono, { paso: 'inicio' }); return;
    }
    if (tl.includes('llamen') || tl.includes('llamar') || tl.includes('📞')) {
      await sendMessage(telefono, `📞 *Perfecto.* Te llamaremos pronto al ${telefono}.\n🕘 Lun–Vie 8am–6pm\n\nGracias. 💚`);
      setSesion(telefono, { paso: 'inicio' }); return;
    }
    if (tl.includes('más información') || tl.includes('📋')) {
      await sendMessage(telefono, `Claro. En Stemwell:\n🧬 Células madre\n💉 PRP\n🔬 Exosomas\n🫁 Cámara hiperbárica\n💊 Longevidad\n\n¿Sobre cuál profundizar?`); return;
    }

    // ═══════════════════════════
    // CONOCIMIENTO MÉDICO
    // ═══════════════════════════
    const respuestaMedica = getRespuestaMedica(texto);
    if (respuestaMedica) { await sendMessage(telefono, respuestaMedica); return; }

    // ═══════════════════════════
    // IA: DEEPSEEK PARA TODO LO DEMÁS
    // ═══════════════════════════
    const respuestaIA = await responderConIA(telefono, contacto?.nombre || nombre, texto);
    if (respuestaIA) {
      await sendMessage(telefono, respuestaIA);
      await logMensaje(telefono, nombre, 'salida', respuestaIA);
      return;
    }

    // ═══════════════════════════
    // FALLBACK
    // ═══════════════════════════
    await enviarSaludo(telefono, contacto?.nombre || nombre);

  } catch (err) {
    console.error('❌ Error:', err);
    await sendMessage(telefono, `Perdón, tuve un tropiezo. ¿Puedes intentar de nuevo? 🙏`);
  }
}

module.exports = { handleIncomingMessage };