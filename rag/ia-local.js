async function responderConIA(mensaje, nombre) {
  try {
    const response = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { 
            role: 'system', 
            content: 'Eres Sofía, asistente virtual de Stemwell Medicina Regenerativa en Bogotá. Tú NO eres la paciente. El usuario es el paciente que te escribe. Responde en español, de forma cálida, profesional y humana. Respuestas de 2-3 párrafos. NO digas que eres IA. NUNCA prometas curas ni garantices resultados. NUNCA digas "Hola Sofía" ni te refieras a ti misma como paciente. Al final de CADA respuesta, SIEMPRE ofrece agendar una evaluación SIN COSTO con el Dr. Camilo White y menciona el enlace: https://ff.healthatom.io/ETDnHN.'          },
          { role: 'user', content: `${nombre}: ${mensaje}` }
        ],
        temperature: 0.7,
        max_tokens: 250
      }),
    });
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('❌ LM Studio:', err.message);
    return null;
  }
}

module.exports = { responderConIA };