const { sendMessage, sendButtons } = require('../services/whatsapp');
const {
  saveContacto, getContactoByTelefono, upsertContactoBasico, updateLeadData,
  logMensaje, guardarMensajeRAG, getHistorialRAG,
} = require('../services/postgres');
const { getSesion, setSesion, resetSesion } = require('../services/sesiones');
const { getInfoMedica } = require('../services/inteligencia');
const { buscarRespuestaLocal, guardarPreguntaNoRespondida } = require('../rag/ml-engine');
const { responderConIA } = require('../rag/ia-local');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

function pausaNatural() {
  const ms = Math.floor(Math.random() * 1500) + 800;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 🌍 DETECTOR DE IDIOMA MEJORADO (CORREGIDO)
// ============================================================
function detectarIdioma(texto) {
  const mensaje = texto.toLowerCase().trim();
  
  // 🔥 CASOS ESPECIALES: saludos muy cortos en inglés
  const saludosInglesCortos = ['hi', 'hello', 'hey', 'sup', 'yo', 'hi!', 'hello!', 'hey!'];
  if (saludosInglesCortos.includes(mensaje)) {
    return 'en';
  }
  
  // Saludos en español cortos
  const saludosEspanolCortos = ['hola', 'buenas', 'hola!', 'buenas!'];
  if (saludosEspanolCortos.includes(mensaje)) {
    return 'es';
  }
  
  // Palabras clave en inglés (ampliado)
  const ingles = [
    'hello', 'hi', 'hey', 'what', 'how', 'where', 'when', 'why', 'who', 
    'can', 'do', 'does', 'is', 'are', 'will', 'would', 'could', 'should', 
    'my', 'your', 'please', 'thanks', 'thank', 'help', 'need', 'want', 
    'know', 'tell', 'about', 'price', 'cost', 'pain', 'work', 'cell', 
    'stem', 'video', 'instagram', 'the', 'and', 'for', 'this', 'that', 
    'have', 'has', 'been', 'was', 'were', 'feel', 'feeling', 'therapy', 
    'therapies', 'physical', 'since', 'years', 'months', 'weeks', 'days', 
    'much', 'many', 'some', 'any', 'but', 'because', 'also', 'very', 
    'really', 'still', 'always', 'never', 'sometimes', 'maybe', 'just', 
    'now', 'today', 'yesterday', 'tomorrow', 'does it work', 'is it effective',
    'how does', 'tell me', 'explain', 'results', 'effective', 'works'
  ];
  
  // Palabras clave en español
  const espanol = [
    'hola', 'buenas', 'cómo', 'cómo estás', 'gracias', 'ayuda', 'necesito', 
    'quiero', 'saber', 'dime', 'precio', 'costo', 'dolor', 'funciona', 
    'sirve', 'tratamiento', 'célula', 'madre', 'terapia', 'años', 'meses',
    'semanas', 'días', 'porque', 'pero', 'muy', 'realmente', 'siempre',
    'nunca', 'ahora', 'hoy', 'mañana', 'ayer'
  ];
  
  // Contar coincidencias
  let scoreIngles = 0;
  let scoreEspanol = 0;
  
  for (const palabra of ingles) {
    if (mensaje.includes(palabra)) scoreIngles++;
  }
  
  for (const palabra of espanol) {
    if (mensaje.includes(palabra)) scoreEspanol++;
  }
  
  // Si hay más inglés o el mensaje comienza con saludo inglés
  const comienzaConIngles = /^(hello|hi|hey|good morning|good afternoon)/i.test(mensaje);
  
  if (comienzaConIngles || scoreIngles > scoreEspanol) {
    return 'en';
  }
  
  return 'es';
}

// ============================================================
// 🧠 RESPUESTAS EN INGLÉS
// ============================================================
function getRespuestaIngles(tipo, variables = {}) {
  const respuestas = {
    saludo: `🌿 *Stemwell Regenerative Medicine*

Hello! 👋 I'm Sofía, your virtual assistant.

How can I help you today? You can ask me about:
• Stem cell treatments
• PRP (Platelet-Rich Plasma)
• Exosomes
• Hyperbaric chamber
• Longevity protocols
• Costs and free evaluation

Or just tell me what you're looking for! 😊`,

    funciona: `🔍 *Does it work? Great question!*

The effectiveness of regenerative treatments *varies for each specific case*: your condition, how long you've had it, age, overall health, etc.

📊 *What we CAN tell you with certainty:*
• Over 30,000 scientific studies support mesenchymal stem cells
• Many patients report significant improvement
• NOT all patients respond the same way

✅ *The ONLY way to know if YOU are a candidate is with a real evaluation:*

🗓️ *Schedule a consultation with Dr. Camilo White or Sandra*
👉 *FREE initial evaluation*
👉 They will review YOUR specific case

🔗 *Book here (takes 1 minute):* ${AGENDA_URL}`,

    comoAplican: `💉 *How are these procedures applied?*

*🩸 Mesenchymal Stem Cells (from umbilical cord):*
• Extracted from donated umbilical cord tissue
• Prepared in our laboratory
• Administered intravenously (IV) or locally via ultrasound
• Helps regenerate tissues and reduce inflammation

*💉 Platelet-Rich Plasma (PRP):*
• Small blood sample taken from YOU
• Processed in centrifuge to concentrate platelets
• Re-injected into the affected area
• Stimulates natural growth factors for tissue repair

*💊 IV Therapy:*
• Custom vitamin and antioxidant blend
• Administered intravenously
• Restores energy and supports regeneration

✨ *Want to know which procedure is right for YOU?*
🔗 *Schedule a FREE evaluation:* ${AGENDA_URL}`,

    precios: `💰 *About treatment costs*

Prices vary according to:
• Type of procedure
• Number of sessions needed
• Your personalized plan

*The most transparent I can be:*
Sandra or Dr. Camilo White will give you a DETAILED budget after the initial evaluation (which is FREE).

🔗 *Schedule your FREE evaluation here:* ${AGENDA_URL}`,

    derivacion: `👩‍⚕️ *That's an excellent question for our specialists.*

As a virtual assistant, I can give you general information, but *Sandra or Dr. Camilo White* can:
• Review your specific medical history
• Evaluate if you are a REAL candidate
• Explain risks and benefits FOR YOUR CASE

📌 *The initial evaluation is FREE*
🔗 *Book here:* ${AGENDA_URL}`,

    porDefecto: `📋 *Thank you for your interest in Stemwell.*

For *precise answers about YOUR CASE*, it's best to talk directly with:

👨‍⚕️ *Dr. Camilo White* - Medical Director
👩‍⚕️ *Sandra* - Clinical Advisor

🔗 *Schedule a FREE evaluation:* ${AGENDA_URL}

Do you have any other questions? I'm here to help. 💙`
  };
  
  return respuestas[tipo] || respuestas.porDefecto;
}

// ============================================================
// 🧠 RESPUESTAS EN ESPAÑOL
// ============================================================
function getRespuestaEspanol(tipo, variables = {}) {
  const respuestas = {
    saludo: `🌿 *Stemwell Medicina Regenerativa*

¡Hola! 👋 Soy Sofía, tu asistente virtual.

¿Cómo puedo ayudarte hoy? Puedes preguntarme sobre:
• Tratamientos con células madre
• PRP (Plasma Rico en Plaquetas)
• Exosomas
• Cámara hiperbárica
• Protocolos de longevidad
• Costos y evaluación gratuita

¡O simplemente cuéntame qué estás buscando! 😊`,

    funciona: `🔍 *Excelente pregunta, es muy importante.*

La efectividad de los tratamientos regenerativos *varía según cada caso específico*.

📊 *Lo que sí podemos decirte:*
• Más de 30,000 estudios científicos respaldan las células madre
• Muchos pacientes reportan mejoría significativa
• NO todos los pacientes responden igual

✅ *La única forma de saber si ERES CANDIDATO es con una evaluación real:*

🗓️ *Agenda una cita de valoración SIN COSTO con el Dr. Camilo White o Sandra*
🔗 *Reserva aquí:* ${AGENDA_URL}`,

    comoAplican: `💉 *¿Cómo se aplican estos procedimientos?*

*🩸 Células Madre Mesenquimales:*
• Se extraen del cordón umbilical donado
• Se preparan en laboratorio
• Se administran por vía intravenosa o local
• Regeneran tejidos y reducen inflamación

*💉 Plasma Rico en Plaquetas (PRP):*
• Se toma una muestra de TU sangre
• Se procesa en centrífuga
• Se reinyecta en el área afectada

*💊 Sueroterapia:*
• Mezcla personalizada de vitaminas
• Se administra por vía intravenosa

✨ *¿Quieres saber qué procedimiento es ideal para TI?*
🔗 *Agenda evaluación SIN COSTO:* ${AGENDA_URL}`,

    precios: `💰 *Sobre los costos*

Los precios varían según:
• Tipo de procedimiento
• Número de sesiones
• Tu plan personalizado

*Lo más transparente:*
Sandra o el Dr. Camilo White te darán un presupuesto DETALLADO tras la evaluación inicial (SIN COSTO).

🔗 *Agenda tu evaluación gratuita aquí:* ${AGENDA_URL}`,

    derivacion: `👩‍⚕️ *Excelente pregunta para nuestros especialistas.*

*Sandra o el Dr. Camilo White* pueden:
• Revisar tu caso específico
• Evaluar si eres candidato real
• Explicarte riesgos y beneficios

📌 *Evaluación inicial SIN COSTO*
🔗 *Agenda aquí:* ${AGENDA_URL}`,

    porDefecto: `📋 *Gracias por tu interés en Stemwell.*

Para respuestas *precisas sobre TU CASO*, lo mejor es que hables con:

👨‍⚕️ *Dr. Camilo White* - Director médico
👩‍⚕️ *Sandra* - Asesora clínica

🔗 *Agenda una cita de valoración SIN COSTO:* ${AGENDA_URL}

¿Tienes otra pregunta? Estoy para ayudarte. 💙`
  };
  
  return respuestas[tipo] || respuestas.porDefecto;
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
  const n = nombre?.split(' ')[0] || '';
  const nombreInvalido = !n || n === '' || n === 'Paciente' || n.toLowerCase() === 'hola' || n.toLowerCase() === 'hi' || n.toLowerCase() === 'hello';
  
  if (nombreInvalido) {
    await sendMessage(telefono,
      `🌿 *Stemwell Medicina Regenerativa*\n\n` +
      `¡Hola! Qué alegría que nos hayas escrito. 💚\n\n` +
      `Soy *Sofía*, y estoy aquí para acompañarte y orientarte en todo lo que necesites sobre medicina regenerativa.\n\n` +
      `Para darte una atención más personalizada, ¿me compartes tu *nombre completo*?`
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

async function enviarSaludoIngles(telefono, nombre) {
  await pausaNatural();
  await sendButtons(telefono,
    `🌿 *Stemwell Regenerative Medicine*\n\n` +
    `Hello! 👋 I'm Sofía, your virtual assistant.\n\n` +
    `How can I help you today?`,
    ['🦵 I have pain', '🧠 Neurology', '✨ Longevity', '📅 Book appointment', '💬 Speak with someone']
  );
}

async function flujoDolor(telefono, texto, sesion, contacto) {
  const nombre = (contacto?.nombre || 'Patient').split(' ')[0];
  const tl = texto.toLowerCase();
  const en = detectarIdioma(texto) === 'en';

  if (!sesion.dolor_descripcion) {
    await pausaNatural();
    let zona = en ? 'joint' : 'articular';
    if (tl.includes('rodilla') || tl.includes('knee')) zona = en ? 'the knee' : 'la rodilla';
    else if (tl.includes('cadera') || tl.includes('hip')) zona = en ? 'the hip' : 'la cadera';
    else if (tl.includes('hombro') || tl.includes('shoulder')) zona = en ? 'the shoulder' : 'el hombro';
    else if (tl.includes('espalda') || tl.includes('lumbar') || tl.includes('columna') || tl.includes('back')) zona = en ? 'the back/spine' : 'la espalda/columna';
    else if (tl.includes('cervical') || tl.includes('cuello') || tl.includes('neck')) zona = en ? 'the neck' : 'la zona cervical';
    else if (tl.includes('codo') || tl.includes('elbow')) zona = en ? 'the elbow' : 'el codo';
    else if (tl.includes('muñeca') || tl.includes('wrist')) zona = en ? 'the wrist' : 'la muñeca';
    else if (tl.includes('tobillo') || tl.includes('ankle')) zona = en ? 'the ankle' : 'el tobillo';
    else if (tl.includes('artritis') || tl.includes('artrosis') || tl.includes('arthritis')) zona = en ? 'arthritis' : 'las articulaciones';

    setSesion(telefono, { paso: 'dolor_tiempo', dolor_descripcion: texto, dolor_zona: zona });
    await sendMessage(telefono,
      en
        ? `✨ *${nombre}*, thank you for sharing about your pain in *${zona}*.\n\nHow long have you been dealing with this?`
        : `✨ *${nombre}*, gracias por contarme sobre tu dolor en *${zona}*.\n\n¿Hace cuánto tiempo comenzó esta molestia?`
    );
    return;
  }
  
  if (!sesion.dolor_tiempo) {
    setSesion(telefono, { paso: 'dolor_tratamientos', dolor_tiempo: texto });
    await sendMessage(telefono, 
      en ? `Thank you. Have you tried any treatments so far?` : 
      `Gracias. 🙏\n\n¿Has intentado algún tratamiento hasta ahora?`
    );
    return;
  }
  
  if (!sesion.dolor_tratamientos) {
    setSesion(telefono, { paso: 'dolor_impacto', dolor_tratamientos: texto });
    await sendMessage(telefono, 
      en ? `I understand. How does this pain affect your daily life?` : 
      `Vaya, ${nombre}. ¿Cómo impacta este dolor en tu día a día?`
    );
    return;
  }
  
  if (!sesion.dolor_impacto) {
    const nombreEsGenerico = !contacto?.nombre || contacto.nombre === '' || contacto.nombre === 'Patient';
    const tieneEmail = contacto?.email && contacto.email !== '';
    
    if (nombreEsGenerico) {
      setSesion(telefono, { paso: 'dolor_pedir_nombre', dolor_impacto: texto, menciono_dolor: true });
      await sendMessage(telefono, 
        en ? `✨ I need your *full name*:` : 
        `✨ Antes de continuar, necesito tu *nombre completo*:`
      );
      return;
    }
    
    if (!tieneEmail) {
      setSesion(telefono, { paso: 'dolor_pedir_email', dolor_impacto: texto, menciono_dolor: true });
      await sendMessage(telefono, 
        en ? `Thank you. Now your *email*:` : 
        `Gracias, ${contacto.nombre.split(' ')[0]}. 🙏\n\nAhora tu *correo electrónico*:`
      );
      return;
    }
    
    await enviarOfertaFinal(telefono, nombre, sesion, contacto, en);
    return;
  }
  
  if (sesion.paso === 'dolor_pedir_nombre') {
    await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
    setSesion(telefono, { paso: 'dolor_pedir_email', dolor_impacto: sesion.dolor_impacto, menciono_dolor: true });
    await sendMessage(telefono, 
      en ? `Thank you. Now your *email*:` : 
      `Gracias, *${texto.split(' ')[0]}*. 🙏\n\nAhora tu *correo electrónico*:`
    );
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
    en ? ['✅ Yes, schedule', '📞 Call me', '📋 More info'] : ['✅ Sí, agendar', '📞 Que me llamen', '📋 Más info']
  );
}

async function flujoAgendar(telefono, texto, sesion, contacto) {
  const nombre = (contacto?.nombre || 'Patient').split(' ')[0];
  const en = detectarIdioma(texto) === 'en';
  
  if (!contacto?.nombre || contacto.nombre === '' || contacto.nombre === 'Patient') {
    setSesion(telefono, { paso: 'agenda_nombre' });
    await sendMessage(telefono, 
      en ? `🌟 Great! To schedule your *FREE evaluation*, I need your *full name*:` : 
      `🌟 ¡Qué bueno! Para agendar tu *evaluación gratuita*, necesito tu *nombre completo*:`
    );
    return;
  }
  
  if (!contacto?.email || contacto.email === '') {
    setSesion(telefono, { paso: 'agenda_email' });
    await sendMessage(telefono, 
      en ? `Thank you, ${nombre}. 🙏\n\nNow your *email*:` : 
      `Gracias, ${nombre}. 🙏\n\nAhora tu *correo electrónico*:`
    );
    return;
  }
  
  if (!sesion.datos_confirmados) {
    setSesion(telefono, { paso: 'agenda_confirmar', datos_confirmados: false });
    await sendButtons(telefono, 
      en ? `📋 *Confirm your details:*\n\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\nAre they correct?` : 
      `📋 *Confirmemos tus datos:*\n\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\n¿Son correctos?`, 
      en ? ['✅ Yes, correct', '✏️ Change them'] : ['✅ Sí, son correctos', '✏️ Quiero cambiarlos']
    );
    return;
  }
  
  setSesion(telefono, { paso: 'inicio', quiere_agendar: true, datos_confirmados: true });
  await updateLeadData(telefono, { quiere_agendar: true, nivel_interes: 'hot' });
  await sendButtons(telefono,
    en ? `✅ *All set, ${nombre}!*\n\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\nTap the button to choose your date and time 👇` :
    `✅ *¡Todo listo, ${nombre}!*\n\n👤 ${contacto.nombre}\n📧 ${contacto.email}\n📱 ${telefono}\n\nToca el botón para elegir tu fecha y hora 👇`,
    en ? ['📅 Open calendar'] : ['📅 Abrir agenda']
  );
}

// ============================================================
// 📩 MANEJADOR PRINCIPAL DE MENSAJES (CORREGIDO)
// ============================================================
async function handleIncomingMessage(message, contact) {
  const telefono = contact.wa_id;
  const nombre = contact.profile?.name || '';
  const tipo = message.type;
  let texto = '';
  
  if (tipo === 'text') texto = message.text?.body || '';
  else if (tipo === 'interactive') texto = message.interactive?.button_reply?.title || '';
  
  if (!texto) return;
  
  const tl = texto.toLowerCase().trim();
  const idioma = detectarIdioma(texto);
  console.log(`📩 [${telefono}] ${nombre}: "${texto}" (${idioma})`);

  await upsertContactoBasico(telefono, nombre).catch(() => {});
  await logMensaje(telefono, nombre, 'entrada', texto);

  let sesion = getSesion(telefono);
  const contacto = await getContactoByTelefono(telefono);
  setSesion(telefono, { mensajes: (sesion.mensajes || 0) + 1 });

  try {
    const nombreEsGenerico = !contacto?.nombre || contacto.nombre === '' || contacto.nombre === 'Paciente' || contacto.nombre === 'Patient';
    
    // 🔥 COMANDOS GLOBALES (incluye "hi", "hello" en inglés)
    const comandosGlobales = ['menu', 'menú', 'inicio', 'hola', 'hi', 'hello', 'hey', 'buenas', '0', 'cancelar', 'salir'];
    const esComandoGlobal = comandosGlobales.includes(tl);
    
    if (esComandoGlobal) {
      resetSesion(telefono);
      if (idioma === 'en') {
        await enviarSaludoIngles(telefono, contacto?.nombre || nombre);
      } else {
        await enviarSaludo(telefono, contacto?.nombre || nombre);
      }
      return;
    }
    
    // 🔥 PREGUNTA "CÓMO SE APLICAN" / "HOW ARE THEY APPLIED"
    const comoAplicanEspanol = ['cómo se aplican', 'como se aplican', 'cómo aplican', 'como aplican', 'cómo se administran'];
    const comoAplicanIngles = ['how are they applied', 'how do you apply', 'how is it applied', 'application method'];
    
    if (comoAplicanEspanol.some(p => tl.includes(p))) {
      await sendMessage(telefono, getRespuestaEspanol('comoAplican'));
      return;
    }
    
    if (comoAplicanIngles.some(p => tl.includes(p))) {
      await sendMessage(telefono, getRespuestaIngles('comoAplican'));
      return;
    }
    
    // 🔥 PREGUNTA "FUNCIONA" / "DOES IT WORK"
    const funcionaEspanol = ['funciona', 'sirve', 'efectivo', 'resultados', 'me funciona', 'me sirve'];
    const funcionaIngles = ['does it work', 'is it effective', 'does it help', 'effective?', 'work?'];
    
    if (funcionaEspanol.some(p => tl.includes(p))) {
      await sendMessage(telefono, getRespuestaEspanol('funciona'));
      return;
    }
    
    if (funcionaIngles.some(p => tl.includes(p))) {
      await sendMessage(telefono, getRespuestaIngles('funciona'));
      return;
    }
    
    // 🔥 PREGUNTA PRECIOS / COST
    const preciosEspanol = ['costo', 'precio', 'cuánto', 'valor', 'cuanto', 'cuesta'];
    const preciosIngles = ['cost', 'price', 'how much', 'pricing'];
    
    if (preciosEspanol.some(p => tl.includes(p))) {
      await sendMessage(telefono, getRespuestaEspanol('precios'));
      return;
    }
    
    if (preciosIngles.some(p => tl.includes(p))) {
      await sendMessage(telefono, getRespuestaIngles('precios'));
      return;
    }
    
    // ============================================================
    // FLUJOS ACTIVOS
    // ============================================================
    
    const esFlujoDolor = sesion.paso && (sesion.paso.startsWith('dolor_') || sesion.paso === 'dolor_pedir_nombre' || sesion.paso === 'dolor_pedir_email');
    if (esFlujoDolor) { 
      await flujoDolor(telefono, texto, sesion, contacto); 
      return; 
    }
    
    // FLUJO AGENDA
    if (sesion.paso === 'agenda_nombre') {
      await saveContacto({ nombre: texto, apellido: '', email: contacto?.email || '', telefono });
      setSesion(telefono, { paso: 'agenda_email' });
      await sendMessage(telefono, idioma === 'en' ? `Thank you. Now your *email*:` : `Gracias. 🙏\n\nTu *correo electrónico*:`);
      return;
    }
    
    if (sesion.paso === 'agenda_email') {
      if (!texto.includes('@') || !texto.includes('.')) { 
        await sendMessage(telefono, idioma === 'en' ? `That doesn't seem valid.` : `No parece válido. Revisa.`); 
        return; 
      }
      await saveContacto({ nombre: contacto?.nombre || '', apellido: '', email: texto, telefono });
      setSesion(telefono, { paso: 'agenda_confirmar', datos_confirmados: false });
      await sendButtons(telefono, 
        idioma === 'en' ? `📋 *Confirm your details:*\n\n👤 ${contacto?.nombre || texto}\n📧 ${texto}\n📱 ${telefono}\n\nAre they correct?` :
        `📋 *Confirmemos tus datos:*\n\n👤 ${contacto?.nombre || texto}\n📧 ${texto}\n📱 ${telefono}\n\n¿Son correctos?`, 
        idioma === 'en' ? ['✅ Yes, correct', '✏️ Change them'] : ['✅ Sí, son correctos', '✏️ Quiero cambiarlos']
      );
      return;
    }
    
    if (sesion.paso === 'agenda_confirmar') {
      if (tl.includes('sí') || tl.includes('correcto') || tl.includes('✅') || tl.includes('yes')) {
        await saveContacto({
          nombre: contacto?.nombre || '',
          apellido: '',
          email: contacto?.email || '',
          telefono
        });
        setSesion(telefono, { paso: 'inicio', quiere_agendar: true, datos_confirmados: true });
        await updateLeadData(telefono, { quiere_agendar: true, nivel_interes: 'hot' });
        await sendButtons(telefono, 
          idioma === 'en' ? `✅ *All set, ${contacto?.nombre?.split(' ')[0]}!*\n\n👤 ${contacto?.nombre}\n📧 ${contacto?.email}\n📱 ${telefono}\n\nTap the button to choose your date and time 👇` :
          `✅ *¡Todo listo, ${contacto?.nombre?.split(' ')[0]}!*\n\n👤 ${contacto?.nombre}\n📧 ${contacto?.email}\n📱 ${telefono}\n\nToca el botón para elegir tu fecha y hora 👇`, 
          idioma === 'en' ? ['📅 Open calendar'] : ['📅 Abrir agenda']
        );
        return;
      }
      if (tl.includes('cambiar') || tl.includes('✏️') || tl.includes('no')) {
        setSesion(telefono, { paso: 'agenda_nombre', datos_confirmados: false });
        await sendMessage(telefono, idioma === 'en' ? `Okay. What is your *full name*?` : `De acuerdo. ¿Cuál es tu *nombre completo*?`);
        return;
      }
    }
    
    // ============================================================
    // BOTONES PRINCIPALES
    // ============================================================
    
    if (tl.includes('abrir agenda') || tl.includes('open calendar') || tl.includes('📅')) {
      await sendMessage(telefono, 
        idioma === 'en' 
          ? `🗓️ *Book your FREE evaluation here:*\n\n👉 ${AGENDA_URL}\n\nIt takes only 2 minutes. Choose the day and time that works for you.\n\nSee you soon! 💚`
          : `🗓️ *Reserva tu evaluación SIN COSTO aquí:*\n\n👉 ${AGENDA_URL}\n\nSolo toma 2 minutos. Elige el día y hora que prefieras.\n\n¡Te esperamos! 💚`
      );
      setSesion(telefono, { paso: 'inicio' });
      return;
    }
    
    if (tl.includes('dolor') || tl.includes('lesión') || tl.includes('🦵') || tl.includes('pain') || tl.includes('i have pain')) { 
      await flujoDolor(telefono, texto, sesion, contacto); 
      return; 
    }
    
    if (tl.includes('agendar mi evaluación') || tl.includes('agendar evaluación') || tl.includes('agendar') || tl.includes('cita') || tl.includes('book appointment')) { 
      await flujoAgendar(telefono, texto, sesion, contacto); 
      return; 
    }
    
    if (tl.includes('asesor') || tl.includes('hablar') || tl.includes('💬') || tl.includes('speak with someone')) {
      await sendButtons(telefono, 
        idioma === 'en'
          ? `👨‍⚕️ *With pleasure.*\n📞 (+57) 311 501 1920\n🕘 Mon–Fri 8am–6pm`
          : `👨‍⚕️ *Con mucho gusto.*\n📞 (+57) 311 501 1920\n🕘 Lun–Vie 8am–6pm`,
        idioma === 'en' ? ['📞 Call me', '✅ I\'ll call'] : ['📞 Que me llamen', '✅ Ya llamo']
      );
      return;
    }
    
    // ============================================================
    // IA LOCAL
    // ============================================================
    
    const respuestaIA = await responderConIA(texto, contacto?.nombre || nombre, telefono);
    if (respuestaIA) {
      await sendMessage(telefono, respuestaIA);
      await logMensaje(telefono, nombre, 'salida', respuestaIA);
      await pausaNatural();
      await sendButtons(telefono,
        idioma === 'en'
          ? 'Any other questions? You can keep writing 👇\nWhen you\'re ready, book your FREE evaluation. 😊'
          : '¿Te queda alguna duda? Puedes seguir escribiendo 👇\nCuando estés listo/a, agenda tu evaluación SIN COSTO. 😊',
        idioma === 'en' ? ['📅 Book evaluation'] : ['📅 Agendar evaluación']
      );
      return;
    }
    
    // ============================================================
    // FALLBACK
    // ============================================================
    
    guardarPreguntaNoRespondida(texto, telefono);
    if (idioma === 'en') {
      await sendButtons(telefono, 
        `👋 Hi! I'm Sofía. How can I help you today?`,
        ['🦵 I have pain', '🧠 Neurology', '✨ Longevity', '📅 Book appointment', '💬 Speak with someone']
      );
    } else {
      await enviarSaludo(telefono, contacto?.nombre || nombre);
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
    await sendMessage(telefono, `Perdón, tuve un tropiezo. ¿Intentas de nuevo? 🙏`);
  }
}

module.exports = { handleIncomingMessage };