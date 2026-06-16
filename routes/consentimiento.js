// ============================================================
// services/conocimiento.js
// BASE DE CONOCIMIENTO OFICIAL DE STEMWELL
// SOLO DATOS VERIFICADOS - NADA ESPECULATIVO
// ============================================================

const CONOCIMIENTO = {
  empresa: {
    nombre: "STEMWELL",
    nombre_completo: "STEMWELL Medicina Regenerativa",
    slogan: "Innovación que transforma vidas",
    ubicacion: "Bogotá D.C., Colombia",
    direccion: "Calle 127 #7-19, Consultorio 401, Bogotá",
    telefono: "+57 310 406 8755",
    email: "info@stemwell.co",
    sitio_web: "https://stemwell.co",
    horarios: "Lunes a Viernes 8:00 AM - 6:00 PM, Sábados 9:00 AM - 1:00 PM"
  },

  especialidades: {
    medicina_regenerativa: {
      definicion: "La medicina regenerativa es una rama médica que utiliza los propios mecanismos de reparación del cuerpo para tratar tejidos dañados, reducir inflamación y promover la regeneración celular natural.",
      enfoque: "En STEMWELL nos enfocamos en terapias biológicas avanzadas, basadas en evidencia científica, sin prometer curas milagrosas sino apoyando los procesos naturales de sanación del organismo.",
      pilares: [
        "Células madre mesenquimales",
        "Exosomas",
        "Plasma Rico en Plaquetas (PRP)",
        "Factores de crecimiento",
        "Terapias celulares personalizadas"
      ]
    }
  },

  procedimientos: {
    descripcion_general: "Nuestros procedimientos son mínimamente invasivos, realizados por médicos especialistas con amplia experiencia. Cada protocolo se diseña según las necesidades específicas de cada paciente, previa evaluación médica exhaustiva.",
    
    // IMPORTANTE: NO describimos resultados garantizados
    // Cada procedimiento requiere valoración médica previa
    tipos: [
      {
        nombre: "Terapia con Células Madre",
        aplicaciones_generales: "Se investiga su uso en regeneración de tejidos, modulación del sistema inmune y reducción de inflamación crónica.",
        nota_importante: "La idoneidad de este tratamiento debe ser determinada por un médico especialista tras evaluación individual."
      },
      {
        nombre: "Terapia con Exosomas",
        aplicaciones_generales: "Los exosomas son vesículas extracelulares que facilitan la comunicación celular y pueden apoyar procesos regenerativos naturales.",
        nota_importante: "Su aplicación específica depende del diagnóstico médico. No todos los pacientes son candidatos."
      },
      {
        nombre: "Plasma Rico en Plaquetas (PRP)",
        aplicaciones_generales: "Se utiliza para estimular la reparación de tejidos mediante la concentración de factores de crecimiento del propio paciente.",
        nota_importante: "La efectividad varía según la condición del paciente y debe ser evaluada por un especialista."
      }
    ]
  },

  consulta_gratuita: {
    descripcion: "STEMWELL ofrece una primera consulta de valoración SIN COSTO para entender tu caso, resolver tus dudas y determinar si la medicina regenerativa es una opción adecuada para ti.",
    modalidades: [
      "Presencial: En nuestra clínica en Bogotá (Calle 127 #7-19, Consultorio 401)",
      "Virtual: Por videollamada desde cualquier lugar de Colombia o el mundo",
      "Telefónica: Llamada directa con uno de nuestros especialistas"
    ],
    que_incluye: [
      "Evaluación inicial de tu caso por un médico especialista",
      "Explicación detallada de las opciones de tratamiento (si aplican)",
      "Resolución de todas tus dudas sin compromiso",
      "Recomendaciones personalizadas basadas en tu historia clínica"
    ],
    como_agendar: "Puedes agendar tu consulta gratuita respondiendo a este mensaje con tu disponibilidad de horario, o llamándonos directamente al +57 310 406 8755. Te confirmaremos en menos de 24 horas."
  },

  politicas: {
    proteccion_datos: "STEMWELL cumple con la Ley 1581 de 2012 de Protección de Datos Personales. Toda la información de nuestros pacientes es tratada con estricta confidencialidad y solo se utiliza para los fines autorizados mediante consentimiento informado.",
    consentimiento: "Todo paciente debe firmar un consentimiento informado antes de cualquier procedimiento, donde se explican detalladamente los beneficios, riesgos y alternativas."
  },

  precios: {
    politica: "Los costos de nuestros tratamientos se discuten durante la consulta de valoración, ya que cada protocolo es personalizado y depende de las necesidades específicas del paciente. La consulta inicial de valoración es completamente GRATIS."
  },

  faq: [
    {
      pregunta: "¿Los tratamientos son seguros?",
      respuesta: "Todos nuestros procedimientos son realizados por médicos especialistas certificados, siguiendo estrictos protocolos de bioseguridad y estándares internacionales. Sin embargo, cada tratamiento debe ser evaluado individualmente para determinar su idoneidad y seguridad en tu caso particular. Agenda tu consulta gratuita para una evaluación personalizada."
    },
    {
      pregunta: "¿Tienen efectos secundarios?",
      respuesta: "Como todo procedimiento médico, pueden existir riesgos que deben ser discutidos con tu médico tratante. En tu consulta de valoración gratuita, el especialista te explicará detalladamente los posibles efectos según tu condición específica."
    },
    {
      pregunta: "¿Cuánto cuesta el tratamiento?",
      respuesta: "Los costos varían según el protocolo personalizado que se diseñe para ti. La primera consulta de valoración es completamente GRATIS y en ella recibirás información detallada sobre las opciones y costos específicos para tu caso."
    },
    {
      pregunta: "¿Aceptan seguros médicos?",
      respuesta: "Actualmente trabajamos con reembolso directo al paciente. Te entregamos toda la documentación necesaria para que puedas gestionar el reembolso con tu aseguradora. Podemos discutir esto a detalle en tu consulta gratuita."
    }
  ]
};

