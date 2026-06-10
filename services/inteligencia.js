const { getRespuestaMedica } = require('../services/inteligencia');
// ══════════════════════════════════════════════════════════
// STEMWELL - BIBLIOTECA DE MEDICINA REGENERATIVA
// Conocimiento médico para respuestas del bot
// ══════════════════════════════════════════════════════════

const AGENDA_URL = process.env.AGENDA_URL || 'https://ff.healthatom.io/ETDnHN';

// ══════════════════════════════════════════════════════════
// CÉLULAS MADRE MESENQUIMALES
// ══════════════════════════════════════════════════════════
const INFO_CELULAS_MADRE = `🧬 *Células Madre Mesenquimales (CMM)*

Las células madre mesenquimales son células multipotentes que se encuentran en el tejido del cordón umbilical, médula ósea y tejido adiposo. Tienen tres propiedades fundamentales:

1️⃣ *Regeneración:* Pueden diferenciarse en cartílago, hueso, músculo y otros tejidos.
2️⃣ *Anti-inflamación:* Reducen la inflamación crónica que causa dolor y degeneración.
3️⃣ *Inmunomodulación:* Regulan el sistema inmune sin suprimirlo.

En Stemwell utilizamos CMM de *cordón umbilical donado*, consideradas las más jóvenes y potentes. Son seguras, no generan rechazo y NO forman tumores.

✅ Más de 30,000 estudios científicos respaldan su uso.`;

// ══════════════════════════════════════════════════════════
// PRP (PLASMA RICO EN PLAQUETAS)
// ══════════════════════════════════════════════════════════
const INFO_PRP = `💉 *Plasma Rico en Plaquetas (PRP)*

El PRP es un concentrado de plaquetas obtenido de *tu propia sangre*. Se procesa en centrífuga para separar las plaquetas, que contienen *factores de crecimiento* naturales.

🔬 *¿Cómo funciona?*
Al inyectar el PRP en la zona lesionada, los factores de crecimiento estimulan la reparación de tejidos dañados — tendones, ligamentos, cartílago y músculo.

✅ *Beneficios:*
• 100% autólogo (de tu propio cuerpo)
• Sin riesgo de rechazo o alergias
• Procedimiento ambulatorio (1 hora)
• Recuperación rápida

🏃 Muy utilizado en lesiones deportivas, artrosis, tendinitis y recuperación post-quirúrgica.`;

// ══════════════════════════════════════════════════════════
// EXOSOMAS
// ══════════════════════════════════════════════════════════
const INFO_EXOSOMAS = `🔬 *Exosomas Regenerativos*

Los exosomas son *nanopartículas* liberadas por las células madre que actúan como mensajeros biológicos. Transportan proteínas, ARN y factores de crecimiento a las células dañadas.

🧠 *¿Por qué son importantes?*
• Son hasta *1000 veces más pequeños* que una célula
• Atraviesan barreras que las células no pueden
• Activan los mecanismos naturales de reparación
• Potencian el efecto de las células madre

En Stemwell, los exosomas se utilizan como terapia complementaria para potenciar la regeneración en condiciones neurológicas, articulares y de longevidad.`;

// ══════════════════════════════════════════════════════════
// CÁMARA HIPERBÁRICA
// ══════════════════════════════════════════════════════════
const INFO_HIPERBARICA = `🫁 *Cámara Hiperbárica*

La oxigenación hiperbárica consiste en respirar *oxígeno al 100%* en una cámara presurizada. Esto aumenta hasta *15 veces* la cantidad de oxígeno disuelto en la sangre.

✨ *Beneficios comprobados:*
• Acelera la cicatrización de tejidos
• Reduce la inflamación sistémica
• Mejora la función cognitiva
• Potencia el efecto de las terapias celulares
• Aumenta la energía y vitalidad

En Stemwell la utilizamos como parte de nuestros protocolos integrales de regeneración y longevidad.`;

// ══════════════════════════════════════════════════════════
// PROTOCOLOS DE LONGEVIDAD
// ══════════════════════════════════════════════════════════
const INFO_LONGEVIDAD = `✨ *Protocolos de Longevidad Stemwell*

La longevidad no es solo vivir más — es *vivir con energía, claridad y propósito*. Nuestro enfoque combina:

🧬 *Células madre mesenquimales:* Regeneran tejidos y fortalecen la función celular.
🔬 *Exosomas:* Optimizan la comunicación y reparación celular.
💊 *Sueroterapia personalizada:* Vitaminas, antioxidantes y NAD+ para restaurar energía.
🫁 *Cámara hiperbárica:* Oxigenación profunda para rejuvenecimiento celular.
📐 *Medicina de precisión:* Planes basados en tu ADN y biomarcadores.

Cada protocolo es *completamente personalizado* tras una evaluación médica exhaustiva.`;

// ══════════════════════════════════════════════════════════
// ENFERMEDADES TRATADAS
// ══════════════════════════════════════════════════════════
const INFO_CONDICIONES = {
  rodilla: `🦵 *Tratamiento de Rodilla*

La osteoartritis de rodilla es una de las condiciones que mejor responde a la medicina regenerativa. Las CMM y el PRP ayudan a:

• Reducir la inflamación articular
• Regenerar el cartílago dañado
• Mejorar la movilidad
• Evitar o retrasar la cirugía de reemplazo

✅ Muchos pacientes reportan mejoría significativa en 4-8 semanas.`,

  cadera: `🦴 *Tratamiento de Cadera*

La cadera es una articulación profunda que responde muy bien a las terapias regenerativas. Nuestro protocolo incluye:

• Células madre guiadas por imagen ecográfica
• PRP para potenciar la regeneración
• Plan de rehabilitación personalizado

El objetivo es *preservar tu articulación* y evitar la cirugía de reemplazo.`,

  espalda: `🔙 *Tratamiento de Columna y Espalda*

Las hernias discales, la artrosis facetaria y el dolor lumbar crónico pueden tratarse con medicina regenerativa:

• Las CMM reducen la inflamación del nervio
• El PRP fortalece ligamentos y musculatura
• La cámara hiperbárica acelera la recuperación

Muchos pacientes que habían considerado cirugía encontraron alivio con nuestros protocolos.`,

  neurologia: `🧠 *Medicina Regenerativa Neurológica*

Condiciones como Parkinson, Alzheimer, Esclerosis Múltiple y neuropatías han mostrado respuesta a las terapias con CMM:

• Las células madre mesenquimales cruzan la barrera hematoencefálica
• Reducen la neuroinflamación
• Liberan factores neuroprotectores
• Pueden ayudar a preservar la función cognitiva y motora

Cada caso es evaluado individualmente por el Dr. Camilo White.`,

  autoinmune: `🛡️ *Enfermedades Autoinmunes*

Las CMM tienen una capacidad única: *modular el sistema inmune sin suprimirlo*. En condiciones como:

• Artritis Reumatoide
• Lupus
• Psoriasis
• Enfermedad de Crohn

Las terapias regenerativas buscan reequilibrar la respuesta inflamatoria y reducir la carga de la enfermedad.`,
};


// ══════════════════════════════════════════════════════════
// EXPORTAR
// ══════════════════════════════════════════════════════════
module.exports = {
  getRespuestaMedica,
  INFO_CELULAS_MADRE,
  INFO_PRP,
  INFO_EXOSOMAS,
  INFO_HIPERBARICA,
  INFO_LONGEVIDAD,
  INFO_CONDICIONES,
  AGENDA_URL,
};