const { sendMessage, sendButtons } = require('../services/whatsapp');
const {
  saveContacto, getContactoByTelefono, upsertContactoBasico, updateLeadData,
  logMensaje, guardarMensajeRAG, getHistorialRAG,
} = require('../services/postgres');
const { getSesion, setSesion, resetSesion } = require('../services/sesiones');
const { getRespuestaMedica } = require('../services/inteligencia');
const { buscarRespuestaLocal, guardarPreguntaNoRespondida } = require('../rag/ml-engine');
const { responderConIA } = require('../rag/ia-local');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

function pausaNatural() {
  const ms = Math.floor(Math.random() * 1500) + 800;
  return new Promise(resolve => setTimeout(resolve, ms));
}

function detectarIdioma(texto) {
  const ingles = ['hi', 'hello', 'hey', 'what', 'how', 'where', 'when', 'why', 'who', 'can', 'do', 'does', 'is', 'are', 'will', 'would', 'could', 'should', 'my', 'your', 'please', 'thanks', 'help', 'need', 'want', 'know', 'tell', 'about', 'price', 'cost', 'pain', 'work', 'cell', 'stem', 'video', 'instagram', 'the', 'and', 'for', 'this', 'that', 'have', 'has', 'been', 'was', 'were', 'feel', 'feeling', 'therapy', 'therapies', 'physical', 'since', 'years', 'months', 'weeks', 'days', 'much', 'many', 'some', 'any', 'but', 'because', 'also', 'very', 'really', 'still', 'always', 'never', 'sometimes', 'maybe', 'just', 'now', 'today', 'yesterday', 'tomorrow'];
  const palabras = texto.toLowerCase().split(' ');
  const coincidencias = palabras.filter(p => ingles.includes(p));
  if (coincidencias.length >= 1) return 'en';
  return 'es';
}

function resumirTexto(texto) {
  if (!texto) return 'No especificado';
  const tl = texto.toLowerCase();
  if (tl.includes('10 año') || tl.includes('diez año')) return '10 años';
  if (tl.includes('año') || tl.includes('años')) { const m = texto.match(/(\d+)\s*años?/); return m ? `${m[1]} años` : 'Varios años'; }
  if (tl.includes('mes')) { const m = texto.match(/(\d+)\s*meses?/); return m ? `${m[1]} meses` : 'Meses'; }
  if (tl.includes('semana')) return 'Semanas';
  if (tl.includes('cirugía') || tl.includes('cirugia') || tl.includes('operé') || tl.includes('opere')) return 'Cirugía previa';
  if (tl.includes('fisioterapia') || tl.includes('physical') || tl.includes('rehabilitación')) return 'Fisioterapia';
  if (tl.includes('medicamento') || tl.includes('antiinflamatorio')) return 'Medicamentos';
  if (tl.includes('inyección') || tl.includes('infiltración')) return 'Inyecciones';
  if (tl.includes('remedio') || tl.includes('natural')) return 'Remedios naturales';
  if (tl.includes('caminar')) return 'Dificultad al caminar';
  if (tl.includes('dormir') || tl.includes('noche')) return 'Le despierta en la noche';
  if (tl.includes('trabajo') || tl.includes('trabajar')) return 'Afecta su trabajo';
  if (tl.includes('ejercicio') || tl.includes('deporte')) return 'Le impide hacer ejercicio';
  return texto.length > 50 ? texto.slice(0, 50) + '...' : texto;
}

async function enviarSaludo(telefono, nombre) {
  await pausaNatural();
  const n = nombre.split(' ')[0] || '';
  const nombreInvalido = !n || n === '' || n === 'Paciente' || n.toLowerCase() === 'hola';
  
  if (nombreInvalido) {
    await sendMessage(telefono,
      `🌿 *Stemwell Medicina Regenerativa*\n\n` +
      `¡Hola! Qué alegría que nos hayas escrito. 💚\n\n` +
      `Soy *Sofía*, y estoy aquí para acompañarte, escucharte y orientarte en todo lo que necesites sobre medicina regenerativa.\n\n` +
      `Para empezar con una atención más personalizada... ¿me compartes tu *nombre completo*?`
    );
    return;
  }
  await sendButtons(telefono,
    `🌿 *Stemwell Medicina Regenerativa*\n\n` +
    `¡*${n}*, qué gusto tenerte por aquí! 😊\n\n` +
    `Dime, ¿cómo puedo ayudarte hoy?`,
    ['🦵 Tengo un dolor', '🧠 Neurología', '✨ Longevidad', '📅 Agendar cita', '💬 Hablar con alguien']
  );
}

