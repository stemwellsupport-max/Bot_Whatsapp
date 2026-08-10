// services/ia-local.js - VERSIÓN FINAL CON ENCUESTA Y LISTA DE SERVICIOS
const { buscarEnConocimiento, guardarConocimiento } = require('./postgres');
const { responderDeepSeek } = require('./deepseek');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = process.env.LM_MODEL || 'qwen2.5-3b-instruct';

const idiomasPorTelefono = new Map();
const timersEncuesta = new Map();
const estadoEncuesta = new Map(); // 'esperando' | 'respondida'
const ENCUESTA_TIMEOUT = 60000;

function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function detectarIdioma(texto) {
  const msg = normalizar(texto);
  if (/[áéíóúñ¿¡]/.test(texto)) return 'es';
  
  const esPalabras = ['tengo', 'rodilla', 'dolor', 'procedimientos', 'que', 'hola', 'gracias', 'cita', 'agenda', 'duele', 'espalda', 'servicios', 'ofrecen', 'quiero', 'necesito', 'ubicados', 'donde', 'horarios', 'recomiendan', 'vejes', 'envejecimiento', 'manejan', 'buenos', 'dias'];
  const enPalabras = ['i have', 'knee', 'pain', 'procedures', 'what', 'hello', 'thanks', 'appointment', 'schedule', 'hurt', 'back', 'services', 'offer', 'want', 'need', 'located', 'where', 'hours', 'recommend', 'aging', 'antiaging', 'good', 'morning'];
  
  let scoreEs = 0, scoreEn = 0;
  esPalabras.forEach(function(p) { if (msg.indexOf(p) !== -1) scoreEs++; });
  enPalabras.forEach(function(p) { if (msg.indexOf(p) !== -1) scoreEn++; });

  if (scoreEs > scoreEn && scoreEs >= 1) return 'es';
  if (scoreEn > scoreEs && scoreEn >= 1) return 'en';
  return null;
}

function iniciarTimerEncuesta(telefono, idioma, sendMessageFn) {
  if (!sendMessageFn) return;
  if (timersEncuesta.has(telefono)) clearTimeout(timersEncuesta.get(telefono));
  
  var timer = setTimeout(function() {
    if (estadoEncuesta.get(telefono) === 'respondida') return;
    estadoEncuesta.set(telefono, 'esperando');
    var encuesta = (idioma === 'en')
      ? '\u270f *Quick Survey*\n\nHave you scheduled your consultation with my help?\n\nReply: YES / NO'
      : '\u270f *Encuesta Rápida*\n\n\u00bfHas logrado agendar consulta con mi ayuda?\n\nResponde: S\u00cd / NO';
    sendMessageFn(telefono, encuesta);
    timersEncuesta.delete(telefono);
  }, ENCUESTA_TIMEOUT);
  
  timersEncuesta.set(telefono, timer);
}

function detenerTimerEncuesta(telefono) {
  if (timersEncuesta.has(telefono)) {
    clearTimeout(timersEncuesta.get(telefono));
    timersEncuesta.delete(telefono);
  }
}

function esRespuestaEncuesta(texto) {
  var t = normalizar(texto);
  return /^(si|sí|yes|no|nop|nope)$/i.test(t);
}

function getRespuestaEncuesta(idioma, texto) {
  var t = normalizar(texto);
  var esPositivo = /^(si|sí|yes)$/i.test(t);
  
  if (esPositivo) {
    return (idioma === 'en')
      ? '\u00a1Wonderful! \u00a0I\'m so glad I could help you. \u00a0\n\nIf you have any other questions in the future, don\'t hesitate to reach out. We\'re here for you at Stemwell. \u00a0'
      : '\u00a1Qu\u00e9 gusto! \u00a0Me alegra mucho haber podido ayudarte. \u00a0\n\nSi tienes cualquier otra duda en el futuro, no dudes en contactarnos. Estamos para servirte en Stemwell. \u00a0';
  } else {
    return (idioma === 'en')
      ? 'No problem! \u00a0I\'m here to help. Would you like me to assist you with scheduling your FREE evaluation?\n\n\u00a0 Book: ' + AGENDA_URL
      : '\u00a1No hay problema! \u00a0Estoy aqu\u00ed para ayudarte. \u00bfTe gustar\u00eda que te ayude a agendar tu evaluaci\u00f3n SIN COSTO?\n\n\u00a0 Agenda: ' + AGENDA_URL;
  }
}

