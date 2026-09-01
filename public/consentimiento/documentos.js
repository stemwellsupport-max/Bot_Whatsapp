// ============================================================
// documentos.js — Contenido oficial de los documentos de admisión Stemwell
// Fuente: carpeta "admiciones" (ATP-FR-003..006, CMD-FR-001/010/011, PQR-FR-005/006,
// y los consentimientos informados 1-6 en español).
// Este archivo se usa tanto en el navegador (wizard de firma) como en Node
// (generación del PDF), por eso usa el patrón UMD de abajo.
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DOCUMENTOS_ADMISION = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Roles de firma posibles: paciente, representante (acudiente/testigo, opcional),
  // medico (médico tratante), anestesiologo, enfermero (profesional que realiza el procedimiento).

  var POLITICA_DATOS_TITULOS = [
    '¿Quién es el responsable del tratamiento de los datos?',
    '¿Qué información recopilamos y para qué la usamos?',
    'Tratamiento de datos sensibles y de salud',
    'Autorización para el tratamiento de datos',
    '¿Con quién podemos compartir la información?',
    'Derechos de los titulares',
    'Atención de consultas y reclamos',
    'Seguridad de la información',
    'Historia clínica',
    'Vigencia y modificaciones'
  ];

  var DOCUMENTOS = {

    // ── GENERALES (siempre se incluyen) ──────────────────────────────────
    bienvenida: {
      key: 'bienvenida',
      categoria: 'general',
      codigo: 'CMD-FR-001 V1',
      titulo: 'Carta de Bienvenida',
      firmantes: [],
      requiereAceptacion: false,
      textoAceptacion: null,
      cuerpo: [
        { tipo: 'p', texto: 'Le damos una cordial bienvenida a STEMWELL, la Clínica de Medicina Regenerativa. Es un verdadero honor tenerlo(a) como nuestro paciente. Reconociendo la importancia de su salud para nosotros, estamos comprometidos con contribuir a mejorar su bienestar integral.' },
        { tipo: 'p', texto: 'Su plan de tratamiento, basado en medicina regenerativa, se desarrolla en tres fases clave descritas en el protocolo GOSPA:' },
        { tipo: 'h', texto: '1) Fase de Preparación y Desintoxicación Celular' },
        { tipo: 'p', texto: 'En esta etapa inicial, adaptada a su edad y patología, empleamos una combinación de antioxidantes, oligoelementos, electrolitos y vitaminas que facilitan la limpieza celular, contrarrestando el estrés oxidativo y mejorando la calidad celular.' },
        { tipo: 'p', texto: 'Se consideran terapias avanzadas, como sesiones de ondas de choque de alta frecuencia, que actúan directamente sobre los tejidos afectados y se personalizan según sus síntomas, antes y/o después de la implantación de ortobiológicos. La terapia láser de alta frecuencia ayuda a activar las células madre y tiene efectos antiinflamatorios; también puede usarse radiofrecuencia, que mejora la calidad del colágeno.' },
        { tipo: 'h', texto: '2) Fase de Recolección, Procesamiento, Activación e Implantación de Ortobiológicos' },
        { tipo: 'p', texto: 'Los ortobiológicos, que incluyen células autólogas (propias del paciente) de origen hematopoyético o mesenquimal, y exosomas, son recolectados y procesados cuidadosamente.' },
        { tipo: 'p', texto: 'Según su patología, se pueden incorporar productos alogénicos de donantes, cumpliendo los estándares de calidad exigidos por el Ministerio de Salud y Protección Social en la Resolución 1160 de 2016. Esta fase se realiza bajo estrictas condiciones de asepsia y antisepsia, y bajo sedación en nuestros quirófanos especializados.' },
        { tipo: 'h', texto: '3) Fase de Adaptación' },
        { tipo: 'p', texto: 'Después de la implantación, mantener la viabilidad celular es fundamental. Las medidas adicionales incluyen factores antioxidantes para sostener el equilibrio ácido-base y terapias de rehabilitación adaptadas a sus necesidades.' },
        { tipo: 'p', texto: 'Tras la aplicación pueden ser necesarias evaluaciones periódicas, especialmente en patologías asociadas a dolor o lesiones intraarticulares, que pueden incluir factores de crecimiento y ortobiológicos adicionales según lo recomienden nuestros especialistas. Usted recibirá recomendaciones de cuidado individualizadas y orientación sobre la posible necesidad de rehabilitación física.' },
        { tipo: 'p', texto: 'Es fundamental tener en cuenta que los beneficios completos del tratamiento regenerativo suelen manifestarse algunos meses después de la aplicación. Por ello es indispensable seguir estrictamente las recomendaciones posteriores a la implantación. En caso de no observar una mejoría inmediata, mantenga la calma y continúe con el plan de tratamiento acordado.' },
        { tipo: 'p', texto: 'Aunque puede presentarse alguna molestia durante las primeras dos semanas, dependiendo de su patología, esto no debería impedir el proceso normal de recuperación. Es importante reconocer que puede haber variaciones en la efectividad del tratamiento entre pacientes.' },
        { tipo: 'p', texto: 'Agradecemos profundamente su confianza en STEMWELL. Su decisión de permitirnos ser parte de su proceso de sanación es muy valorada. Tenga la certeza de que recibirá el mejor cuidado de nuestro equipo.' },
        { tipo: 'p', texto: 'Cordialmente, Equipo Stemwell.' }
      ]
    },

    politica_datos: {
      key: 'politica_datos',
      categoria: 'general',
      codigo: null,
      titulo: 'Política de Tratamiento de Datos Personales',
      firmantes: ['paciente'],
      requiereAceptacion: true,
      textoAceptacion: 'He leído y acepto la <strong>Política de Tratamiento de Datos Personales</strong> de Stemwell, conforme a la Ley 1581 de 2012.',
      cuerpo: [
        { tipo: 'p', texto: 'En STEMWELL, entendemos que la información personal de nuestros pacientes, usuarios, trabajadores, proveedores y aliados debe ser tratada con responsabilidad, confidencialidad y respeto. Por esta razón, hemos adoptado la presente Política de Tratamiento de Datos Personales, mediante la cual informamos de manera clara cómo recolectamos, utilizamos, almacenamos, protegemos y, cuando sea necesario, compartimos la información personal suministrada en el desarrollo de nuestras actividades asistenciales, administrativas y operativas.' },
        { tipo: 'p', texto: 'Esta Política se desarrolla conforme a la Constitución Política de Colombia, la Ley 1581 de 2012, el Decreto 1377 de 2013, la Ley 23 de 1981, la Resolución 1995 de 1999 y demás normas aplicables relacionadas con la protección de datos personales, la confidencialidad de la información y la reserva de la historia clínica.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[0] },
        { tipo: 'p', texto: 'El responsable del tratamiento de los datos personales es STEMWELL, identificada con NIT 900.439.194-0, con domicilio en la Carrera 13 No. 118-08 de la ciudad de Bogotá D.C.' },
        { tipo: 'p', texto: 'Para cualquier consulta, actualización, solicitud o reclamo relacionado con el tratamiento de datos personales, los titulares podrán comunicarse a través de los siguientes canales: correo electrónico info@stemwell.co · teléfono +57 310 406 8755.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[1] },
        { tipo: 'p', texto: 'En STEMWELL recolectamos únicamente la información necesaria para prestar adecuadamente nuestros servicios y cumplir nuestras obligaciones legales y contractuales.' },
        { tipo: 'p', texto: 'En el caso de pacientes y usuarios, los datos personales se utilizan para la prestación de servicios de salud, realización de valoraciones médicas, exámenes médicos, diagnósticos, tratamientos, procedimientos, seguimientos clínicos y procesos de rehabilitación. Asimismo, la información permite elaborar, actualizar y custodiar la historia clínica y demás registros asistenciales requeridos por la normatividad vigente.' },
        { tipo: 'p', texto: 'También utilizamos la información para gestionar citas médicas, autorizaciones, remisiones, incapacidades, certificados, facturación, procesos administrativos y reportes obligatorios ante entidades del Sistema General de Seguridad Social en Salud, autoridades regulatorias y organismos de control.' },
        { tipo: 'p', texto: 'Adicionalmente, los datos podrán ser utilizados para atender peticiones, quejas, reclamos, auditorías internas y externas, procesos de calidad y demás actividades necesarias para garantizar una adecuada prestación de los servicios de salud.' },
        { tipo: 'p', texto: 'Respecto de trabajadores, proveedores y contratistas, la información personal podrá ser utilizada para procesos de selección, contratación, afiliaciones al sistema de seguridad social, control de acceso, cumplimiento de obligaciones laborales, administrativas, financieras y contractuales.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[2] },
        { tipo: 'p', texto: 'Algunos de los datos que STEMWELL trata corresponden a datos sensibles, especialmente aquellos relacionados con la salud. Este tipo de información será manejada bajo estrictos estándares de confidencialidad, seguridad y acceso restringido.' },
        { tipo: 'p', texto: 'El titular no está obligado a autorizar el tratamiento de datos sensibles; sin embargo, en materia asistencial, cierta información resulta indispensable para garantizar una adecuada atención médica y la continuidad del tratamiento. En caso de no suministrarse información esencial, podrían existir limitaciones para la prestación del servicio de salud.' },
        { tipo: 'p', texto: 'La información clínica y la historia clínica solo serán utilizadas para fines asistenciales, administrativos y legales autorizados por la normatividad vigente.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[3] },
        { tipo: 'p', texto: 'La autorización para el tratamiento de datos personales podrá obtenerse mediante formularios físicos o electrónicos, formatos de admisión, consentimientos informados, contratos, grabaciones de llamadas o cualquier conducta inequívoca que permita concluir que el titular otorgó su consentimiento.' },
        { tipo: 'p', texto: 'El titular podrá solicitar la revocatoria de la autorización o la supresión de sus datos cuando sea procedente legalmente. No obstante, la información que deba conservarse por disposición legal, como la historia clínica, continuará siendo almacenada durante el término exigido por la normatividad aplicable.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[4] },
        { tipo: 'p', texto: 'Para garantizar la adecuada prestación de los servicios de salud y cumplir obligaciones legales, STEMWELL podrá compartir información personal con EPS, IPS aliadas, aseguradoras, laboratorios clínicos, entidades regulatorias, autoridades administrativas o judiciales, así como proveedores tecnológicos y plataformas utilizadas para la operación de los servicios.' },
        { tipo: 'p', texto: 'En todos los casos, la Compañía exigirá que terceros implementen medidas adecuadas de seguridad y confidencialidad para proteger la información personal.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[5] },
        { tipo: 'lista', items: [
          'Conocer, actualizar y rectificar su información personal.',
          'Solicitar prueba de la autorización otorgada.',
          'Ser informada sobre el uso dado a sus datos.',
          'Presentar consultas, solicitudes o reclamos.',
          'Solicitar la supresión de sus datos cuando sea legalmente procedente.',
          'Presentar quejas ante la Superintendencia de Industria y Comercio.',
          'Acceder gratuitamente a sus datos personales.'
        ] },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[6] },
        { tipo: 'p', texto: 'Las consultas o reclamos relacionados con protección de datos personales podrán presentarse a través del correo electrónico info@stemwell.co. Las consultas serán atendidas dentro de los diez (10) días hábiles siguientes a su recepción. Los reclamos serán respondidos dentro de los quince (15) días hábiles, conforme a los términos establecidos en la legislación colombiana.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[7] },
        { tipo: 'p', texto: 'STEMWELL adopta medidas administrativas, técnicas y tecnológicas orientadas a proteger la información personal contra pérdida, alteración, acceso no autorizado, uso indebido o cualquier tratamiento fraudulento. Entre estas medidas se incluyen controles de acceso físico y digital, protocolos de confidencialidad, acceso restringido a historias clínicas, almacenamiento seguro de información y mecanismos de respaldo y protección de datos.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[8] },
        { tipo: 'p', texto: 'La historia clínica es un documento privado, obligatorio y sometido a reserva legal, conforme a la Ley 23 de 1981 y la Resolución 1995 de 1999. Únicamente podrán acceder a ella el paciente, las personas autorizadas por este, el personal asistencial involucrado directamente en su atención y las autoridades legalmente facultadas. STEMWELL conservará las historias clínicas durante el término exigido por la normatividad vigente.' },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[9] },
        { tipo: 'p', texto: 'La presente Política rige a partir de su publicación y permanecerá vigente mientras STEMWELL realice tratamiento de datos personales. La Compañía podrá actualizar o modificar esta Política en cualquier momento. Cualquier cambio será informado a través de los canales oficiales de STEMWELL.' }
      ]
    },

    descargo_responsabilidad: {
      key: 'descargo_responsabilidad',
      categoria: 'general',
      codigo: 'PQR-FR-006 V1',
      titulo: 'Descargo de Responsabilidad',
      firmantes: ['paciente', 'representante'],
      requiereAceptacion: true,
      textoAceptacion: 'He leído y acepto el <strong>Descargo de Responsabilidad</strong> descrito anteriormente.',
      usaMedicoEnTexto: true,
      cuerpo: [
        { tipo: 'p', texto: 'Manifiesto que, de manera libre, voluntaria y en pleno uso de mis facultades mentales, actuando en nombre propio o como representante legal del paciente, declaro lo siguiente:' },
        { tipo: 'lista', items: [
          'Que he sido informado(a) de que el(la) médico(a) tratante será el(la) Dr.(a) {{medico}}, quien será el único responsable del(los) procedimiento(s) médico(s) o quirúrgico(s) a realizar, los cuales he autorizado previamente.',
          'Que el(la) médico(a) tratante me ha explicado de forma clara y suficiente en qué consiste el(los) procedimiento(s), así como los objetivos del mismo y su alcance.',
          'Que he sido informado(a) de los riesgos generales y específicos inherentes al(los) procedimiento(s), así como de las posibles complicaciones y el porcentaje estimado de éxito, entendiéndose que tales riesgos son propios del ejercicio médico quirúrgico. En consecuencia, comprendo que la IPS no es responsable de los resultados derivados de la práctica médica, siempre que no medie dolo o negligencia por parte de sus profesionales.',
          'Que tengo conocimiento de que la IPS STEMWELL presta exclusivamente servicios de quirófano, enfermería e instrumentación quirúrgica, y que cuenta con la debida habilitación otorgada por la Secretaría de Salud bajo el código No. 110012957901.',
          'Que comprendo que es responsabilidad del médico tratante gestionar y diligenciar cualquier trámite relacionado con pólizas de seguro o cobertura por complicaciones quirúrgicas, si estas fueran requeridas en el postoperatorio. Reconozco que esta gestión no corresponde a la IPS STEMWELL.'
        ] },
        { tipo: 'p', texto: 'En constancia de lo anterior, firmo el presente documento en la ciudad de Bogotá D.C.' }
      ]
    },

    uso_imagen: {
      key: 'uso_imagen',
      categoria: 'general',
      codigo: 'CMD-FR-010 V1',
      titulo: 'Consentimiento Informado para Uso de Material Audiovisual',
      firmantes: ['paciente', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: 'He leído y otorgo el <strong>Consentimiento para Uso de Material Audiovisual</strong> descrito anteriormente.',
      cuerpo: [
        { tipo: 'p', texto: 'Por medio del presente documento otorgo autorización expresa, previa, informada y voluntaria para el uso de mis derechos de imagen a la IPS STEMWELL, conforme a la Constitución Política de Colombia, la Ley 1581 de 2012 y demás normas concordantes. La autorización se regirá por las siguientes cláusulas:' },
        { tipo: 'h', texto: 'PRIMERA. Autorización y objeto' },
        { tipo: 'p', texto: 'Autorizo a la IPS STEMWELL para que utilice mi imagen en fotografías, procedimientos análogos a la fotografía, producciones audiovisuales (videos), y en general en cualquier medio de expresión relacionado con el derecho a la imagen, exclusivamente para fines institucionales, académicos, científicos, de divulgación y promocionales, sin que ello implique explotación comercial distinta a la aquí prevista.' },
        { tipo: 'h', texto: 'SEGUNDA. Alcance de la autorización' },
        { tipo: 'p', texto: 'La autorización comprende la utilización de mi imagen en ediciones impresas, medios electrónicos, ópticos, magnéticos, redes (intranet e internet), mensajes de datos o similares, y en cualquier medio o soporte conocido o que se desarrolle en el futuro, directamente o a través de terceros designados por la IPS STEMWELL.' },
        { tipo: 'h', texto: 'TERCERA. Territorio y exclusividad' },
        { tipo: 'p', texto: 'Los derechos aquí autorizados se conceden sin limitación geográfica o territorial alguna. Esta autorización no es exclusiva, por lo que el titular se reserva el derecho de otorgar autorizaciones similares a terceros.' },
        { tipo: 'h', texto: 'CUARTA. Derechos morales' },
        { tipo: 'p', texto: 'STEMWELL respetará en todo momento la normatividad vigente sobre los derechos morales de autor, que permanecerán radicados en cabeza de su titular.' },
        { tipo: 'h', texto: 'QUINTA. Duración y derecho a retracto' },
        { tipo: 'p', texto: 'La autorización se otorga por tiempo indefinido, hasta tanto sea revocada por el titular. En cualquier momento, el titular podrá revocar la autorización, sin costo alguno, mediante comunicación enviada al correo electrónico info@stemwell.co, conforme a la política de tratamiento de datos personales de la IPS STEMWELL.' },
        { tipo: 'h', texto: 'SEXTA. Voluntariedad y datos sensibles' },
        { tipo: 'p', texto: 'Declaro que la presente autorización es otorgada de manera libre y voluntaria. Reconozco que la imagen constituye un dato sensible y que no estoy obligado(a) a autorizar su tratamiento. Mi negativa a otorgar esta autorización no afectará la calidad, acceso o continuidad de los servicios de salud que me presta la IPS STEMWELL.' },
        { tipo: 'h', texto: 'SÉPTIMA. Menores de edad' },
        { tipo: 'p', texto: 'En caso de que la autorización se otorgue respecto de un menor de edad, manifiesto actuar en calidad de representante legal y que el menor, en la medida de lo posible, ha sido informado sobre el uso de su imagen.' },
        { tipo: 'h', texto: 'OCTAVA. Limitación de responsabilidad' },
        { tipo: 'p', texto: 'La IPS STEMWELL adoptará las medidas razonables para proteger el uso autorizado de las imágenes, pero no será responsable por usos indebidos que realicen terceros no autorizados.' }
      ]
    },

    // ── ESPECÍFICOS DE PROCEDIMIENTO (selección del staff) ────────────────
    fisioterapia: {
      key: 'fisioterapia',
      categoria: 'procedimiento',
      codigo: 'ATP-FR-003 V1',
      titulo: 'Consentimiento Informado — Fisioterapia y Terapia Avanzada',
      etiquetaSeleccion: 'Fisioterapia / Terapia avanzada',
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: 'Autorizo de manera libre, voluntaria e informada la realización de las intervenciones de <strong>terapia física</strong> descritas anteriormente.',
      cuerpo: [
        { tipo: 'p', texto: 'Autorizo de manera libre, voluntaria e informada a la clínica Stemwell para la realización de las intervenciones de terapia física indicadas, habiendo recibido información clara, suficiente y comprensible sobre el procedimiento, sus beneficios, posibles riesgos, alternativas terapéuticas y consecuencias de no realizarlo.' },
        { tipo: 'p', texto: 'La terapia física es una disciplina clínico asistencial de la rehabilitación funcional que integra conocimientos de biomecánica, fisiología, neurociencia y control motor para la evaluación, diagnóstico fisioterapéutico e intervención terapéutica de las alteraciones del movimiento corporal humano.' },
        { tipo: 'p', texto: 'Se me ha informado también que la atención en este servicio es integral y puede requerir, según mi condición clínica, procedimientos de diferente naturaleza como: termoterapia, ultrasonido, electroterapia, ondas de choque, radiofrecuencia, magnetoterapia, láser, presoterapia, movilizaciones articulares pasivas y activas, estiramientos, ejercicios isométricos e isotónicos, balón-terapia, técnicas de facilitación neuropropioceptiva (TFNP), reeducación vestibular, reeducación del patrón respiratorio, reeducación postural y plan casero, entre otros.' },
        { tipo: 'h', texto: 'Beneficios' },
        { tipo: 'lista', items: ['Disminución del dolor y la inflamación', 'Aumento de la fuerza muscular y resistencia', 'Mejora de la calidad de vida'] },
        { tipo: 'h', texto: 'Riesgos y efectos secundarios posibles' },
        { tipo: 'lista', items: ['Dolor leve o moderado posterior a la sesión', 'Fatiga muscular', 'Inflamación transitoria', 'Espasmos musculares'] },
        { tipo: 'h', texto: 'Contraindicaciones' },
        { tipo: 'lista', items: ['Procesos infecciosos agudos', 'Fracturas sin estabilización', 'Lesiones cutáneas'] },
        { tipo: 'h', texto: 'Alternativas' },
        { tipo: 'lista', items: ['Tratamiento farmacológico (analgésicos / AINES)', 'Cirugía'] }
      ]
    },

    ortobiologicos: {
      key: 'ortobiologicos',
      categoria: 'procedimiento',
      codigo: 'ATP-FR-004 V1',
      titulo: 'Consentimiento Informado — Aplicación de Ortobiológicos',
      etiquetaSeleccion: 'Aplicación de Ortobiológicos',
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: 'Autorizo la realización del procedimiento de <strong>aplicación de ortobiológicos</strong> descrito anteriormente.',
      cuerpo: [
        { tipo: 'p', texto: 'De manera voluntaria y con pleno entendimiento, autorizo la realización del procedimiento consistente en la aplicación de ortobiológicos procesados, los cuales serán administrados por la vía intravenosa y/o en las zonas anatómicas previamente acordadas durante la consulta médica. Reconozco que he formulado todas las preguntas que consideré necesarias y que las mismas han sido resueltas de forma clara y satisfactoria por el equipo médico.' },
        { tipo: 'h', texto: 'Beneficios' },
        { tipo: 'lista', items: ['Posible mejoría del dolor', 'Recuperación funcional', 'Mejora de la circulación', 'Reducción de inflamación'] },
        { tipo: 'h', texto: 'Riesgos y efectos secundarios posibles' },
        { tipo: 'lista', items: ['Dependientes de la técnica, concentración y del paciente', 'Reacción inflamatoria transitoria (frecuente en PRP)'] },
        { tipo: 'h', texto: 'Contraindicaciones' },
        { tipo: 'lista', items: ['Infección activa en el sitio de aplicación', 'Trastornos de coagulación severos'] },
        { tipo: 'h', texto: 'Alternativas' },
        { tipo: 'lista', items: ['Fisioterapia (ejercicios de carga progresiva)', 'Analgésicos / AINES', 'Modificar la actividad física'] },
        { tipo: 'p', texto: 'Al firmar este documento reconozco que he leído y comprendido la información, que he tenido la oportunidad de preguntar al respecto y he aclarado mis inquietudes. Acepto que la medicina no es una ciencia exacta y que el resultado del procedimiento puede variar de un individuo a otro; entiendo que los tratamientos en salud no permiten garantías ni seguridad de éxito en los resultados. Doy mi consentimiento para la realización de la consulta y/o procedimientos mencionados.' }
      ]
    },

    oxigenacion_hiperbarica: {
      key: 'oxigenacion_hiperbarica',
      categoria: 'procedimiento',
      codigo: 'ATP-FR-006 V1',
      titulo: 'Consentimiento Informado — Oxigenación Hiperbárica',
      etiquetaSeleccion: 'Oxigenación Hiperbárica',
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: 'Autorizo la realización del <strong>tratamiento de oxigenación hiperbárica</strong> descrito anteriormente.',
      cuerpo: [
        { tipo: 'checklist', clave: 'contraindicaciones_hiperbarica', codigo: 'ATP-FR-005 V1', titulo: 'Cuestionario de contraindicaciones — cámara hiperbárica', subtitulo: 'Por favor marque Sí o No para cada condición.', grupos: [
          { titulo: 'Contraindicaciones absolutas', items: [
            'Uso de medicamentos citostáticos (Adriamicina / Bleomicina / Cisplatino)',
            'Neumotórax no tratado',
            'Implantes cocleares',
            'Claustrofobia',
            'Glaucoma',
            'Hígado graso severo'
          ] },
          { titulo: 'Contraindicaciones relativas', items: [
            'Infecciones respiratorias agudas (gripe y/o neumonía)',
            'Hipertensión no controlada',
            'Epilepsia no tratada',
            'Fiebre actual (temperatura mayor a 37.5°C)',
            'Dolor de oído o de senos paranasales',
            'Ansiedad por confinamiento',
            'Cirugías dentales recientes',
            'Trauma de membrana timpánica en el último mes y/o dolor crónico de oído',
            'Uso de lentes de contacto',
            'Infección cutánea y/o abscesos'
          ] }
        ] },
        { tipo: 'p', texto: 'Autorizo al equipo de la IPS STEMWELL para realizar el tratamiento con oxigenación hiperbárica, que consiste en brindar al interior de una cámara, oxígeno al 100% a presiones más elevadas que la atmosférica.' },
        { tipo: 'p', texto: 'El profesional me ha explicado de forma suficiente y adecuada en qué consiste el tratamiento, sus beneficios, las complicaciones o molestias que podría sufrir, así como algunos consejos para evitar estas molestias, y me ha aclarado las dudas que tenía en forma satisfactoria. Declaro que no he dado información engañosa para que se me realice este tratamiento y que he decidido someterme a este procedimiento de forma voluntaria.' },
        { tipo: 'h', texto: 'Beneficios' },
        { tipo: 'lista', items: ['Aceleración en la recuperación de tejidos', 'Disminución del dolor y la inflamación', 'Mejora de la circulación', 'Apoyo en el tratamiento de heridas crónicas'] },
        { tipo: 'h', texto: 'Riesgos y efectos secundarios posibles' },
        { tipo: 'lista', items: ['Sensación de presión en oídos o senos paranasales (barotrauma)', 'Dolor o molestia en los oídos', 'Mareo o fatiga', 'Claustrofobia'] },
        { tipo: 'h', texto: 'Contraindicaciones' },
        { tipo: 'lista', items: ['Neumotórax no tratado', 'Algunas enfermedades pulmonares severas no controladas'] },
        { tipo: 'h', texto: 'Alternativas' },
        { tipo: 'lista', items: ['Tratamiento médico convencional', 'Manejo farmacológico', 'Terapias complementarias', 'No realizar el tratamiento'] }
      ]
    },

    anestesia: {
      key: 'anestesia',
      categoria: 'procedimiento',
      codigo: 'PQR-FR-005 V1',
      titulo: 'Consentimiento Informado — Anestesia',
      etiquetaSeleccion: 'Anestesia',
      firmantes: ['paciente', 'representante', 'medico', 'anestesiologo'],
      requiereAceptacion: true,
      textoAceptacion: 'Autorizo a los anestesiólogos que actúan en nombre propio y de IPS STEMWELL para que se me administre la <strong>anestesia</strong> requerida.',
      cuerpo: [
        { tipo: 'p', texto: 'Se me ha explicado que la anestesia es un procedimiento médico que permite realizar intervenciones quirúrgicas o diagnósticas sin dolor, mediante la administración de medicamentos que producen pérdida de la sensibilidad, del dolor y/o de la conciencia.' },
        { tipo: 'p', texto: 'Luego de haber sido atendido e interrogado sobre mis antecedentes, y de haber examinado y evaluado los estudios prequirúrgicos solicitados, se determinó mi condición clínica para afrontar el procedimiento anestésico. Entiendo que el anestesiólogo empleará todos los medios a su alcance buscando mi seguridad durante el acto anestésico. Sin embargo, soy consciente de que no existen garantías absolutas con la anestesia seleccionada.' },
        { tipo: 'p', texto: 'Autorizo a los anestesiólogos que actúen en nombre propio y de IPS STEMWELL para que se me administre la anestesia requerida para la práctica de mi intervención o procedimiento.' },
        { tipo: 'seleccion', clave: 'tipo_anestesia', etiqueta: 'Tipo de anestesia', opciones: ['General', 'Raquídea', 'Bloqueo periférico', 'Sedación'] },
        { tipo: 'h', texto: 'Beneficios' },
        { tipo: 'lista', items: ['Ausencia de dolor durante el procedimiento', 'Mayor seguridad y control médico', 'Facilita la realización del acto quirúrgico o diagnóstico'] },
        { tipo: 'h', texto: 'Riesgos y efectos secundarios posibles' },
        { tipo: 'lista', items: ['Náuseas y vómito', 'Dolor de cabeza', 'Dolor en el sitio de punción'] },
        { tipo: 'h', texto: 'Contraindicaciones' },
        { tipo: 'lista', items: ['Alergias a medicamentos anestésicos', 'Enfermedades cardiovasculares o respiratorias no controladas', 'Trastornos de coagulación (para anestesia regional)', 'Infección en el sitio de punción', 'Ayuno inadecuado'] },
        { tipo: 'h', texto: 'Alternativas' },
        { tipo: 'lista', items: ['Diferentes técnicas anestésicas según el caso', 'Procedimientos con anestesia local o sedación', 'No realizar el procedimiento (según indicación médica)'] },
        { tipo: 'p', texto: 'Certifico que se me han aclarado mis temores, respondido mis preguntas en forma precisa y en lenguaje sencillo, y he comprendido satisfactoriamente la naturaleza y propósitos de la técnica anestésica, los riesgos, las complicaciones médicas y la necesidad de reservar sangre y/o traslado a cuidados intensivos si fuera necesario. Tengo claro que en cualquier momento puedo formular preguntas sobre el procedimiento anestésico. También me han informado de mi derecho a rechazar el tratamiento o revocar el consentimiento.' }
      ]
    },

    telemedicina: {
      key: 'telemedicina',
      categoria: 'procedimiento',
      codigo: null,
      titulo: 'Consentimiento Informado — Atención por Telemedicina',
      etiquetaSeleccion: 'Telemedicina',
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: 'Acepto plenamente el contenido de este documento y me comprometo a cumplir los lineamientos de la <strong>atención por telemedicina</strong>.',
      cuerpo: [
        { tipo: 'p', texto: 'Se me ha informado que la atención en salud se realizará mediante telemedicina, utilizando tecnologías de la información y la comunicación (TIC), sin la presencia física simultánea entre el profesional de salud y el paciente.' },
        { tipo: 'p', texto: 'De conformidad con la Resolución 2654 de 2019, la telemedicina implica la provisión de servicios de salud a distancia por profesionales de la salud que utilizan tecnologías de la información y la comunicación, con el propósito de facilitar y mejorar el acceso a servicios de salud en cualquiera de sus fases: promoción, prevención, diagnóstico, tratamiento, rehabilitación y paliación.' },
        { tipo: 'p', texto: 'Al firmar este consentimiento informado, atestiguo que: (1) he leído personalmente este documento, lo entiendo y acepto plenamente su contenido; (2) han respondido a satisfacción mis preguntas, y me han explicado los riesgos, beneficios y alternativas de la atención por telemedicina en un lenguaje que entiendo; y (3) me comprometo con el profesional de la salud de la IPS STEMWELL a cumplir con los lineamientos de la atención por telemedicina aquí estipulados.' },
        { tipo: 'h', texto: 'Beneficios' },
        { tipo: 'lista', items: ['Acceso a servicios de salud desde cualquier ubicación', 'Reducción de tiempos de desplazamiento', 'Mayor oportunidad en la atención', 'Continuidad del tratamiento'] },
        { tipo: 'h', texto: 'Riesgos y efectos secundarios posibles' },
        { tipo: 'lista', items: ['Fallas tecnológicas o de conectividad', 'Limitaciones en el examen físico', 'Riesgo de interrupciones durante la consulta', 'Posibles dificultades en la calidad de audio o video'] },
        { tipo: 'h', texto: 'Contraindicaciones' },
        { tipo: 'lista', items: ['Situaciones de urgencia o emergencia que requieren atención presencial inmediata', 'Casos donde se requiera un examen físico detallado no sustituible', 'Dificultades tecnológicas que impidan una adecuada comunicación'] },
        { tipo: 'h', texto: 'Alternativas' },
        { tipo: 'lista', items: ['Atención presencial', 'Consulta con otro profesional', 'No realizar la consulta'] }
      ]
    },

    venopuncion: {
      key: 'venopuncion',
      categoria: 'procedimiento',
      codigo: null,
      titulo: 'Consentimiento Informado — Venopunción',
      etiquetaSeleccion: 'Venopunción',
      firmantes: ['paciente', 'representante', 'enfermero'],
      requiereAceptacion: true,
      textoAceptacion: 'Autorizo al personal de enfermería de la Clínica STEMWELL a realizar el procedimiento de <strong>venopunción</strong> descrito anteriormente.',
      cuerpo: [
        { tipo: 'p', texto: 'Declaro de manera libre, voluntaria y en pleno uso de mis facultades mentales, que autorizo al personal de enfermería de la Clínica STEMWELL para realizar los procedimientos descritos a continuación, conforme a las indicaciones del médico tratante.' },
        { tipo: 'p', texto: 'Punción: es entendida como el procedimiento mediante el cual se introduce una aguja o catéter por diferentes vías de administración —venosa, arterial, intramuscular, intradérmica, subcutánea o capilar— con el fin de obtener muestras de sangre o administrar medicamentos o sustancias.' },
        { tipo: 'h', texto: 'Beneficios' },
        { tipo: 'lista', items: ['Permite diagnóstico oportuno', 'Facilita el tratamiento médico', 'Procedimiento rápido y de bajo riesgo'] },
        { tipo: 'h', texto: 'Riesgos y efectos secundarios posibles' },
        { tipo: 'lista', items: ['Dolor o molestia en el sitio de punción', 'Hematomas', 'Sangrado leve', 'Infección (poco frecuente)', 'Mareo o desmayo', 'Dificultad para canalizar la vena (requiere varios intentos)', 'Flebitis (inflamación de la vena)'] },
        { tipo: 'h', texto: 'Contraindicaciones' },
        { tipo: 'lista', items: ['Trastornos de la coagulación', 'Uso de anticoagulantes', 'Infección o lesión en el sitio de punción', 'Accesos venosos difíciles', 'Historia de síncope vasovagal'] },
        { tipo: 'h', texto: 'Alternativas' },
        { tipo: 'lista', items: ['Uso de otro sitio de punción', 'Métodos diagnósticos alternativos (según indicación médica)', 'No realizar el procedimiento'] }
      ]
    }
  };

  // Orden fijo de los documentos generales (siempre incluidos).
  var ORDEN_GENERAL = ['bienvenida', 'politica_datos', 'descargo_responsabilidad', 'uso_imagen'];

  // Orden fijo de los documentos de procedimiento (se filtran según selección del staff).
  var ORDEN_PROCEDIMIENTOS = ['fisioterapia', 'ortobiologicos', 'oxigenacion_hiperbarica', 'anestesia', 'telemedicina', 'venopuncion'];

  // Roles y sus etiquetas / metadatos para la UI.
  var ROLES = {
    paciente:      { etiqueta: 'Firma del Paciente' },
    representante: { etiqueta: 'Firma del Acudiente / Representante / Testigo' },
    medico:        { etiqueta: 'Firma del Médico Tratante' },
    anestesiologo: { etiqueta: 'Firma del Médico Anestesiólogo' },
    enfermero:     { etiqueta: 'Firma del Profesional de Enfermería' }
  };

  return {
    DOCUMENTOS: DOCUMENTOS,
    ORDEN_GENERAL: ORDEN_GENERAL,
    ORDEN_PROCEDIMIENTOS: ORDEN_PROCEDIMIENTOS,
    ROLES: ROLES
  };
}));