// ============================================================
// FUNCIÓN PARA OBTENER CONOCIMIENTO RELEVANTE
// ============================================================
function obtenerContexto(pregunta = '') {
  const preguntaLower = pregunta.toLowerCase();
  
  let contexto = `
INFORMACIÓN OFICIAL DE STEMWELL:

🏥 EMPRESA:
- ${CONOCIMIENTO.empresa.nombre_completo}
- Dirección: ${CONOCIMIENTO.empresa.direccion}
- Teléfono: ${CONOCIMIENTO.empresa.telefono}
- Email: ${CONOCIMIENTO.empresa.email}
- Horarios: ${CONOCIMIENTO.empresa.horarios}

🔬 ESPECIALIDAD:
${CONOCIMIENTO.especialidades.medicina_regenerativa.definicion}

💉 PROCEDIMIENTOS DISPONIBLES:
`;

  CONOCIMIENTO.procedimientos.tipos.forEach(p => {
    contexto += `- ${p.nombre}: ${p.aplicaciones_generales}\n`;
  });

  contexto += `
🆓 CONSULTA GRATUITA:
${CONOCIMIENTO.consulta_gratuita.descripcion}

Modalidades:
${CONOCIMIENTO.consulta_gratuita.modalidades.map(m => `- ${m}`).join('\n')}

Para agendar: ${CONOCIMIENTO.consulta_gratuita.como_agendar}

💰 PRECIOS:
${CONOCIMIENTO.precios.politica}

📋 POLÍTICAS:
${CONOCIMIENTO.politicas.proteccion_datos}

⚠️ REGLA PRINCIPAL: NUNCA afirmar que un tratamiento "funciona" o "cura" una condición específica. SIEMPRE derivar a consulta gratuita con un especialista para evaluación personalizada.
`;

  return contexto;
}

module.exports = {
  CONOCIMIENTO,
  obtenerContexto
};