function esPreguntaServicios(texto) {
  var t = normalizar(texto);
  return /(que|qué|cuales|quais|what|which).*(procedimiento|servicio|tratamiento|procedure|service|treatment|manejan|ofrecen|tienen|offer|have)/i.test(t) ||
         /list.*(servicio|procedimiento|service|procedure)/i.test(t);
}

function getListaServicios(idioma) {
  return (idioma === 'en')
    ? '\u00a0 *Stemwell Services:*\n\n\u00a0 *Stem Cells* - Mesenchymal cells for tissue repair\n\u00a0 *PRP* - Platelet-Rich Plasma from your own blood\n\u00a0 *Exosomes* - Cellular messengers for regeneration\n\u00a0 *Hyperbaric Chamber* - 100% oxygen therapy\n\u00a0 *IV Therapy* - NAD+, Glutathione, vitamins\n\u00a0 *Longevity* - Wellness & healthy aging programs\n\n\u00a0 Each case is unique. Schedule your FREE evaluation:\n' + AGENDA_URL
    : '\u00a0 *Servicios Stemwell:*\n\n\u00a0 *C\u00e9lulas Madre* - C\u00e9lulas mesenquimales para reparaci\u00f3n de tejidos\n\u00a0 *PRP* - Plasma Rico en Plaquetas de tu propia sangre\n\u00a0 *Exosomas* - Mensajeros celulares para regeneraci\u00f3n\n\u00a0 *C\u00e1mara Hiperb\u00e1rica* - Oxigenaci\u00f3n al 100%\n\u00a0 *Sueroterapia* - NAD+, Glutati\u00f3n, vitaminas\n\u00a0 *Longevidad* - Programas de bienestar y anti-envejecimiento\n\n\u00a0 Cada caso es \u00fanico. Agenda tu evaluaci\u00f3n SIN COSTO:\n' + AGENDA_URL;
}

