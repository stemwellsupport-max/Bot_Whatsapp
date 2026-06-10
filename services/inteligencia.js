// ═══════════════════════════════════════════════════════════════════════════
// STEMWELL - BIBLIOTECA DE MEDICINA REGENERATIVA (VERSIÓN BILINGÜE CORREGIDA)
// CORRECCIÓN: DETECCIÓN DE SALUDOS EN INGLÉS (hi, hello, hey)
// ═══════════════════════════════════════════════════════════════════════════

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

// ═══════════════════════════════════════════════════════════════════════════
// 🌍 DETECTOR DE IDIOMA MEJORADO (detecta saludos cortos como "hi", "hello")
// ═══════════════════════════════════════════════════════════════════════════

function detectarIdioma(mensaje) {
  const mensajeLower = mensaje.toLowerCase().trim();
  
  // 🔥 CASOS ESPECIALES: saludos muy cortos en inglés
  const saludosInglesCortos = ['hi', 'hello', 'hey', 'sup', 'yo', 'hola?', 'hello?', 'hi?'];
  if (saludosInglesCortos.includes(mensajeLower)) {
    return 'en';
  }
  
  // Saludos en español cortos
  const saludosEspanolCortos = ['hola', 'buenas', 'qué tal', 'como estas', 'que tal'];
  if (saludosEspanolCortos.includes(mensajeLower)) {
    return 'es';
  }
  
  // Lista ampliada de palabras en inglés
  const palabrasIngles = [
    'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
    'what is', 'what are', 'how does', 'how do', 'tell me', 'explain',
    'please', 'thanks', 'thank you', 'help', 'information',
    'does it work', 'does it help', 'is it effective', 'does it cure',
    'results', 'effective', 'works', 'working', 'useful',
    'stem cell', 'stem cells', 'mesenchymal', 'prp', 'exosome', 'hyperbaric',
    'regenerative medicine', 'longevity', 'treatment', 'therapy',
    'knee', 'hip', 'back', 'arthritis', 'pain', 'inflammation',
    'cost', 'price', 'how much', 'appointment', 'booking', 'schedule',
    'doctor', 'specialist', 'evaluation', 'free consultation'
  ];
  
  // Lista de palabras en español
  const palabrasEspanol = [
    'hola', 'buenos días', 'buenas tardes', 'buenas noches', 'saludos',
    'funciona', 'sirve', 'efectivo', 'resultados', 'me ayuda', 'me cura',
    'garantía', 'evidencia', 'científico', 'estudio', 'prueba', 'eficacia',
    'célula madre', 'celula madre', 'células madre', 'mesenquimal', 'prp',
    'exosoma', 'hiperbárica', 'medicina regenerativa', 'longevidad',
    'tratamiento', 'terapia', 'rodilla', 'cadera', 'espalda', 'artritis',
    'dolor', 'inflamación', 'costo', 'precio', 'cuánto', 'cita', 'agendar',
    'doctor', 'especialista', 'evaluación', 'consulta', 'gratis'
  ];
  
  // Contar coincidencias
  let scoreIngles = 0;
  let scoreEspanol = 0;
  
  for (const palabra of palabrasIngles) {
    if (mensajeLower.includes(palabra)) scoreIngles++;
  }
  
  for (const palabra of palabrasEspanol) {
    if (mensajeLower.includes(palabra)) scoreEspanol++;
  }
  
  // Si hay más inglés o el mensaje es muy corto y parece inglés
  if (scoreIngles > scoreEspanol) {
    return 'en';
  }
  
  return 'es';
}

// ═══════════════════════════════════════════════════════════════════════════
// 🇺🇸 RESPUESTAS EN INGLÉS (COMPLETAS)
// ═══════════════════════════════════════════════════════════════════════════

