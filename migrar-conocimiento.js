// migrar-conocimiento.js
// Crea conocimiento base para la IA

const { guardarConocimiento, listarConocimiento } = require('./services/postgres');
const { detectarIdioma } = require('./services/ia-local');

async function crearConocimientoBase() {
  console.log('\n🌱 CREANDO CONOCIMIENTO BASE PARA LA IA\n');

  const conocimientoBase = {
    // SALUDOS
    "hola": "🌿 ¡Hola! 👋 Soy Sofía, tu asistente de Stemwell. ¿Cómo puedo ayudarte hoy?",
    "hi": "🌿 Hello! 👋 I'm Sofía, your assistant at Stemwell. How can I help you today?",
    "buenos dias": "🌞 ¡Buenos días! ¿En qué puedo ayudarte?",
    "good morning": "🌞 Good morning! How can I help you?",
    
    // QUIEN SOY
    "que eres": "🤖 Soy Sofía, la asistente virtual de Stemwell. ¿En qué puedo ayudarte?",
    "who are you": "🤖 I'm Sofía, the virtual assistant for Stemwell. How can I help you?",
    
    // CELULAS MADRE
    "que son las celulas madre": "🧬 Las células madre mesenquimales regeneran tejidos y reducen inflamación. ¿Te gustaría una evaluación gratuita?",
    "what are stem cells": "🧬 Mesenchymal stem cells regenerate tissues and reduce inflammation. Would you like a FREE evaluation?",
    "para que sirven las celulas madre": "🔬 Sirven para regenerar cartílago, reducir inflamación y modular el sistema inmune.",
    
    // DOLOR
    "me duele la rodilla": "😊 Entiendo. ¿Hace cuánto tiempo tienes este dolor? ¿Has intentado algún tratamiento?",
    "my knee hurts": "😊 I understand. How long have you had this pain? Have you tried any treatments?",
    "dolor de espalda": "😊 Entiendo. ¿Hace cuánto tiempo? ¿Has intentado algún tratamiento?",
    "back pain": "😊 I understand. How long have you had it? Have you tried any treatments?",
    
    // EFECTIVIDAD
    "funciona": "🔍 La efectividad varía según cada caso. Una evaluación SIN COSTO te dirá si eres candidato. ¿Te gustaría agendar?",
    "does it work": "🔍 Effectiveness varies per case. A FREE evaluation will tell you if you're a candidate. Would you like to schedule?",
    "es efectivo": "🔍 Depende de cada caso. Una evaluación personalizada te dará la respuesta. ¿Te gustaría agendar?",
    
    // PRECIOS
    "cuanto cuesta": "💰 Los precios varían según tu caso. Presupuesto exacto tras evaluación SIN COSTO. ¿Te gustaría agendar?",
    "how much does it cost": "💰 Prices vary by case. Exact quote after FREE evaluation. Would you like to schedule?",
    "precio": "💰 Te podemos dar un presupuesto exacto después de una evaluación gratuita. ¿Te gustaría agendar?",
    
    // AGENDAR
    "como agendo": "📅 Para agendar, necesito tu nombre y correo. ¿Me los compartes?",
    "how to book": "📅 To schedule, I need your name and email. Can you share them?",
    "quiero agendar": "🌟 Excelente. ¿Me compartes tu nombre y correo para agendar tu evaluación gratuita?",
    
    // REDES SOCIALES
    "tienen instagram": "📸 Síguenos en Instagram: @stemwell.colombia",
    "instagram": "📸 @stemwell.colombia en Instagram",
    
    // TESTIMONIOS
    "testimonios": "🎥 Puedes ver testimonios en nuestro Instagram: @stemwell.colombia",
    "videos de pacientes": "🎥 Tenemos casos de éxito. ¿Te gustaría que te compartamos testimonios durante tu evaluación?",
    
    // LONGEVIDAD
    "longevidad": "✨ Combinamos células madre, exosomas y más para una salud óptima. ¿Te gustaría una evaluación personalizada?",
    "longevity": "✨ We combine stem cells, exosomes and more for optimal health. Would you like a personalized evaluation?",
    
    // NEUROLOGIA
    "neurologia": "🧠 Tratamos Parkinson, Alzheimer y más con células madre. Evaluación SIN COSTO con el Dr. White.",
    "neurology": "🧠 We treat Parkinson's, Alzheimer's and more with stem cells. FREE evaluation with Dr. White.",
    
    // ASMA
    "asma": "🫁 El asma no es contraindicación. Cada caso requiere evaluación. ¿Te gustaría una cita sin costo?",
    "asthma": "🫁 Asthma is not a contraindication. Each case needs evaluation. Would you like a FREE consultation?",
    
    // ERRORES COMUNES
    "ese no es mi nombre": "😊 Disculpa. ¿Cuál es tu nombre correcto?",
    "no entiendo": "😊 Disculpa. ¿Podrías reformular? O puedo conectarte con Sandra.",
    "hablar con alguien": "👩‍⚕️ Llámanos al (+57) 311 501 1920. ¿Te gustaría que te llamemos?",
    
    // IDIOMAS
    "hablo ingles": "🌎 Sí, atendemos inglés. El Dr. White habla inglés. ¿Agendas evaluación?",
    "i speak english": "🌎 Yes, we serve English speakers. Dr. White is fluent. Schedule a FREE evaluation?"
  };

  let creadas = 0;
  let existentes = 0;

  for (const [pregunta, respuesta] of Object.entries(conocimientoBase)) {
    const idioma = detectarIdioma(pregunta);
    try {
      await guardarConocimiento(pregunta, respuesta, idioma, 0.95);
      console.log("✅ Creada: " + pregunta.substring(0, 40) + "... → " + idioma);
      creadas++;
    } catch (error) {
      if (error.message.includes('duplicate')) {
        console.log("⚠️ Ya existe: " + pregunta.substring(0, 40) + "...");
        existentes++;
      } else {
        console.log("❌ Error: " + pregunta + " - " + error.message);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMEN:");
  console.log("   ✅ Creadas: " + creadas);
  console.log("   ⚠️ Ya existían: " + existentes);
  console.log("=".repeat(60));

  const total = await listarConocimiento(100);
  console.log("\n📚 Total en BD: " + total.length + " respuestas aprendidas");
}

crearConocimientoBase().catch(console.error);