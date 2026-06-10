// ============================================================
// services/ia-local.js - SISTEMA HÍBRIDO CON APRENDIZAJE
// Respuestas rápidas + LM Studio multilingüe + Memoria
// ============================================================

const { buscarEnConocimiento, guardarConocimiento } = require('./postgres');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = process.env.LM_MODEL || 'qwen2.5-3b-instruct'; // ← CAMBIADO

// ═══════════════════════════════════════════════════════════════════════════
// 💾 MEMORIA DE IDIOMA POR TELÉFONO
// ═══════════════════════════════════════════════════════════════════════════
const idiomasPorTelefono = new Map();

function recordarIdioma(telefono, idioma) {
  if (telefono) idiomasPorTelefono.set(telefono, idioma);
}

function obtenerIdiomaGuardado(telefono) {
  return telefono ? idiomasPorTelefono.get(telefono) || null : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 NORMALIZAR - quita tildes y signos
// ═══════════════════════════════════════════════════════════════════════════
function normalizar(texto) {
  return texto.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌍 DETECTOR DE IDIOMA MULTILINGÜE
// ═══════════════════════════════════════════════════════════════════════════
function detectarIdioma(texto) {
  const msg = normalizar(texto);

  const senales = {
    en: [
      'hello', 'hi', 'hey', 'hii', 'helloo', 'good morning', 'good afternoon',
      'good evening', 'howdy', 'sup', 'yes', 'thanks', 'thank you', 'okay',
      'please', 'help', 'i have', 'i feel', 'my ', 'pain', 'knee', 'hip',
      'back ', 'neck', 'how much', 'does it work', 'what is', 'stem cell',
      'doctor', 'appointment', 'schedule', 'book', 'free evaluation',
      'breathe', 'lung', 'shoulder', 'elbow', 'wrist', 'ankle', 'foot',
      'chronic', 'therapy', 'treatment', 'cost', 'price', 'where', 'when',
      'exosome', 'prp', 'hyperbaric', 'longevity', 'effective', 'safe',
    ],
    es: [
      'hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches',
      'saludos', 'gracias', 'perfecto', 'claro', 'entendido', 'por favor',
      'si ', 'tengo', 'dolor', 'rodilla', 'cadera', 'espalda', 'cuello',
      'hombro', 'codo', 'muneca', 'tobillo', 'pie ', 'cuanto cuesta',
      'como funciona', 'celula madre', 'medico', 'cita', 'agendar',
      'evaluacion', 'tratamiento', 'terapia', 'precio', 'costo', 'donde',
      'cuando', 'duele', 'siento', 'padezco', 'sufro', 'problema',
      'exosoma', 'hiperbarica', 'longevidad', 'efectivo', 'seguro',
      'funciona', 'sirve', 'quiero', 'necesito', 'puedo',
    ],
    pt: [
      'ola', 'bom dia', 'boa tarde', 'boa noite', 'obrigado', 'obrigada',
      'sim', 'nao', 'por favor', 'ajuda', 'tenho', 'dor', 'joelho',
      'quadril', 'costas', 'pescoco', 'ombro', 'cotovelo', 'tornozelo',
      'quanto custa', 'como funciona', 'celula tronco', 'medico', 'consulta',
      'agendar', 'avaliacao', 'tratamento', 'terapia', 'preco', 'onde',
      'quando', 'doi', 'sinto', 'sofro', 'problema', 'exossoma',
      'hiperbarica', 'longevidade', 'eficaz', 'seguro', 'funciona',
      'quero', 'preciso', 'posso', 'voce', 'esta',
    ],
    fr: [
      'bonjour', 'bonsoir', 'salut', 'bonne nuit', 'merci', 'oui', 'non',
      'sil vous plait', 'aide', 'douleur', 'genou', 'hanche', 'dos',
      'cou', 'epaule', 'coude', 'poignet', 'cheville', 'pied',
      'combien ca coute', 'comment ca fonctionne', 'cellules souches',
      'medecin', 'rendez-vous', 'traitement', 'therapie', 'prix', 'ou',
      'quand', 'fait mal', 'souffre', 'probleme', 'exosome',
      'hyperbare', 'longevite', 'efficace', 'sur', 'fonctionne',
      'je veux', 'je besoin', 'je peux', 'vous', 'est-ce que',
    ],
    de: [
      'hallo', 'guten morgen', 'guten tag', 'guten abend', 'danke',
      'ja ', 'nein', 'bitte', 'hilfe', 'schmerz', 'knie', 'hufte',
      'rucken', 'nacken', 'schulter', 'ellbogen', 'handgelenk', 'knochel',
      'wie viel kostet', 'wie funktioniert', 'stammzellen', 'arzt',
      'termin', 'behandlung', 'therapie', 'preis', 'wo ', 'wann',
      'tut weh', 'leide', 'problem', 'exosom', 'hyperbar', 'langlebigkeit',
      'effektiv', 'sicher', 'funktioniert', 'ich will', 'ich brauche',
      'ich kann', 'sie ', 'ist ',
    ],
    it: [
      'ciao', 'buongiorno', 'buonasera', 'buonanotte', 'grazie', 'si ',
      'no ', 'per favore', 'aiuto', 'dolore', 'ginocchio', 'anca',
      'schiena', 'collo', 'spalla', 'gomito', 'polso', 'caviglia',
      'quanto costa', 'come funziona', 'cellule staminali', 'medico',
      'appuntamento', 'trattamento', 'terapia', 'prezzo', 'dove',
      'quando', 'fa male', 'soffro', 'problema', 'esosoma',
      'iperbarica', 'longevita', 'efficace', 'sicuro', 'funziona',
      'voglio', 'ho bisogno', 'posso', 'lei ', 'e ',
    ],
  };

  const scores = {};
  for (const [lang, palabras] of Object.entries(senales)) {
    scores[lang] = palabras.filter(p => msg.includes(p)).length;
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return null;

  const ganadores = Object.entries(scores).filter(([, v]) => v === maxScore);
  if (ganadores.length > 1) return null;

  return ganadores[0][0];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 RESPUESTAS RÁPIDAS (ES y EN)
// ═══════════════════════════════════════════════════════════════════════════
function getRespuestaRapida(idioma, mensajeUsuario) {
  if (idioma !== 'es' && idioma !== 'en') return null;

  const msg = normalizar(mensajeUsuario);

  // ── SALUDOS ──────────────────────────────────────────────────────────
  if (/^(hi|hello|hey|hii|helloo|good morning|good afternoon|good evening|howdy|sup)[!.\s]*$/.test(msg)) {
    return `🌿 *Hello! I'm Sofía from Stemwell Regenerative Medicine* 👋\n\nI can help you with:\n• Stem Cell therapy\n• PRP\n• Exosomes\n• Hyperbaric Chamber\n• Longevity protocols\n• FREE evaluation with Dr. Camilo White\n\nWhat brings you here today? 😊`;
  }
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|holaa|buenas!|hola!)[!.\s]*$/.test(msg)) {
    return `🌿 *¡Hola! Soy Sofía de Stemwell Medicina Regenerativa* 👋\n\nPuedo ayudarte con:\n• Células Madre\n• PRP\n• Exosomas\n• Cámara Hiperbárica\n• Protocolos de longevidad\n• Evaluación SIN COSTO con el Dr. Camilo White\n\n¿En qué puedo ayudarte hoy? 😊`;
  }

  // ── DIFERENCIA ENTRE SERVICIOS ───────────────────────────────────────
  if (/difference|different|compare|services|all services|what.*services|difference.*service|diferencia|comparar|todos.*servicios|que.*servicios|servicios.*ofrecen/.test(msg)) {
    return `🌿 *Stemwell Services Overview:*\n\n🧬 *Stem Cell Therapy* - Helps repair damaged tissue and reduce inflammation.\n💉 *PRP* - Uses your own blood platelets to stimulate healing.\n🔬 *Exosomes* - Advanced cellular messengers that support tissue repair.\n🫁 *Hyperbaric Chamber* - Increases oxygen delivery and promotes healing.\n💊 *IV Therapy* - Provides NAD+, glutathione, vitamins and nutrients.\n✨ *Longevity Protocols* - Programs focused on healthy aging and wellness.\n\n📅 FREE Evaluation: ${AGENDA_URL}`;
  }

  // ── SHOULDER PAIN ────────────────────────────────────────────────────
  if (/shoulder pain|pain.*shoulder|shoulder injury|rotator cuff|hombro.*duele|duele.*hombro|hombro.*dolor|dolor.*hombro/.test(msg)) {
    return `🩺 *Shoulder Pain Treatment*\n\nStemwell offers regenerative therapies that may help with:\n\n• Rotator cuff injuries\n• Tendon inflammation\n• Arthritis\n• Chronic shoulder pain\n• Sports injuries\n\nAvailable options:\n🧬 Stem Cells\n💉 PRP\n🔬 Exosomes\n🫁 Hyperbaric Chamber\n\n📅 FREE Evaluation: ${AGENDA_URL}`;
  }

  // ── CAN STEM CELLS HELP ME ───────────────────────────────────────────
  if (/can stem cells help|stem cells help me|can stemcell help|stemcell help|celulas madre.*ayudar|celula madre.*ayudar|pueden.*ayudar.*celulas/.test(msg)) {
    return `🧬 *Stem Cell Therapy*\n\nStem cell therapy may help reduce inflammation and support tissue repair for many orthopedic and chronic conditions.\n\nThe best way to determine if you are a candidate is through a FREE evaluation with one of our specialists.\n\n📞 +57 310 406 8755\n📅 ${AGENDA_URL}`;
  }

  // ── AGENDAR / CITA ───────────────────────────────────────────────────
  if (/agendar|como.*cita|quiero.*cita|pedir.*cita|reservar|como.*consulta|quiero.*consulta|book|schedule|appointment/.test(msg)) {
    return idioma === 'en'
      ? `📅 *Schedule your FREE evaluation!*\n\nBook directly here:\n🔗 ${AGENDA_URL}\n\nOr share your full name and email and we'll schedule it for you 😊`
      : `📅 *¡Agenda tu evaluación SIN COSTO!*\n\nAgenda directamente aquí:\n🔗 ${AGENDA_URL}\n\nO comparte tu nombre completo y correo y nosotros te agendamos 😊`;
  }

  // ── RESPIRACIÓN / PULMONES ───────────────────────────────────────────
  if (/respir|pulmon|asma|epoc|bronquitis|oxigeno|alergia|breathe|lung|asthma|falta.*aire|ahog/.test(msg)) {
    return idioma === 'en'
      ? `🫁 *Respiratory & Lung Conditions:*\n\n• *Hyperbaric Chamber*: Increases blood oxygen up to 15x\n• *Exosomes*: Reduce lung inflammation\n• *IV Therapy*: Glutathione supports lung health\n• *Stem Cells*: May help regenerate lung tissue\n\n⚠️ Each case is unique.\n🔗 FREE evaluation: ${AGENDA_URL}`
      : `🫁 *Condiciones Respiratorias:*\n\n• *Cámara Hiperbárica*: Aumenta oxígeno hasta 15x\n• *Exosomas*: Reducen inflamación pulmonar\n• *Sueroterapia*: Glutatión apoya salud pulmonar\n• *Células Madre*: Pueden regenerar tejido pulmonar\n\n⚠️ Cada caso es único.\n🔗 Evaluación SIN COSTO: ${AGENDA_URL}`;
  }

  // ── NEUROLOGÍA ───────────────────────────────────────────────────────
  if (/alzheimer|parkinson|neurologico|demencia|memoria|esclerosis|neuropatia|migrana/.test(msg)) {
    return idioma === 'en'
      ? `🧠 *Neurological Conditions:*\n\n• *Stem Cells*: Reduce neuroinflammation\n• *Exosomes*: Repair signals to damaged neurons\n• *Hyperbaric Chamber*: Improves brain oxygenation\n\n⚠️ Results vary per patient.\n🔗 FREE evaluation: ${AGENDA_URL}`
      : `🧠 *Condiciones Neurológicas:*\n\n• *Células Madre*: Reducen neuroinflamación\n• *Exosomas*: Señales de reparación neuronal\n• *Cámara Hiperbárica*: Mejora oxigenación cerebral\n\n⚠️ Resultados varían por paciente.\n🔗 Evaluación SIN COSTO: ${AGENDA_URL}`;
  }

  // ── EXOSOMAS ─────────────────────────────────────────────────────────
  if (/exosoma|exosome/.test(msg)) {
    return idioma === 'en'
      ? `🔬 *Exosomes:*\n\nNanoparticles from stem cells carrying proteins, RNA and growth factors to damaged cells.\n✨ Cellular repair, reduce inflammation, enhance healing.\n\n🔗 ${AGENDA_URL}`
      : `🔬 *Exosomas:*\n\nNanopartículas que transportan proteínas, ARN y factores de crecimiento a células dañadas.\n✨ Reparación celular, reducen inflamación, potencian curación.\n\n🔗 ${AGENDA_URL}`;
  }

  // ── PRP ──────────────────────────────────────────────────────────────
  if (/\bprp\b|plasma rico/.test(msg)) {
    return idioma === 'en'
      ? `💉 *PRP:*\n\nPlatelet-Rich Plasma from your own blood. No rejection risk. Stimulates natural tissue repair.\n\n🔗 ${AGENDA_URL}`
      : `💉 *PRP:*\n\nPlasma Rico en Plaquetas de tu propia sangre. Sin riesgo de rechazo. Estimula reparación natural.\n\n🔗 ${AGENDA_URL}`;
  }

  // ── CÉLULAS MADRE ────────────────────────────────────────────────────
  if (/celula madre|stem cell|mesenquimal/.test(msg)) {
    return idioma === 'en'
      ? `🧬 *Mesenchymal Stem Cells:*\n\nMultipotent cells from donated umbilical cord.\n✅ 30,000+ studies. Safe, no rejection, no tumors.\n\n🔗 ${AGENDA_URL}`
      : `🧬 *Células Madre Mesenquimales:*\n\nCélulas multipotentes de cordón umbilical donado.\n✅ 30,000+ estudios. Seguras, sin rechazo, no forman tumores.\n\n🔗 ${AGENDA_URL}`;
  }

  // ── LONGEVIDAD ───────────────────────────────────────────────────────
  if (/vejez|envejecimiento|longevidad|antiaging|arrugas|rejuvenecer|cansancio|fatiga|energia|vitalidad/.test(msg)) {
    return idioma === 'en'
      ? `✨ *Longevity Protocols:*\n\n• Stem Cells • Exosomes • NAD+ IV Therapy • Hyperbaric Chamber\n\n🔗 FREE evaluation: ${AGENDA_URL}`
      : `✨ *Protocolos de Longevidad:*\n\n• Células Madre • Exosomas • Sueroterapia NAD+ • Cámara Hiperbárica\n\n🔗 Evaluación SIN COSTO: ${AGENDA_URL}`;
  }

  // ── HIPERBÁRICA ──────────────────────────────────────────────────────
  if (/hiperbarica|hyperbaric|camara de oxigeno/.test(msg)) {
    return idioma === 'en'
      ? `🫁 *Hyperbaric Chamber:*\n\n100% oxygen under pressure. Up to 15x more oxygen in blood.\n✨ Accelerates healing, reduces inflammation, improves cognition.\n\n🔗 ${AGENDA_URL}`
      : `🫁 *Cámara Hiperbárica:*\n\nOxígeno al 100% en cámara presurizada. Hasta 15x más oxígeno en sangre.\n✨ Acelera curación, reduce inflamación, mejora cognición.\n\n🔗 ${AGENDA_URL}`;
  }

  // ── SUEROTERAPIA ─────────────────────────────────────────────────────
  if (/sueroterapia|vitamina|intravenosa|\bnad\b|glutation|magnesio/.test(msg)) {
    return idioma === 'en'
      ? `💊 *IV Therapy:*\n\nNAD+, Glutathione, Vitamin C, Magnesium, Zinc.\n✨ Restores energy, boosts immunity, supports regeneration.\n\n🔗 ${AGENDA_URL}`
      : `💊 *Sueroterapia:*\n\nNAD+, Glutatión, Vitamina C, Magnesio, Zinc.\n✨ Restaura energía, refuerza inmunidad, apoya regeneración.\n\n🔗 ${AGENDA_URL}`;
  }

  // ── DOLOR / LESIONES / ARTICULACIONES ────────────────────────────────
  if (/dolor|lesion|molestia|inflamacion|hinch|rodilla|knee|cadera|\bhip\b|espalda|\bback\b|cuello|neck|nuca|cervical|hombro|shoulder|codo|elbow|muneca|wrist|mano|\bhand\b|dedo|finger|tobillo|ankle|\bpie\b|\bfoot\b|talon|artrosis|artritis|arthritis|osteoartritis|desgaste|cartilago|tendinitis|tendon|ligamento|hernia|ciatica|fibromialgia|lupus|autoinmune|menisco|fractura|esguince|columna|disco|muscular|articulacion|joint|trabajo.*duele|duele.*trabajo|oficina.*duele|duele.*oficina|computador|escritorio|teclado|mouse/.test(msg)) {
    return idioma === 'en'
      ? `🩺 *Procedures for Pain & Injuries:*\n\n• *Stem Cells*: Regenerate tissue, reduce inflammation\n• *PRP*: Accelerate healing, reduce pain\n• *Exosomes*: Advanced cellular repair\n• *Hyperbaric Chamber*: Speed up recovery\n• *IV Therapy*: Restore healing nutrients\n\n✨ Many patients improve in 4-8 weeks.\n🔗 FREE evaluation: ${AGENDA_URL}`
      : `🩺 *Procedimientos para Dolor y Lesiones:*\n\n• *Células Madre*: Regeneran tejido, reducen inflamación\n• *PRP*: Acelera curación, reduce dolor\n• *Exosomas*: Reparación celular avanzada\n• *Cámara Hiperbárica*: Acelera recuperación\n• *Sueroterapia*: Restaura nutrientes curativos\n\n✨ Muchos pacientes mejoran en 4-8 semanas.\n🔗 Evaluación SIN COSTO: ${AGENDA_URL}`;
  }

  // ── PRECIOS ──────────────────────────────────────────────────────────
  if (/precio|costo|price|cost|cuanto|valen|cuesta|how much|\bvale\b|tarifa|inversion/.test(msg)) {
    return idioma === 'en'
      ? `💰 *About pricing:*\n\nPrices vary by procedure, sessions, and medical condition.\nBest way to get an exact quote: FREE evaluation.\n\n🔗 ${AGENDA_URL}`
      : `💰 *Sobre precios:*\n\nLos precios varían según procedimiento, sesiones y condición médica.\nLa mejor forma de obtener presupuesto exacto: evaluación SIN COSTO.\n\n🔗 ${AGENDA_URL}`;
  }

  // ── UBICACIÓN / CONTACTO ─────────────────────────────────────────────
  if (/ubicados|direccion|donde|ubicacion|horario|telefono|contacto|sede|where|location|address/.test(msg)) {
    return idioma === 'en'
      ? `📍 *Location:*\nKr 13 #118-08, Usaquén, Bogotá D.C.\n🕒 Mon-Fri 8am-5pm, Sat 8am-12pm\n📞 +57 310 406 8755\n📧 info@stemwell.co\n\n🔗 ${AGENDA_URL}`
      : `📍 *Ubicación:*\nKr 13 #118-08, Usaquén, Bogotá D.C.\n🕒 Lun-Vie 8am-5pm, Sáb 8am-12pm\n📞 +57 310 406 8755\n📧 info@stemwell.co\n\n🔗 ${AGENDA_URL}`;
  }

  // ── EFECTIVIDAD / SEGURIDAD ──────────────────────────────────────────
  if (/funciona|sirve|efectivo|resultados|seguro|riesgo|garantia|evidencia|estudios|cura|probado/.test(msg)) {
    return idioma === 'en'
      ? `🔍 *Does it work?*\n\n📊 30,000+ studies. Approved in 40+ countries. Many patients improve — not all respond the same.\n\n✅ FREE evaluation determines if YOU are a candidate.\n🔗 ${AGENDA_URL}`
      : `🔍 *¿Funciona?*\n\n📊 30,000+ estudios. Aprobado en 40+ países. Muchos mejoran — no todos responden igual.\n\n✅ Evaluación SIN COSTO determina si TÚ eres candidato.\n🔗 ${AGENDA_URL}`;
  }

  // ── DOCTOR / EQUIPO ──────────────────────────────────────────────────
  if (/doctor|\bdr\b|medico|especialista|camilo|white|sandra|equipo|quien atiende/.test(msg)) {
    return idioma === 'en'
      ? `👨‍⚕️ *Medical Team:*\n• Dr. Camilo White - Medical Director\n• Sandra - Clinical Advisor\n\n🔗 FREE evaluation: ${AGENDA_URL}`
      : `👨‍⚕️ *Equipo Médico:*\n• Dr. Camilo White - Director Médico\n• Sandra - Asesora Clínica\n\n🔗 Evaluación SIN COSTO: ${AGENDA_URL}`;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 LM STUDIO - responde en el idioma del usuario
// ═══════════════════════════════════════════════════════════════════════════
async function responderConLMStudio(mensajeUsuario, idioma) {
  const instruccionIdioma = idioma
    ? `CRITICAL RULE: The user is writing in language "${idioma}". You MUST respond in that EXACT same language. Do NOT switch to English or Spanish unless that is the detected language code.`
    : `CRITICAL RULE: Detect the language the user is writing in and respond in that EXACT same language. Mirror their language perfectly.`;

  const systemPrompt = `You are Sofía, assistant for Stemwell Regenerative Medicine clinic in Bogotá, Colombia (Kr 13 #118-08, Usaquén).
Services: Mesenchymal Stem Cells, PRP, Exosomes, Hyperbaric Chamber, IV Therapy (NAD+, Glutathione), Longevity Protocols.
Medical director: Dr. Camilo White. Phone: +57 310 406 8755. Booking: ${AGENDA_URL}

${instruccionIdioma}

RULES:
1. Always respond in the user's language — match their language exactly, no exceptions
2. Be warm and concise — maximum 4 sentences
3. If asked about any health condition or body pain, explain how Stemwell treatments can help
4. ALWAYS end with the booking link: ${AGENDA_URL}
5. Do NOT ask for more context — answer with what the user said
6. Do NOT mention exercises, gyms, or anything unrelated to Stemwell
7. Use simple messaging app language with 1-2 emojis`;

  console.log('🚀 LM URL:', LM_STUDIO_URL);
  console.log('🤖 LM MODEL:', LM_MODEL);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // ← AUMENTADO

  const response = await fetch(LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensajeUsuario }
      ],
      temperature: 0.3,
      max_tokens: 250,
      stream: false
    }),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  if (!response.ok) throw new Error(`LM Studio HTTP ${response.status}`);
  const data = await response.json();
  const respuesta = data.choices?.[0]?.message?.content?.trim();
  if (!respuesta || respuesta.length < 10) throw new Error('Respuesta vacía');
  return respuesta;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
async function responderConIA(mensajeUsuario, nombreUsuario, telefono, idiomaForzado = null) {

  let idioma;

  if (idiomaForzado) {
    idioma = idiomaForzado;
  } else {
    const detectado = detectarIdioma(mensajeUsuario);
    if (detectado) {
      idioma = detectado;
      recordarIdioma(telefono, idioma);
    } else {
      idioma = obtenerIdiomaGuardado(telefono) || 'es';
    }
  }

  const flagEmoji = { en: '🇺🇸', es: '🇪🇸', pt: '🇧🇷', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹' };
  console.log(`🌐 [IA] ${flagEmoji[idioma] || '🌍'} ${idioma.toUpperCase()} (tel: ${telefono}) "${mensajeUsuario.substring(0, 60)}"`);

  // PASO 1: Conocimiento aprendido
  try {
    const conocimiento = await buscarEnConocimiento(mensajeUsuario, idioma);
    if (conocimiento && conocimiento.confianza > 0.6) {
      console.log(`📚 [IA] Conocimiento aprendido (${conocimiento.confianza})`);
      return conocimiento.respuesta;
    }
  } catch (e) {}

  // PASO 2: Respuestas rápidas
  const rapida = getRespuestaRapida(idioma, mensajeUsuario);
  if (rapida) {
    console.log(`⚡ [IA] Respuesta rápida`);
    return rapida;
  }

  // PASO 3: LM Studio
  console.log(`🤖 [IA] → LM Studio (${LM_MODEL}) [${idioma}]`);
  try {
    const respuesta = await responderConLMStudio(mensajeUsuario, idioma);
    console.log(`✅ [IA] LM Studio OK (${respuesta.length} chars)`);
    try { await guardarConocimiento(mensajeUsuario, respuesta, idioma, 0.7); } catch (e) {}
    return respuesta;
  } catch (e) {
    console.log(`⚠️ [IA] LM Studio falló: ${e.message}`);
    // Fallback mejorado
    if (idioma === 'en') {
      return `🌿 Stemwell offers regenerative treatments including Stem Cells, PRP, Exosomes, Hyperbaric Therapy and Longevity Programs.\n\n📍 Kr 13 #118-08, Usaquén, Bogotá\n📞 +57 310 406 8755\n\n🕒 Mon-Fri 8:00 AM - 5:00 PM\n🕒 Sat 8:00 AM - 12:00 PM\n\n📅 FREE Evaluation:\n${AGENDA_URL}`;
    } else if (idioma === 'es') {
      return `🌿 Stemwell ofrece tratamientos regenerativos: Células Madre, PRP, Exosomas, Terapia Hiperbárica y Programas de Longevidad.\n\n📍 Kr 13 #118-08, Usaquén, Bogotá\n📞 +57 310 406 8755\n\n🕒 Lun-Vie 8:00 AM - 5:00 PM\n🕒 Sáb 8:00 AM - 12:00 PM\n\n📅 Evaluación SIN COSTO:\n${AGENDA_URL}`;
    } else {
      return `🌿 Dr. Camilo White – Stemwell Regenerative Medicine\n📍 Kr 13 #118-08, Bogotá\n📞 +57 310 406 8755\n🔗 ${AGENDA_URL}`;
    }
  }
}

module.exports = { responderConIA, detectarIdioma };