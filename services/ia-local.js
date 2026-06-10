// ============================================================
// services/ia-local.js - CON APRENDIZAJE AUTOMÁTICO
// Aprende de cada conversación y guarda en BD para futuras consultas
// ============================================================

const { 
  buscarEnConocimiento, 
  guardarConocimiento, 
  aumentarConfianza,
  getEstadisticasAprendizaje 
} = require('./postgres');

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = 'qwen2.5-3b-instruct';

// ═══════════════════════════════════════════════════════════════════════════
// 🌍 DETECTOR DE IDIOMA
// ═══════════════════════════════════════════════════════════════════════════
function detectarIdioma(texto) {
  const mensaje = texto.toLowerCase().trim();
  
  if (['hi', 'hello', 'hey', 'sup', 'yo'].includes(mensaje)) return 'en';
  if (['hola', 'buenas'].includes(mensaje)) return 'es';
  
  const palabrasIngles = [
    'knee', 'hip', 'back', 'shoulder', 'pain', 'hurt', 'work', 'effective',
    'cost', 'price', 'my', 'your', 'how', 'what', 'does it', 'i have',
    'stem cell', 'prp', 'please', 'thank', 'help', 'tell me'
  ];
  
  let scoreIngles = 0;
  for (const palabra of palabrasIngles) {
    if (mensaje.includes(palabra)) scoreIngles++;
  }
  
  return scoreIngles >= 1 ? 'en' : 'es';
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 SYSTEM PROMPT PARA LM STUDIO
// ═══════════════════════════════════════════════════════════════════════════
function getSystemPrompt(idioma, nombreUsuario) {
  const nombre = nombreUsuario?.split(' ')[0] || 'there';
  
  if (idioma === 'en') {
    return `You are Sofía, a warm and friendly virtual assistant for Stemwell Regenerative Medicine.

CRITICAL RULES:
1. Respond ONLY in ENGLISH. Never use Spanish.
2. Be warm and use emojis like 😊, 👋, 💚
3. Keep responses concise (2-3 sentences max)

ABOUT STEMWELL:
- Regenerative medicine clinic in Colombia
- Treatments: Mesenchymal Stem Cells (umbilical cord), PRP (Platelet-Rich Plasma), Exosomes
- FREE evaluation with Dr. Camilo White or Sandra
- Booking: ${AGENDA_URL}

RESPONSE RULES:
- Pain (knee, back, hip): Ask "How long have you had this pain? Have you tried any treatments?"
- "Does it work?": Say "Effectiveness varies per case. A FREE evaluation will tell you if you're a candidate."
- Cost/price: Say "Prices vary. Get an exact quote after a FREE evaluation."

User name: ${nombre}

Now respond in ENGLISH:`;
  }

  // Español
  return `Eres Sofía, asistente virtual cálida de Stemwell Medicina Regenerativa.

REGLAS CRÍTICAS:
1. Responde SOLO en ESPAÑOL. Nunca uses inglés.
2. Sé cálida y usa emojis como 😊, 👋, 💚
3. Respuestas concisas (2-3 oraciones máximo)

SOBRE STEMWELL:
- Medicina regenerativa en Colombia
- Tratamientos: Células Madre (cordón umbilical), PRP, Exosomas
- Evaluación SIN COSTO con Dr. Camilo White o Sandra
- Agenda: ${AGENDA_URL}

REGLAS DE RESPUESTA:
- Dolor (rodilla, espalda, cadera): Pregunta "¿Hace cuánto tienes este dolor? ¿Has intentado algún tratamiento?"
- "¿Funciona?": Di "La efectividad varía según cada caso. Una evaluación SIN COSTO determinará si eres candidato."
- Costo/precio: Di "Los precios varían según tu caso. Presupuesto exacto tras evaluación SIN COSTO."

Usuario: ${nombre}

Ahora responde en ESPAÑOL:`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 FALLBACK (cuando LM Studio no responde)
// ═══════════════════════════════════════════════════════════════════════════
function getFallbackResponse(idioma, mensajeUsuario, nombreUsuario) {
  const msg = mensajeUsuario.toLowerCase();
  const nombre = nombreUsuario?.split(' ')[0] || '';
  const saludo = nombre ? ` ${nombre}` : '';
  
  if (idioma === 'en') {
    if (msg.includes('knee') || msg.includes('pain') || msg.includes('hurt')) {
      return `😊 I understand you have pain. A FREE evaluation with Dr. Camilo White will determine if you're a candidate. 🔗 ${AGENDA_URL} Would you like to schedule?`;
    }
    if (msg.includes('work') || msg.includes('effective')) {
      return `🔍 Effectiveness varies per case. Many patients see improvement. A FREE evaluation will tell you if YOU are a candidate. 🔗 ${AGENDA_URL} Shall I help you book?`;
    }
    if (msg.includes('cost') || msg.includes('price')) {
      return `💰 Prices vary depending on your specific case. Get an exact quote after a FREE evaluation. 🔗 ${AGENDA_URL} Would you like to book?`;
    }
    return `🌿 Hello${saludo}! 👋 I'm Sofía from Stemwell. How can I help you? Book a FREE evaluation: ${AGENDA_URL}`;
  }
  
  // Español
  if (msg.includes('rodilla') || msg.includes('dolor') || msg.includes('duele')) {
    return `😊 Entiendo que tienes dolor. Una evaluación SIN COSTO con el Dr. Camilo White determinará si eres candidato. 🔗 ${AGENDA_URL} ¿Te gustaría agendar?`;
  }
  if (msg.includes('funciona') || msg.includes('sirve')) {
    return `🔍 La efectividad varía según cada caso. Muchos pacientes mejoran. Una evaluación SIN COSTO te dirá si TÚ eres candidato. 🔗 ${AGENDA_URL} ¿Te ayudo a agendar?`;
  }
  if (msg.includes('costo') || msg.includes('precio')) {
    return `💰 Los precios varían según tu caso específico. Obtén un presupuesto exacto tras una evaluación SIN COSTO. 🔗 ${AGENDA_URL} ¿Te gustaría agendar?`;
  }
  return `🌿 ¡Hola${saludo}! 👋 Soy Sofía de Stemwell. ¿Cómo puedo ayudarte? Agenda evaluación SIN COSTO: ${AGENDA_URL}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 RESPONDER CON IA + APRENDIZAJE AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════════════════
async function responderConIA(mensajeUsuario, nombreUsuario, telefono) {
  const idioma = detectarIdioma(mensajeUsuario);
  console.log(`🌐 [IA] ${idioma === 'en' ? '🇺🇸' : '🇪🇸'} "${mensajeUsuario.substring(0, 45)}"`);
  
  // 🔍 PASO 1: Buscar en base de conocimiento aprendido
  try {
    const conocimientoExistente = await buscarEnConocimiento(mensajeUsuario, idioma);
    
    if (conocimientoExistente && conocimientoExistente.confianza > 0.6) {
      console.log(`📚 [IA] Usando conocimiento aprendido (confianza: ${conocimientoExistente.confianza}, usos: ${conocimientoExistente.veces_usada})`);
      return conocimientoExistente.respuesta;
    }
  } catch (error) {
    console.log(`⚠️ [IA] Error buscando en conocimiento: ${error.message}`);
  }
  
  // 🤖 PASO 2: Generar respuesta con LM Studio
  const systemPrompt = getSystemPrompt(idioma, nombreUsuario);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mensajeUsuario }
        ],
        temperature: 0.5,
        max_tokens: 200,
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    let respuesta = data.choices?.[0]?.message?.content || null;
    
    if (respuesta && respuesta.trim().length > 10) {
      respuesta = respuesta.trim();
      console.log(`✅ [IA] Respuesta generada (${respuesta.length} chars)`);
      
      // 💾 PASO 3: Guardar en base de conocimiento para futuras consultas
      try {
        await guardarConocimiento(mensajeUsuario, respuesta, idioma, 0.7);
        console.log(`📚 [IA] Respuesta guardada para aprendizaje futuro`);
      } catch (error) {
        console.log(`⚠️ [IA] Error guardando conocimiento: ${error.message}`);
      }
      
      return respuesta;
    }
    
    throw new Error('Respuesta vacía');
    
  } catch (error) {
    console.log(`⚠️ [IA] Error o timeout, usando fallback: ${error.message}`);
    return getFallbackResponse(idioma, mensajeUsuario, nombreUsuario);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FUNCIÓN PARA CONFIRMAR QUE UNA RESPUESTA FUE ÚTIL
// (Llamar esta función cuando el usuario agenda o da feedback positivo)
// ═══════════════════════════════════════════════════════════════════════════
async function confirmarRespuestaUtil(pregunta, respuesta) {
  try {
    const conocimiento = await buscarEnConocimiento(pregunta, detectarIdioma(pregunta));
    if (conocimiento) {
      await aumentarConfianza(conocimiento.id);
      console.log(`📚 [Feedback] Confianza aumentada para: "${pregunta.substring(0, 50)}"`);
    }
  } catch (error) {
    console.log(`⚠️ [Feedback] Error: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 FUNCIÓN PARA VER ESTADÍSTICAS DE APRENDIZAJE
// ═══════════════════════════════════════════════════════════════════════════
async function verEstadisticasAprendizaje() {
  try {
    const stats = await getEstadisticasAprendizaje();
    console.log('\n📊 ESTADÍSTICAS DE APRENDIZAJE:');
    console.log('─'.repeat(40));
    for (const stat of stats) {
      console.log(`📚 ${stat.idioma === 'en' ? '🇺🇸 Inglés' : '🇪🇸 Español'}:`);
      console.log(`   ├─ Total: ${stat.total} preguntas aprendidas`);
      console.log(`   ├─ Usos totales: ${stat.usos_totales}`);
      console.log(`   ├─ Confianza promedio: ${(stat.confianza_promedio * 100).toFixed(1)}%`);
      console.log(`   └─ Alta confianza (>80%): ${stat.alta_confianza}`);
    }
    return stats;
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧪 PRUEBA COMPLETA
// ═══════════════════════════════════════════════════════════════════════════
async function testIA() {
  console.log('\n🧪 Probando IA con APRENDIZAJE AUTOMÁTICO...\n');
  
  const tests = [
    { msg: "hi", nombre: "Marco" },
    { msg: "My knee hurts", nombre: "Marco" },
    { msg: "Does it work?", nombre: "Marco" },
    { msg: "how much does it cost?", nombre: "Marco" },
    { msg: "hola", nombre: "Marco" },
    { msg: "me duele la rodilla", nombre: "Marco" },
  ];
  
  for (const test of tests) {
    console.log(`\n📝 Usuario: "${test.msg}"`);
    const respuesta = await responderConIA(test.msg, test.nombre, 'test');
    console.log(`🤖 Bot: "${respuesta}"`);
    console.log('─'.repeat(60));
  }
  
  // Mostrar estadísticas después de la prueba
  await verEstadisticasAprendizaje();
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTAR
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  responderConIA,
  detectarIdioma,
  confirmarRespuestaUtil,
  verEstadisticasAprendizaje,
  testIA
};