const RESPONSE_EN = {
  // Saludo inicial
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
👉 They will explain what YOU can expect in YOUR situation

🔗 *Book here (takes 1 minute):* ${AGENDA_URL}

Can I help you with available dates?`,

  evidencia: `📚 *Scientific evidence for the treatments*

🔬 *Mesenchymal Stem Cells:* Over 30,000 PubMed publications. Approved in more than 40 countries.

💉 *PRP:* Over 5,000 studies. 60-80% improvement in knee osteoarthritis at 6 months (controlled studies).

🧬 *Exosomes:* Cutting-edge technology. Preliminary studies show safety and neurological potential.

⚠️ *IMPORTANT:* Science says "it works for many people", but NOT "it works for everyone the same".

🗓️ *Dr. Camilo White or Sandra can give you an opinion on YOUR specific case*
👉 *FREE evaluation:* ${AGENDA_URL}`,

  precios: `💰 *About treatment costs*

Prices vary according to:
• Type of procedure (CMM, PRP, exosomes, or combinations)
• Number of sessions needed
• Your condition and personalized plan

*The most transparent I can be:*
Sandra or Dr. Camilo White will give you a DETAILED budget after the initial evaluation (which is FREE).

🔗 *Schedule your FREE evaluation here:* ${AGENDA_URL}
They will explain the cost according to YOUR treatment plan.

Shall I help you choose a time?`,

  derivacion: `👩‍⚕️ *That's an excellent question for our specialists.*

As a virtual assistant, I can give you general information, but *Sandra or Dr. Camilo White* are the ones who can:
• Review your specific medical history
• Evaluate if you are a REAL candidate
• Explain risks and benefits FOR YOUR CASE
• Answer all your technical questions in detail

📌 *The initial evaluation is FREE* — no commitment, just so you can make an informed decision.

🔗 *Book here:* ${AGENDA_URL}

Shall I help you schedule an appointment? 🗓️`,

  no_entiende: `😊 *Sorry if I wasn't clear.*

To make sure I give you the best information, *the best thing to do is talk directly with Sandra or Dr. Camilo White*.

They can:
✅ Listen to your specific case
✅ Answer all your questions in detail
✅ Explain if you are a candidate for treatments

🗓️ *The initial evaluation is FREE*
🔗 *Book here:* ${AGENDA_URL}

Would you prefer I help you with a simpler question in the meantime?`,

  como_aplican: `💉 *How are these procedures applied?*

*🩸 Mesenchymal Stem Cells (from umbilical cord):*
• Extracted from donated umbilical cord tissue
• Prepared in our laboratory
• Administered intravenously (IV) or locally via ultrasound-guided injection
• Helps regenerate tissues and reduce inflammation

*💉 Platelet-Rich Plasma (PRP):*
• Small blood sample taken from YOU
• Processed in centrifuge to concentrate platelets
• Re-injected into the affected area
• Stimulates natural growth factors for tissue repair

*💊 IV Therapy (Suerotherapy):*
• Custom vitamin and antioxidant blend
• Administered intravenously
• Restores energy, boosts immunity, and supports regeneration

✨ *Want to know which procedure is right for YOU?*
🔗 *Schedule a FREE evaluation with Dr. Camilo White:* ${AGENDA_URL}`,

  por_defecto: `📋 *Thank you for your interest in Stemwell.*

I have shared general information with you. For *precise answers about YOUR CASE*, it's best to talk directly with:

👨‍⚕️ *Dr. Camilo White* - Medical Director
👩‍⚕️ *Sandra* - Clinical Advisor

They can:
• Review your specific condition
• Evaluate if you are a real candidate
• Explain costs, risks, and expected benefits

🔗 *Schedule a FREE evaluation appointment (takes 1 minute):*
${AGENDA_URL}

Do you have any other questions in the meantime? I'm here to help. 💙`
};

// ═══════════════════════════════════════════════════════════════════════════
// 🇪🇸 RESPUESTAS EN ESPAÑOL (COMPLETAS)
// ═══════════════════════════════════════════════════════════════════════════

