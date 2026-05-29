const historial = new Map();

function obtenerHistorial(telefono) {
  if (!historial.has(telefono)) historial.set(telefono, []);
  return historial.get(telefono);
}

async function responderConIA(mensaje, nombre, telefono = 'default') {
  try {
    const hist = obtenerHistorial(telefono);
    hist.push({ role: 'user', content: `${nombre}: ${mensaje}` });
    if (hist.length > 8) hist.splice(0, hist.length - 8);

    const response = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { 
            role: 'system', 
            content: `Eres Sofía, asistente virtual de Stemwell Medicina Regenerativa en Bogotá, Colombia. Conversación continua con ${nombre}. NO saludes cada vez. Responde en español, cálida, profesional, 2-3 párrafos. NUNCA prometas curas. Siempre ofrece evaluación SIN COSTO con Dr. Camilo White.

Stemwell: Kr 13 #118-08, Santa Bárbara, Bogotá. Tel: (+57) 311 501 1920. Horario: Lun-Vie 8am-6pm, Sáb 9am-1pm. Agenda: https://ff.healthatom.io/ETDnHN.

Tratamientos: células madre mesenquimales de cordón umbilical (seguras, sin rechazo), PRP de sangre del paciente, exosomas, cámara hiperbárica, sueroterapia, longevidad.

Tratamos: dolor articular (rodilla, cadera, hombro, columna), lesiones deportivas, enfermedades neurológicas (Parkinson, Alzheimer, Esclerosis Múltiple), autoinmunes (Artritis Reumatoide, Lupus).

Testimonios: Marco Pulicini: "Ya no tengo dolor en hombros ni rodillas". Edwar White: "Finalmente me siento mejor". Miriam Gómez: "El brazo que no podía mover ahora lo muevo todo".

La evaluación inicial es SIN COSTO.`
          },
          ...hist.slice(-8)
        ],
        temperature: 0.7,
        max_tokens: 300
      }),
    });
    const data = await response.json();
    const respuesta = data?.choices?.[0]?.message?.content;
    if (respuesta) {
      hist.push({ role: 'assistant', content: respuesta });
      if (hist.length > 8) hist.splice(0, hist.length - 8);
    }
    return respuesta || null;
  } catch (err) {
    console.error('❌ LM Studio:', err.message);
    return null;
  }
}

module.exports = { responderConIA };