async function responderConLMStudio(mensajeUsuario, idioma) {
  const systemPromptES = 'Eres Sof\u00eda, asesora de Stemwell Medicina Regenerativa en Bogot\u00e1, Colombia.\n\nDATOS:\n- Direcci\u00f3n: Kr 13 #118-08, Usaqu\u00e9n, Bogot\u00e1\n- Tel\u00e9fono: +57 310 406 8755\n- Horarios: Lunes a Viernes 8am-5pm, S\u00e1bados 8am-12pm\n- Agenda SIN COSTO: ' + AGENDA_URL + '\n\nSERVICIOS: C\u00e9lulas Madre, PRP, Exosomas, C\u00e1mara Hiperb\u00e1rica, Sueroterapia, Longevidad.\nEQUIPO: Dr. Camilo White (Director M\u00e9dico), Dra. Sandra (Asesora Cl\u00ednica).\n\nREGLAS:\n1. SOLO ESPA\u00d1OL.\n2. S\u00e9 c\u00e1lida y emp\u00e1tica.\n3. NUNCA afirmes cura o garant\u00eda.\n4. Si preguntan servicios, MENCI\u00d3NALOS.\n5. Si preguntan por doctores, DI sus nombres.\n6. Invita a agendar: ' + AGENDA_URL;

  const systemPromptEN = 'You are Sofia, Stemwell Regenerative Medicine assistant in Bogot\u00e1, Colombia.\n\nINFO:\n- Address: Kr 13 #118-08, Usaqu\u00e9n, Bogot\u00e1\n- Phone: +57 310 406 8755\n- Hours: Mon-Fri 8am-5pm, Sat 8am-12pm\n- FREE evaluation: ' + AGENDA_URL + '\n\nSERVICES: Stem Cells, PRP, Exosomes, Hyperbaric Chamber, IV Therapy, Longevity.\nTEAM: Dr. Camilo White (Medical Director), Dr. Sandra (Clinical Advisor).\n\nRULES:\n1. ONLY ENGLISH.\n2. Be warm and empathetic.\n3. NEVER claim cure or guarantee.\n4. If asked services, LIST them.\n5. If asked doctors, SAY their names.\n6. Invite to book: ' + AGENDA_URL;

  const pricingContext = (idioma === 'en')
    ? '\nPRICES: free physician advisory call COP $0; virtual consultation COP $50,000; in-person consultation COP $80,000. Never diagnose or prescribe by chat.'
    : '\nPRECIOS: consultoria con el medico sin costo; consulta virtual $50.000 COP; consulta presencial $80.000 COP. Nunca diagnostiques ni prescribas por chat.';
  const systemPrompt = ((idioma === 'en') ? systemPromptEN : systemPromptES) + pricingContext;
  const instruccion = (idioma === 'en') ? 'IMPORTANT: Respond in English only.' : 'IMPORTANTE: Responde en espa\u00f1ol solamente.';
  const mensajeReforzado = instruccion + '\n\nUsuario: ' + mensajeUsuario;

  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

  try {
    var response = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mensajeReforzado }
        ],
        temperature: 0.5,
        max_tokens: 300,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('LM Studio HTTP ' + response.status);
    
    var data = await response.json();
    var respuesta = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content.trim() : '';
    
    if (!respuesta || respuesta.length < 10) throw new Error('Empty');
    
    return respuesta;

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function responderConIA(mensajeUsuario, nombreUsuario, telefono, idiomaForzado, sendMessageFn) {
  if (!sendMessageFn) sendMessageFn = null;

  var nuevoIdioma = detectarIdioma(mensajeUsuario);
  var idiomaGuardado = idiomasPorTelefono.get(telefono) || 'es';
  var idioma = idiomaForzado || nuevoIdioma || idiomaGuardado;
  idiomasPorTelefono.set(telefono, idioma);

  // ═══ MANEJAR RESPUESTA DE ENCUESTA ═══
  if (estadoEncuesta.get(telefono) === 'esperando' && esRespuestaEncuesta(mensajeUsuario)) {
    estadoEncuesta.set(telefono, 'respondida');
    detenerTimerEncuesta(telefono);
    console.log('\u00a0 Encuesta respondida: ' + mensajeUsuario);
    return getRespuestaEncuesta(idioma, mensajeUsuario);
  }

  detenerTimerEncuesta(telefono);

  // ═══ PREGUNTA DE SERVICIOS: Respuesta directa ═══
  if (esPreguntaServicios(mensajeUsuario)) {
    console.log('\u00a0 Lista de servicios');
    if (sendMessageFn) iniciarTimerEncuesta(telefono, idioma, sendMessageFn);
    return getListaServicios(idioma);
  }

  // ═══ IA NUBE (DEEPSEEK) PRINCIPAL si hay API key ═══
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      var respDeep = await responderDeepSeek(mensajeUsuario, idioma);
      console.log('\u2705 DeepSeek OK');
      try { await guardarConocimiento(mensajeUsuario, respDeep, idioma, 0.7); } catch (e) {}
      if (sendMessageFn) iniciarTimerEncuesta(telefono, idioma, sendMessageFn);
      return respDeep;
    } catch (eD) {
      console.log('\u26a0 DeepSeek fall\u00f3');
      // Si DeepSeek falla, intentar LM Studio local
      try {
        var respLM2 = await responderConLMStudio(mensajeUsuario, idioma);
        console.log('\u2705 LM Studio (fallback) OK');
        try { await guardarConocimiento(mensajeUsuario, respLM2, idioma, 0.7); } catch (e3) {}
        if (sendMessageFn) iniciarTimerEncuesta(telefono, idioma, sendMessageFn);
        return respLM2;
      } catch (e4) {}
    }
  }
  // ═══ SIN API key de nube: usar LM Studio local ═══
  try {
    var respLM = await responderConLMStudio(mensajeUsuario, idioma);
    console.log('\u2705 LM Studio OK');
    try { await guardarConocimiento(mensajeUsuario, respLM, idioma, 0.7); } catch (e5) {}
    if (sendMessageFn) iniciarTimerEncuesta(telefono, idioma, sendMessageFn);
    return respLM;
  } catch (e6) {
    console.log('\u26a0 LM Studio fall\u00f3 (sin API key externa)');
  }
  // Último recurso: respuesta genérica de contacto
  var fallback = (idioma === 'en')
    ? '\u00a0 Thank you for contacting Stemwell.\n\n Kr 13 #118-08, Bogot\u00e1\n +57 310 406 8755\n Book: ' + AGENDA_URL
    : '\u00a0 Gracias por contactar a Stemwell.\n\n Kr 13 #118-08, Bogot\u00e1\n +57 310 406 8755\n Agenda: ' + AGENDA_URL;
  if (sendMessageFn) iniciarTimerEncuesta(telefono, idioma, sendMessageFn);
  return fallback;
}

module.exports = { responderConIA: responderConIA, detectarIdioma: detectarIdioma };
