// ══════════════════════════════════════════════════════════
// STEMWELL - IA CONVERSACIONAL (Google Gemini - GRATIS)
// ══════════════════════════════════════════════════════════

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

// ══════════════════════════════════════════════════════════
// INSTRUCCIONES DEL SISTEMA
// ══════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Eres Sofía, asistente virtual de Stemwell Medicina Regenerativa en Bogotá, Colombia.

IDENTIDAD:
- Eres cálida, empática y profesional
- Hablas español colombiano con naturalidad
- Usas emojis con moderación (1-2 por mensaje)
- NO dices que eres IA. Eres Sofía.
- Respuestas cortas: 2-4 párrafos para WhatsApp
- Siempre te presentas como Sofía de Stemwell

DATOS DE STEMWELL:
- Dirección: Kr 13 #118-08, Santa Bárbara, Bogotá
- Teléfonos: (+57) 311 501 1920 / (+57) 314 807 9475
- Horario: Lun-Vie 8am-6pm, Sáb 9am-1pm
- Agenda online: ${AGENDA_URL}
- Director Médico: Dr. Camilo White
- Email: stemwellsupport@gmail.com

QUÉ HACE STEMWELL:
Medicina regenerativa con:
- Células madre mesenquimales (cordón umbilical, seguras, sin rechazo)
- PRP (Plasma Rico en Plaquetas)
- Exosomas regenerativos
- Cámara hiperbárica
- Sueroterapia y protocolos de longevidad

Tratamos:
- Dolor articular (rodilla, cadera, hombro, columna)
- Lesiones deportivas
- Enfermedades neurológicas (Parkinson, Alzheimer, Esclerosis Múltiple)
- Enfermedades autoinmunes
- Longevidad y anti-aging

REGLAS:
1. NUNCA prometas curas ni garantices resultados
2. SIEMPRE di que cada caso requiere evaluación personalizada
3. La evaluación inicial es SIN COSTO
4. Si preguntan precios: explica que dependen del protocolo, invita a evaluación gratuita
5. Si preguntan si funciona: menciona testimonios reales y estudios científicos
6. NUNCA inventes información médica
7. Si no sabes algo: "Prefiero que el Dr. White te lo explique en persona"
8. Siempre ofrece agendar la evaluación gratuita

TESTIMONIOS:
- Marco Pulicini (piloto Ferrari): "Ya no tengo dolor en hombros ni rodillas"
- Edwar White (deportista): "Finalmente me siento mejor"
- Miriam Gómez: "El brazo que no podía mover ahora lo muevo todo"`;

// ══════════════════════════════════════════════════════════
// HISTORIAL POR USUARIO
// ══════════════════════════════════════════════════════════
const conversaciones = new Map();

function getHistorial(telefono) {
  if (!conversaciones.has(telefono)) conversaciones.set(telefono, []);
  return conversaciones.get(telefono);
}

function guardarMensaje(telefono, rol, contenido) {
  const hist = getHistorial(telefono);
  hist.push({ role: rol, content: contenido });
  if (hist.length > 15) hist.splice(0, hist.length - 15);
}

// ══════════════════════════════════════════════════════════
// LLAMADA A GEMINI
// ══════════════════════════════════════════════════════════
async function responderConIA(telefono, nombre, mensaje) {
  if (!GEMINI_KEY) {
    console.log('⚠️ No hay GEMINI_API_KEY');
    return null;
  }

  try {
    const historial = getHistorial(telefono);
    guardarMensaje(telefono, 'user', `${nombre}: ${mensaje}`);

    // Construir historial para Gemini
    const contents = historial.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Agregar el system prompt al último mensaje del usuario
    const lastUserIdx = contents.map((c, i) => c.role === 'user' ? i : -1).filter(i => i >= 0).pop();
    if (lastUserIdx >= 0 && contents[lastUserIdx].parts[0]) {
      contents[lastUserIdx].parts[0].text = `${SYSTEM_PROMPT}\n\n---\n\nCliente ${nombre}: ${mensaje}`;
    }

    const url = `${GEMINI_API}?key=${GEMINI_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents.slice(-10),
        generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
      }),
    });

    const data = await response.json();
    const respuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (respuesta) {
      guardarMensaje(telefono, 'assistant', respuesta);
      return respuesta;
    }

    // Gemini no disponible, usar fallback local
    return null;
  } catch (err) {
    console.error('❌ Error Gemini:', err.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// COMPATIBILIDAD
// ══════════════════════════════════════════════════════════
async function responderConRAG(pregunta, nombre, historial) {
  return await responderConIA('rag', nombre, pregunta);
}

async function buscarContextoRAG(pregunta) {
  return [];
}

module.exports = { responderConIA, responderConRAG, buscarContextoRAG };