const RESPONSE_ES = {
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

La efectividad de los tratamientos regenerativos *varía según cada caso específico*: tu condición, tiempo de evolución, edad, estado general de salud, etc.

📊 *Lo que sí podemos decirte con certeza:*
• Más de 30,000 estudios científicos respaldan las células madre mesenquimales
• Muchos pacientes reportan mejoría significativa
• NO todos los pacientes responden igual

✅ *La única forma de saber si ERES CANDIDATO es con una evaluación real:*

🗓️ *Agenda una cita de valoración con el Dr. Camilo White o Sandra*
👉 *Evaluación inicial SIN COSTO*
👉 Ellos revisarán TU CASO específico
👉 Te explicarán QUÉ puedes esperar EN TU SITUACIÓN

🔗 *Reserva aquí (toma 1 minuto):* ${AGENDA_URL}

¿Te ayudo con alguna fecha disponible?`,

  evidencia: `📚 *Bases científicas de los tratamientos*

🔬 *Células madre mesenquimales:* Más de 30,000 publicaciones en PubMed. Aprobadas en más de 40 países.

💉 *PRP:* Más de 5,000 estudios. Mejoría del 60-80% en artrosis de rodilla a los 6 meses (estudios controlados).

🧬 *Exosomas:* Tecnología de vanguardia. Estudios preliminares muestran seguridad y potencial neurológico.

⚠️ *IMPORTANTE:* La ciencia dice "funciona para muchas personas", pero NO "funciona para todas igual".

🗓️ *El Dr. Camilo White o Sandra pueden darte una opinión sobre TU CASO específico*
👉 *Evaluación SIN COSTO:* ${AGENDA_URL}`,

  precios: `💰 *Sobre los costos de los procedimientos*

Los precios varían según:
• Tipo de procedimiento (CMM, PRP, exosomas o combinados)
• Número de sesiones necesarias
• Tu condición y plan personalizado

*Lo más transparente que puedo hacer:*
Sandra o el Dr. Camilo White te darán un presupuesto DETALLADO tras la evaluación inicial (que es SIN COSTO).

🔗 *Agenda tu evaluación gratuita aquí:* ${AGENDA_URL}
Ellos te explicarán el costo según TU PLAN de tratamiento.

¿Quieres que te ayude a elegir un horario?`,

  derivacion: `👩‍⚕️ *Esa es una excelente pregunta para nuestros especialistas.*

Como asistente virtual, puedo darte información general, pero *Sandra o el Dr. Camilo White* son quienes pueden:
• Revisar tu historia clínica específica
• Evaluar si ERES CANDIDATO real
• Explicarte riesgos y beneficios EN TU CASO
• Responder todas tus preguntas técnicas en detalle

📌 *La evaluación inicial es SIN COSTO* — sin compromiso, solo para que tomes una decisión informada.

🔗 *Agenda aquí:* ${AGENDA_URL}

¿Te ayudo a reservar un horario? 🗓️`,

  no_entiende: `😊 *Disculpa si no fui clara.*

Para asegurarme de darte la mejor información, *lo más recomendable es que hables directamente con Sandra o el Dr. Camilo White*.

Ellos podrán:
✅ Escuchar tu caso específico
✅ Responder todas tus dudas en detalle
✅ Explicarte si eres candidato a los tratamientos

🗓️ *La evaluación inicial es SIN COSTO*
🔗 *Agenda aquí:* ${AGENDA_URL}

¿Prefieres que te ayude con alguna pregunta más sencilla mientras tanto?`,

  como_aplican: `💉 *¿Cómo se aplican estos procedimientos?*

*🩸 Células Madre Mesenquimales (de cordón umbilical):*
• Se extraen del tejido del cordón umbilical donado
• Se preparan en nuestro laboratorio
• Se administran por vía intravenosa (IV) o local mediante ecografía
• Ayudan a regenerar tejidos y reducir la inflamación

*💉 Plasma Rico en Plaquetas (PRP):*
• Se toma una pequeña muestra de TU sangre
• Se procesa en centrífuga para concentrar las plaquetas
• Se reinyecta en el área afectada
• Estimula factores de crecimiento naturales para reparar tejidos

*💊 Sueroterapia (terapia intravenosa):*
• Mezcla personalizada de vitaminas y antioxidantes
• Se administra por vía intravenosa
• Restaura energía, fortalece el sistema inmune y potencia la regeneración

✨ *¿Quieres saber qué procedimiento es ideal para TI?*
🔗 *Agenda evaluación SIN COSTO con el Dr. Camilo White:* ${AGENDA_URL}`,

  por_defecto: `📋 *Gracias por tu interés en Stemwell.*

Te he compartido información general. Para respuestas *precisas sobre TU CASO*, lo mejor es que hables directamente con:

👨‍⚕️ *Dr. Camilo White* - Director médico
👩‍⚕️ *Sandra* - Asesora clínica

Ellos podrán:
• Revisar tu condición específica
• Evaluar si eres candidato real
• Explicarte costos, riesgos y beneficios esperados

🔗 *Agenda una cita de valoración SIN COSTO (toma 1 minuto):*
${AGENDA_URL}

¿Tienes alguna otra pregunta mientras tanto? Estoy para ayudarte. 💙`
};

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 FUNCIÓN PRINCIPAL (CORREGIDA)
// ═══════════════════════════════════════════════════════════════════════════

function getRespuestaMedica(mensajeUsuario, historial = []) {
  const mensaje = mensajeUsuario.toLowerCase().trim();
  
  // Detectar idioma (CORREGIDO para detectar "hi", "hello", "hey")
  const idioma = detectarIdioma(mensajeUsuario);
  
  // Seleccionar respuestas según idioma
  const respuestas = idioma === 'en' ? RESPONSE_EN : RESPONSE_ES;
  
  // ==========================================================
  // 🚨 SALUDOS SIMPLES (prioridad máxima)
  // ==========================================================
  
  const saludosIngles = ['hi', 'hello', 'hey', 'hello!', 'hi!', 'hey!', 'sup', 'yo'];
  const saludosEspanol = ['hola', 'buenas', 'hola!', 'buenas!'];
  
  if (saludosIngles.includes(mensaje) || saludosIngles.includes(mensaje.replace(/[!?]/g, ''))) {
    return respuestas.saludo;
  }
  
  if (saludosEspanol.includes(mensaje) || saludosEspanol.includes(mensaje.replace(/[!?]/g, ''))) {
    return respuestas.saludo;
  }
  
  // ==========================================================
  // 🚨 PREGUNTA: "cómo se aplican" / "how are they applied"
  // ==========================================================
  
  const comoAplicanEspanol = ['cómo se aplican', 'como se aplican', 'cómo aplican', 'como aplican', 'cómo se administran', 'como se administran'];
  const comoAplicanIngles = ['how are they applied', 'how do you apply', 'how is it applied', 'application', 'administered'];
  
  if (comoAplicanEspanol.some(p => mensaje.includes(p))) {
    return respuestas.como_aplican;
  }
  
  if (comoAplicanIngles.some(p => mensaje.includes(p))) {
    return respuestas.como_aplican;
  }
  
  // ==========================================================
  // 🚨 PREGUNTAS DE EFECTIVIDAD
  // ==========================================================
  
  const efectividadEspanol = ['funciona', 'sirve', 'efectivo', 'resultados', 'me funciona', 'me sirve', 'garantía', 'evidencia', 'estudio'];
  const efectividadIngles = ['does it work', 'is it effective', 'does it help', 'effective', 'results', 'evidence', 'study', 'proven'];
  
  if (efectividadEspanol.some(p => mensaje.includes(p))) {
    return respuestas.funciona;
  }
  
  if (efectividadIngles.some(p => mensaje.includes(p))) {
    return respuestas.funciona;
  }
  
  // ==========================================================
  // 🚨 PRECIOS
  // ==========================================================
  
  const preciosEspanol = ['costo', 'precio', 'cuánto', 'valor', 'presupuesto'];
  const preciosIngles = ['cost', 'price', 'how much', 'budget', 'pricing'];
  
  if (preciosEspanol.some(p => mensaje.includes(p))) {
    return respuestas.precios;
  }
  
  if (preciosIngles.some(p => mensaje.includes(p))) {
    return respuestas.precios;
  }
  
  // ==========================================================
  // 🚨 FRUSTRACIÓN
  // ==========================================================
  
  const frustracionEspanol = ['no entiendo', 'no me ayuda', 'confuso', 'repite'];
  const frustracionIngles = ['don\'t understand', 'not understand', 'confusing', 'repeat'];
  
  if (frustracionEspanol.some(p => mensaje.includes(p))) {
    return respuestas.no_entiende;
  }
  
  if (frustracionIngles.some(p => mensaje.includes(p))) {
    return respuestas.no_entiende;
  }
  
  // ==========================================================
  // 📚 CONTENIDO INFORMATIVO ESPECÍFICO (en ambos idiomas)
  // ==========================================================
  
  // Células madre
  if (mensaje.includes('célula madre') || mensaje.includes('celula madre')) {
    return `🧬 *Células Madre Mesenquimales (CMM)*

Las células madre mesenquimales tienen tres propiedades fundamentales:

1️⃣ *Regeneración:* Pueden diferenciarse en cartílago, hueso, músculo
2️⃣ *Anti-inflamación:* Reducen la inflamación crónica
3️⃣ *Inmunomodulación:* Regulan el sistema inmune

✅ Más de 30,000 estudios científicos respaldan su uso.

🔗 *¿Quieres saber si eres candidato? Agenda evaluación SIN COSTO:* ${AGENDA_URL}`;
  }
  
  if (mensaje.includes('stem cell') || mensaje.includes('stem cells')) {
    return `🧬 *Mesenchymal Stem Cells (MSC)*

Three fundamental properties:

1️⃣ *Regeneration:* Differentiate into cartilage, bone, muscle
2️⃣ *Anti-inflammatory:* Reduce chronic inflammation  
3️⃣ *Immunomodulation:* Regulate the immune system

✅ Over 30,000 scientific studies support their use.

🔗 *Want to know if you're a candidate? Book FREE evaluation:* ${AGENDA_URL}`;
  }
  
  // ==========================================================
  // 🏁 RESPUESTA POR DEFECTO
  // ==========================================================
  
  return respuestas.por_defecto;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 SYSTEM PROMPT CORREGIDO
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Eres Sofía, asistente virtual bilingüe (español/inglés) de Stemwell Medicina Regenerativa.