async function flujoDolor(telefono, texto, sesion, contacto) {
  const nombre = (contacto?.nombre || 'Paciente').split(' ')[0];
  const tl = texto.toLowerCase();
  const en = detectarIdioma(texto) === 'en';

  if (!sesion.dolor_descripcion) {
    await pausaNatural();
    let zona = 'articular';
    if (tl.includes('rodilla') || tl.includes('knee')) zona = en ? 'the knee' : 'la rodilla';
    else if (tl.includes('cadera') || tl.includes('hip')) zona = en ? 'the hip' : 'la cadera';
    else if (tl.includes('hombro') || tl.includes('shoulder')) zona = en ? 'the shoulder' : 'el hombro';
    else if (tl.includes('espalda') || tl.includes('lumbar') || tl.includes('columna') || tl.includes('back')) zona = en ? 'the back/spine' : 'la espalda/columna';
    else if (tl.includes('cervical') || tl.includes('cuello') || tl.includes('neck')) zona = en ? 'the neck' : 'la zona cervical';
    else if (tl.includes('codo') || tl.includes('elbow')) zona = en ? 'the elbow' : 'el codo';
    else if (tl.includes('muñeca') || tl.includes('wrist')) zona = en ? 'the wrist' : 'la muñeca';
    else if (tl.includes('tobillo') || tl.includes('ankle')) zona = en ? 'the ankle' : 'el tobillo';
    else if (tl.includes('mano') || tl.includes('hand')) zona = en ? 'the hands' : 'las manos';
    else if (tl.includes('pie') || tl.includes('foot')) zona = en ? 'the feet' : 'los pies';
    else if (tl.includes('pierna') || tl.includes('leg')) zona = en ? 'the leg' : 'la pierna';
    else if (tl.includes('hernia')) zona = en ? 'a herniated disc' : 'una hernia discal';
    else if (tl.includes('artritis') || tl.includes('artrosis') || tl.includes('arthritis')) zona = en ? 'arthritis' : 'las articulaciones';

    setSesion(telefono, { paso: 'dolor_tiempo', dolor_descripcion: texto, dolor_zona: zona });
    await sendMessage(telefono,
      en
        ? `✨ *${nombre}*, thank you for trusting me with your pain in *${zona}*.\n\nHow long have you been dealing with this?`
        : `✨ *${nombre}*, gracias por abrirte conmigo y contarme sobre tu dolor en *${zona}*.\n\nSé que vivir con dolor no es fácil, y quiero que sepas que estoy aquí para ayudarte.\n\n¿Hace cuánto tiempo comenzó esta molestia?`
    );
    return;
  }
  if (!sesion.dolor_tiempo) {
    setSesion(telefono, { paso: 'dolor_tratamientos', dolor_tiempo: texto });
    await sendMessage(telefono, en ? `Thank you. Have you tried any treatments so far?` : `Gracias por compartirlo. 🙏\n\n¿Has intentado algún tratamiento hasta ahora? Medicamentos, fisioterapia, cirugía...`);
    return;
  }
  if (!sesion.dolor_tratamientos) {
    setSesion(telefono, { paso: 'dolor_impacto', dolor_tratamientos: texto });
    await sendMessage(telefono, en ? `I understand. How does this pain affect your daily life?` : `Vaya, ${nombre}. Has pasado por varias cosas ya... 😔\n\n¿Cómo impacta este dolor en tu día a día?`);
    return;
  }
  if (!sesion.dolor_impacto) {
    const nombreEsGenerico = !contacto?.nombre || contacto.nombre === '' || contacto.nombre === 'Paciente';
    const tieneEmail = contacto?.email && contacto.email !== '';
    if (nombreEsGenerico) {
      setSesion(telefono, { paso: 'dolor_pedir_nombre', dolor_impacto: texto, menciono_dolor: true });
      await sendMessage(telefono, en ? `✨ I need your *full name*:` : `✨ Gracias por compartir tu historia.\n\nAntes de continuar, necesito tu *nombre completo*:`);
      return;
    }
    if (!tieneEmail) {
      setSesion(telefono, { paso: 'dolor_pedir_email', dolor_impacto: texto, menciono_dolor: true });
      await sendMessage(telefono, en ? `Thank you. Now your *email*:` : `Gracias, ${contacto.nombre.split(' ')[0]}. 🙏\n\nAhora necesito tu *correo electrónico*:`);
      return;
    }
    await enviarOfertaFinal(telefono, nombre, sesion, contacto, en);
    return;
  }
  if (sesion.paso === 'dolor_pedir_nombre') {
    await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
    setSesion(telefono, { paso: 'dolor_pedir_email', dolor_impacto: sesion.dolor_impacto, menciono_dolor: true });
    await sendMessage(telefono, en ? `Thank you. Now your *email*:` : `Gracias, *${texto.split(' ')[0]}*. 🙏\n\nAhora tu *correo electrónico*:`);
    return;
  }
  if (sesion.paso === 'dolor_pedir_email') {
    if (!texto.includes('@') || !texto.includes('.')) {
      await sendMessage(telefono, en ? `That email doesn't seem valid.` : `Ese correo no parece válido. Revisa.`);
      return;
    }
    await saveContacto({ nombre: contacto?.nombre || '', apellido: '', email: texto, telefono });
    const c = await getContactoByTelefono(telefono);
    await enviarOfertaFinal(telefono, nombre, sesion, c, en);
    return;
  }
}