════════════════════════════════════════════════════════════
🌍 REGLA DE IDIOMA (MUY IMPORTANTE - CORREGIDA)
════════════════════════════════════════════════════════════

DEBES responder SIEMPRE en el MISMO IDIOMA que el usuario:

CASOS ESPECÍFICOS:
- "hi" o "hello" → RESPONDE EN INGLÉS con saludo amigable
- "hola" → RESPONDE EN ESPAÑOL con saludo amigable
- "how are they applied?" → RESPONDE EN INGLÉS explicando aplicación
- "cómo se aplican" → RESPONDE EN ESPAÑOL explicando aplicación

════════════════════════════════════════════════════════════
🎯 REGLA DE ORO
════════════════════════════════════════════════════════════

Cuando el usuario pregunta "¿funciona?" o "does it work?":
→ NUNCA des garantías absolutas
→ SIEMPRE responde que varía según cada caso
→ SIEMPRE invita a agenda con el Dr. Camilo White o Sandra
→ SIEMPRE incluye el enlace: ${AGENDA_URL}

════════════════════════════════════════════════════════════
📋 RESPUESTA PARA "cómo se aplican" / "how are they applied"
════════════════════════════════════════════════════════════

Explica:
1. Células madre: extracción del cordón umbilical → preparación → administración IV o local
2. PRP: toma de sangre → centrifugación → reinyección en área afectada  
3. Sueroterapia: mezcla personalizada → administración IV

SIEMPRE terminar con invitación a agenda gratuita.`;

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTAR
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getRespuestaMedica,
  detectarIdioma,
  SYSTEM_PROMPT,
  AGENDA_URL,
  RESPONSE_ES,
  RESPONSE_EN,
};