async function enviarOfertaFinal(telefono, nombre, sesion, contacto, en = false) {
  setSesion(telefono, { paso: 'inicio', menciono_dolor: true });
  await updateLeadData(telefono, { interes: 'dolor', dolor_principal: sesion.dolor_zona, nivel_interes: 'hot' });
  await sendButtons(telefono,
    en
      ? `✨ *${nombre}*, here's what I understood:\n• Pain in *${sesion.dolor_zona}*\n• Duration: *${resumirTexto(sesion.dolor_tiempo)}*\n• Treatments: *${resumirTexto(sesion.dolor_tratamientos)}*\n\nAt Stemwell, the first step is a *FREE evaluation* with Dr. Camilo White.\n\nShall we schedule?`
      : `✨ *${nombre}*, esto es lo que entendí:\n• Dolor en *${sesion.dolor_zona}*\n• Tiempo: *${resumirTexto(sesion.dolor_tiempo)}*\n• Tratamientos: *${resumirTexto(sesion.dolor_tratamientos)}*\n\nEn Stemwell, el primer paso es una *evaluación SIN COSTO* con el Dr. Camilo White.\n\n¿Agendamos?`,
    ['✅ Sí, agendar', '📞 Que me llamen', '📋 Más info']
  );
}

async function flujoAgendar(telefono, texto, sesion, contacto) {
  const nombre = (contacto?.nombre || 'Paciente').split(' ')[0];
  if (!contacto?.nombre || contacto.nombre === '' || contacto.nombre === 'Paciente') {
    setSesion(telefono, { paso: 'agenda_nombre' });
    await sendMessage(telefono, `🌟 ¡Qué bueno! Para agendar tu *evaluación gratuita*, necesito tu *nombre completo*:`);
    return;
  }
  if (!contacto?.email || contacto.email === '') {
    setSesion(telefono, { paso: 'agenda_email' });
    await sendMessage(telefono, `Gracias, ${nombre}. 🙏\n\nAhora tu *correo electrónico*:`);
    return;
  }
  if (!sesion.datos_confirmados) {
    setSesion(telefono, { paso: 'agenda_confirmar', datos_confirmados: false });
    await sendButtons(telefono, `📋 *Confirmemos:*\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\n¿Son correctos?`, ['✅ Sí', '✏️ Cambiar']);
    return;
  }
  setSesion(telefono, { paso: 'inicio', quiere_agendar: true, datos_confirmados: true });
  await updateLeadData(telefono, { quiere_agendar: true, nivel_interes: 'hot' });
  await sendButtons(telefono, `✅ *¡Listo, ${nombre}!*\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\nAgenda:`, ['📅 Agendar ahora', '📞 Que me llamen']);
}

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
    const nombreEsGenerico = !contacto?.nombre || contacto.nombre === '' || contacto.nombre === 'Paciente' || contacto.nombre === contact?.profile?.name;
    const esComandoGlobal = ['menu', 'menú', 'inicio', 'hola', 'hi', 'hello', 'buenas', '0', 'cancelar', 'salir'].includes(tl);
    const esEmail = tl.includes('@');

    // SIEMPRE PEDIR NOMBRE PRIMERO
    if (nombreEsGenerico && !esComandoGlobal && !esEmail && tl.length > 1 && tl.length < 80) {
      const palabrasProhibidas = ['hola', 'buenas', 'info', 'ayuda', 'menu', 'menú', 'información', 'informacion', 'dolor', 'cita', 'agendar', 'precio', 'costo', 'celulas', 'células', 'madre', 'prp', 'what', 'help', 'hi', 'hello'];
      if (!palabrasProhibidas.includes(tl)) {
        await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
        const nombreGuardado = texto.split(' ')[0];
        await sendButtons(telefono,
          `🌿 *Stemwell Medicina Regenerativa*\n\n¡*${nombreGuardado}*, mucho gusto! 😊\n\nCuéntame, ¿cómo puedo ayudarte hoy?`,
          ['🦵 Tengo un dolor', '🧠 Neurología', '✨ Longevidad', '📅 Agendar cita', '💬 Hablar con alguien']
        );
        return;
      }
    }

    if (esComandoGlobal) {
      resetSesion(telefono);
      await enviarSaludo(telefono, contacto?.nombre || nombre);
      return;
    }

    // RESPUESTAS RÁPIDAS EN FLUJOS (sin return, dejan continuar)
    const enFlujo = sesion.paso && (sesion.paso.startsWith('dolor_') || sesion.paso === 'dolor_pedir_nombre' || sesion.paso === 'dolor_pedir_email' || sesion.paso === 'agenda_nombre' || sesion.paso === 'agenda_email' || sesion.paso === 'agenda_confirmar');
    if (enFlujo) {
      const np = contacto?.nombre?.split(' ')[0] || 'amig@';
      if (tl.includes('funcion') || tl.includes('sirve') || tl.includes('efectivo') || tl.includes('mejorar')) {
        await sendMessage(telefono, `✨ *${np}*, la medicina regenerativa tiene +30,000 estudios. Muchos pacientes con casos como el tuyo han mejorado. Sigamos con lo que me contabas...`);
      } else if (tl.includes('cuánto') || tl.includes('cuesta') || tl.includes('precio')) {
        await sendMessage(telefono, `💰 *${np}*, los protocolos son personalizados. La evaluación inicial es SIN COSTO. Volviendo a tu caso...`);
      } else if (tl.includes('segur') || tl.includes('riesgo')) {
        await sendMessage(telefono, `✅ Sí, son seguros y ambulatorios. Continuando con lo que hablábamos...`);
      } else if (tl.includes('célula') || tl.includes('celula') || tl.includes('madre')) {
        await sendMessage(telefono, `🧬 Las CMM regeneran tejidos. En Stemwell usamos de cordón umbilical: seguras. Volviendo a tu caso...`);
      }
    }

    // FLUJOS ACTIVOS
    const esFlujoDolor = sesion.paso && (sesion.paso.startsWith('dolor_') || sesion.paso === 'dolor_pedir_nombre' || sesion.paso === 'dolor_pedir_email');
    if (esFlujoDolor) { await flujoDolor(telefono, texto, sesion, contacto); return; }
    if (sesion.paso === 'agenda_nombre') {
      await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
      setSesion(telefono, { paso: 'agenda_email' });
      await sendMessage(telefono, `Gracias, *${texto.split(' ')[0]}*. 🙏\n\nTu *correo electrónico*:`);
      return;
    }
    if (sesion.paso === 'agenda_email') {
      if (!texto.includes('@') || !texto.includes('.')) { await sendMessage(telefono, `No parece válido. Revisa.`); return; }
      await saveContacto({ nombre: contacto?.nombre || '', apellido: '', email: texto, telefono });
      setSesion(telefono, { paso: 'agenda_confirmar', datos_confirmados: false });
      await sendButtons(telefono, `📋 *Confirmemos:*\n👤 ${contacto?.nombre || texto}\n📧 ${texto}\n📱 ${telefono}\n\n¿Correctos?`, ['✅ Sí', '✏️ Cambiar']);
      return;
    }
    if (sesion.paso === 'agenda_confirmar') {
      if (tl.includes('sí') || tl.includes('correcto') || tl.includes('✅')) {
        setSesion(telefono, { paso: 'inicio', quiere_agendar: true, datos_confirmados: true });
        await updateLeadData(telefono, { quiere_agendar: true, nivel_interes: 'hot' });
        await sendButtons(telefono, `✅ *¡Listo!*\n👤 ${contacto?.nombre}\n📧 ${contacto?.email}\n📱 ${telefono}\n\nAgenda:`, ['📅 Agendar ahora', '📞 Que me llamen']);
        return;
      }
      if (tl.includes('cambiar') || tl.includes('✏️') || tl.includes('no')) {
        setSesion(telefono, { paso: 'agenda_nombre', datos_confirmados: false });
        await sendMessage(telefono, `De acuerdo. ¿Cuál es tu *nombre completo*?`);
        return;
      }
    }

    // BOTONES PRINCIPALES
    if (tl.includes('agendar mi evaluación') || tl.includes('agendar evaluación')) { await flujoAgendar(telefono, texto, sesion, contacto); return; }
    if (tl.includes('dolor') || tl.includes('lesión') || tl.includes('🦵') || tl.includes('pain') || tl.includes('therapy')) { await flujoDolor(telefono, texto, sesion, contacto); return; }
    if (tl.includes('agendar') || tl.includes('cita') || tl.includes('📅')) { await flujoAgendar(telefono, texto, sesion, contacto); return; }
    if (tl.includes('asesor') || tl.includes('hablar') || tl.includes('💬')) {
      await sendButtons(telefono, `👨‍⚕️ *Con mucho gusto.*\n📞 (+57) 311 501 1920\n🕘 Lun–Vie 8am–6pm`, ['📞 Que me llamen', '✅ Ya llamo']);
      return;
    }

    // ═══════════════════════════
    // IA LOCAL (LM STUDIO)
    // ═══════════════════════════
    const respuestaIA = await responderConIA(texto, contacto?.nombre || nombre);
    if (respuestaIA) {
      await sendMessage(telefono, respuestaIA);
      await logMensaje(telefono, nombre, 'salida', respuestaIA);
      await pausaNatural();
      await sendButtons(telefono,
        'Si deseas, puedes seguir escribiendo tus preguntas aquí abajo. Cuando estés listo, también puedes agendar tu evaluación SIN COSTO tocando el botón. 😊',
        ['📅 Agendar mi evaluación gratuita']
      );
      return;
    }

    // FALLBACK
    guardarPreguntaNoRespondida(texto, telefono);
    if (detectarIdioma(texto) === 'en') {
      await sendMessage(telefono, `👋 Hi! I'm Sofía. How can I help you today?`);
    } else {
      await enviarSaludo(telefono, contacto?.nombre || nombre);
    }

  } catch (err) {
    console.error('❌ Error:', err);
    await sendMessage(telefono, `Perdón, tuve un tropiezo. ¿Intentas de nuevo? 🙏`);
  }
}

module.exports = { handleIncomingMessage };