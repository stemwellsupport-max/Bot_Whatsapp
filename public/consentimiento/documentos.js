// ============================================================
// documentos.js — Contenido oficial de los documentos de admisión Stemwell
// Fuente: carpeta "admiciones" (ATP-FR-003..006, CMD-FR-001/010/011, PQR-FR-005/006,
// y los consentimientos informados 1-6, en español e inglés).
// Bilingüe: cada texto es { es: '...', en: '...' }. Este archivo se usa
// tanto en el navegador (wizard de firma) como en Node (generación del
// PDF), por eso usa el patrón UMD de abajo.
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
    { es: '¿Quién es el responsable del tratamiento de los datos?', en: 'Who is responsible for processing the data?' },
    { es: '¿Qué información recopilamos y para qué la usamos?', en: 'What information do we collect and what do we use it for?' },
    { es: 'Tratamiento de datos sensibles y de salud', en: 'Processing of sensitive and health data' },
    { es: 'Autorización para el tratamiento de datos', en: 'Authorization for data processing' },
    { es: '¿Con quién podemos compartir la información?', en: 'Who may we share the information with?' },
    { es: 'Derechos de los titulares', en: "Data subjects' rights" },
    { es: 'Atención de consultas y reclamos', en: 'Handling inquiries and complaints' },
    { es: 'Seguridad de la información', en: 'Information security' },
    { es: 'Historia clínica', en: 'Medical records' },
    { es: 'Vigencia y modificaciones', en: 'Validity and changes' }
  ];

  var DOCUMENTOS = {

    // ── GENERALES (siempre se incluyen) ──────────────────────────────────
    bienvenida: {
      key: 'bienvenida',
      categoria: 'general',
      codigo: 'CMD-FR-001 V1',
      titulo: { es: 'Carta de Bienvenida', en: 'Welcome Letter' },
      firmantes: [],
      requiereAceptacion: false,
      textoAceptacion: null,
      cuerpo: [
        { tipo: 'p', texto: { es: 'Le damos una cordial bienvenida a STEMWELL, la Clínica de Medicina Regenerativa. Es un verdadero honor tenerlo(a) como nuestro paciente. Reconociendo la importancia de su salud para nosotros, estamos comprometidos con contribuir a mejorar su bienestar integral.', en: 'Welcome to STEMWELL, the Regenerative Medicine Clinic. It is truly an honor to have you as our patient. Recognizing the importance of your health to us, we are committed to helping improve your overall well-being.' } },
        { tipo: 'p', texto: { es: 'Su plan de tratamiento, basado en medicina regenerativa, se desarrolla en tres fases clave descritas en el protocolo GOSPA:', en: 'Your treatment plan, based on regenerative medicine, unfolds across three key phases described in the GOSPA protocol:' } },
        { tipo: 'h', texto: { es: '1) Fase de Preparación y Desintoxicación Celular', en: '1) Preparation and Cellular Detoxification Phase' } },
        { tipo: 'p', texto: { es: 'En esta etapa inicial, adaptada a su edad y patología, empleamos una combinación de antioxidantes, oligoelementos, electrolitos y vitaminas que facilitan la limpieza celular, contrarrestando el estrés oxidativo y mejorando la calidad celular.', en: 'In this initial stage, tailored to your age and condition, we use a combination of antioxidants, trace elements, electrolytes, and vitamins that facilitate cellular cleansing, counteracting oxidative stress and improving cellular quality.' } },
        { tipo: 'p', texto: { es: 'Se consideran terapias avanzadas, como sesiones de ondas de choque de alta frecuencia, que actúan directamente sobre los tejidos afectados y se personalizan según sus síntomas, antes y/o después de la implantación de ortobiológicos. La terapia láser de alta frecuencia ayuda a activar las células madre y tiene efectos antiinflamatorios; también puede usarse radiofrecuencia, que mejora la calidad del colágeno.', en: 'Advanced therapies are considered, such as high-frequency shockwave sessions, which act directly on the affected tissues and are personalized to your symptoms, before and/or after the implantation of orthobiologics. High-frequency laser therapy helps activate stem cells and has anti-inflammatory effects; radiofrequency may also be used, which improves collagen quality.' } },
        { tipo: 'h', texto: { es: '2) Fase de Recolección, Procesamiento, Activación e Implantación de Ortobiológicos', en: '2) Collection, Processing, Activation, and Implantation of Orthobiologics' } },
        { tipo: 'p', texto: { es: 'Los ortobiológicos, que incluyen células autólogas (propias del paciente) de origen hematopoyético o mesenquimal, y exosomas, son recolectados y procesados cuidadosamente.', en: "Orthobiologics, which include autologous cells (the patient's own) of hematopoietic or mesenchymal origin, and exosomes, are carefully collected and processed." } },
        { tipo: 'p', texto: { es: 'Según su patología, se pueden incorporar productos alogénicos de donantes, cumpliendo los estándares de calidad exigidos por el Ministerio de Salud y Protección Social en la Resolución 1160 de 2016. Esta fase se realiza bajo estrictas condiciones de asepsia y antisepsia, y bajo sedación en nuestros quirófanos especializados.', en: 'Depending on your condition, allogeneic products from donors may be incorporated, meeting the quality standards required by the Ministry of Health and Social Protection under Resolution 1160 of 2016. This phase is carried out under strict aseptic and antiseptic conditions, and under sedation in our specialized operating rooms.' } },
        { tipo: 'h', texto: { es: '3) Fase de Adaptación', en: '3) Adaptation Phase' } },
        { tipo: 'p', texto: { es: 'Después de la implantación, mantener la viabilidad celular es fundamental. Las medidas adicionales incluyen factores antioxidantes para sostener el equilibrio ácido-base y terapias de rehabilitación adaptadas a sus necesidades.', en: 'After implantation, maintaining cell viability is essential. Additional measures include antioxidant factors to sustain acid-base balance and rehabilitation therapies tailored to your needs.' } },
        { tipo: 'p', texto: { es: 'Tras la aplicación pueden ser necesarias evaluaciones periódicas, especialmente en patologías asociadas a dolor o lesiones intraarticulares, que pueden incluir factores de crecimiento y ortobiológicos adicionales según lo recomienden nuestros especialistas. Usted recibirá recomendaciones de cuidado individualizadas y orientación sobre la posible necesidad de rehabilitación física.', en: 'Following the application, periodic evaluations may be necessary, especially for conditions associated with pain or intra-articular injuries, which may include additional growth factors and orthobiologics as recommended by our specialists. You will receive individualized care recommendations and guidance on the potential need for physical rehabilitation.' } },
        { tipo: 'p', texto: { es: 'Es fundamental tener en cuenta que los beneficios completos del tratamiento regenerativo suelen manifestarse algunos meses después de la aplicación. Por ello es indispensable seguir estrictamente las recomendaciones posteriores a la implantación. En caso de no observar una mejoría inmediata, mantenga la calma y continúe con el plan de tratamiento acordado.', en: 'It is important to keep in mind that the full benefits of regenerative treatment typically appear a few months after application. It is therefore essential to strictly follow the post-implantation recommendations. If you do not notice immediate improvement, remain calm and continue with the agreed treatment plan.' } },
        { tipo: 'p', texto: { es: 'Aunque puede presentarse alguna molestia durante las primeras dos semanas, dependiendo de su patología, esto no debería impedir el proceso normal de recuperación. Es importante reconocer que puede haber variaciones en la efectividad del tratamiento entre pacientes.', en: 'Although some discomfort may occur during the first two weeks, depending on your condition, this should not hinder the normal recovery process. It is important to recognize that treatment effectiveness may vary between patients.' } },
        { tipo: 'p', texto: { es: 'Agradecemos profundamente su confianza en STEMWELL. Su decisión de permitirnos ser parte de su proceso de sanación es muy valorada. Tenga la certeza de que recibirá el mejor cuidado de nuestro equipo.', en: 'We deeply appreciate your trust in STEMWELL. Your decision to let us be part of your healing process is highly valued. Rest assured you will receive the best care from our team.' } },
        { tipo: 'p', texto: { es: 'Cordialmente, Equipo Stemwell.', en: 'Warm regards, the Stemwell Team.' } }
      ]
    },

    politica_datos: {
      key: 'politica_datos',
      categoria: 'general',
      codigo: null,
      titulo: { es: 'Política de Tratamiento de Datos Personales', en: 'Personal Data Processing Policy' },
      firmantes: ['paciente'],
      requiereAceptacion: true,
      unaVezPorPaciente: true, // se firma una sola vez; en visitas posteriores se omite si el paciente ya la firmó

      textoAceptacion: {
        es: 'He leído y acepto la <strong>Política de Tratamiento de Datos Personales</strong> de Stemwell, conforme a la Ley 1581 de 2012.',
        en: "I have read and accept Stemwell's <strong>Personal Data Processing Policy</strong>, in accordance with Colombian Law 1581 of 2012."
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'En STEMWELL, entendemos que la información personal de nuestros pacientes, usuarios, trabajadores, proveedores y aliados debe ser tratada con responsabilidad, confidencialidad y respeto. Por esta razón, hemos adoptado la presente Política de Tratamiento de Datos Personales, mediante la cual informamos de manera clara cómo recolectamos, utilizamos, almacenamos, protegemos y, cuando sea necesario, compartimos la información personal suministrada en el desarrollo de nuestras actividades asistenciales, administrativas y operativas.', en: 'At STEMWELL, we understand that the personal information of our patients, users, employees, providers, and partners must be handled responsibly, confidentially, and respectfully. For this reason, we have adopted this Personal Data Processing Policy, through which we clearly explain how we collect, use, store, protect, and, when necessary, share the personal information provided in the course of our healthcare, administrative, and operational activities.' } },
        { tipo: 'p', texto: { es: 'Esta Política se desarrolla conforme a la Constitución Política de Colombia, la Ley 1581 de 2012, el Decreto 1377 de 2013, la Ley 23 de 1981, la Resolución 1995 de 1999 y demás normas aplicables relacionadas con la protección de datos personales, la confidencialidad de la información y la reserva de la historia clínica.', en: 'This Policy is developed in accordance with the Political Constitution of Colombia, Law 1581 of 2012, Decree 1377 of 2013, Law 23 of 1981, Resolution 1995 of 1999, and other applicable regulations related to personal data protection, information confidentiality, and medical record privacy.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[0] },
        { tipo: 'p', texto: { es: 'El responsable del tratamiento de los datos personales es STEMWELL, identificada con NIT 900.439.194-0, con domicilio en la Carrera 13 No. 118-08 de la ciudad de Bogotá D.C.', en: 'The party responsible for processing personal data is STEMWELL, with Tax ID (NIT) 900.439.194-0, located at Carrera 13 No. 118-08, Bogotá D.C.' } },
        { tipo: 'p', texto: { es: 'Para cualquier consulta, actualización, solicitud o reclamo relacionado con el tratamiento de datos personales, los titulares podrán comunicarse a través de los siguientes canales: correo electrónico info@stemwell.co · teléfono +57 310 406 8755.', en: 'For any inquiry, update, request, or complaint related to the processing of personal data, data subjects may contact us through the following channels: email info@stemwell.co · phone +57 310 406 8755.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[1] },
        { tipo: 'p', texto: { es: 'En STEMWELL recolectamos únicamente la información necesaria para prestar adecuadamente nuestros servicios y cumplir nuestras obligaciones legales y contractuales.', en: 'At STEMWELL we collect only the information necessary to properly provide our services and fulfill our legal and contractual obligations.' } },
        { tipo: 'p', texto: { es: 'En el caso de pacientes y usuarios, los datos personales se utilizan para la prestación de servicios de salud, realización de valoraciones médicas, exámenes médicos, diagnósticos, tratamientos, procedimientos, seguimientos clínicos y procesos de rehabilitación. Asimismo, la información permite elaborar, actualizar y custodiar la historia clínica y demás registros asistenciales requeridos por la normatividad vigente.', en: 'For patients and users, personal data is used to provide healthcare services, perform medical evaluations, medical exams, diagnoses, treatments, procedures, clinical follow-up, and rehabilitation processes. The information also allows us to create, update, and safeguard medical records and other healthcare records required by current regulations.' } },
        { tipo: 'p', texto: { es: 'También utilizamos la información para gestionar citas médicas, autorizaciones, remisiones, incapacidades, certificados, facturación, procesos administrativos y reportes obligatorios ante entidades del Sistema General de Seguridad Social en Salud, autoridades regulatorias y organismos de control.', en: 'We also use the information to manage medical appointments, authorizations, referrals, medical leave certificates, billing, administrative processes, and mandatory reports to entities of the General Social Security Health System, regulatory authorities, and oversight bodies.' } },
        { tipo: 'p', texto: { es: 'Adicionalmente, los datos podrán ser utilizados para atender peticiones, quejas, reclamos, auditorías internas y externas, procesos de calidad y demás actividades necesarias para garantizar una adecuada prestación de los servicios de salud.', en: 'Additionally, the data may be used to respond to petitions, complaints and claims, internal and external audits, quality processes, and other activities necessary to ensure the proper delivery of healthcare services.' } },
        { tipo: 'p', texto: { es: 'Respecto de trabajadores, proveedores y contratistas, la información personal podrá ser utilizada para procesos de selección, contratación, afiliaciones al sistema de seguridad social, control de acceso, cumplimiento de obligaciones laborales, administrativas, financieras y contractuales.', en: 'For employees, providers, and contractors, personal information may be used for selection and hiring processes, social security enrollment, access control, and compliance with labor, administrative, financial, and contractual obligations.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[2] },
        { tipo: 'p', texto: { es: 'Algunos de los datos que STEMWELL trata corresponden a datos sensibles, especialmente aquellos relacionados con la salud. Este tipo de información será manejada bajo estrictos estándares de confidencialidad, seguridad y acceso restringido.', en: 'Some of the data STEMWELL processes qualifies as sensitive data, particularly health-related information. This type of information will be handled under strict standards of confidentiality, security, and restricted access.' } },
        { tipo: 'p', texto: { es: 'El titular no está obligado a autorizar el tratamiento de datos sensibles; sin embargo, en materia asistencial, cierta información resulta indispensable para garantizar una adecuada atención médica y la continuidad del tratamiento. En caso de no suministrarse información esencial, podrían existir limitaciones para la prestación del servicio de salud.', en: 'Data subjects are not obligated to authorize the processing of sensitive data; however, in healthcare matters, certain information is essential to ensure proper medical care and continuity of treatment. If essential information is not provided, limitations on the delivery of healthcare services may result.' } },
        { tipo: 'p', texto: { es: 'La información clínica y la historia clínica solo serán utilizadas para fines asistenciales, administrativos y legales autorizados por la normatividad vigente.', en: 'Clinical information and medical records will only be used for healthcare, administrative, and legal purposes authorized by current regulations.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[3] },
        { tipo: 'p', texto: { es: 'La autorización para el tratamiento de datos personales podrá obtenerse mediante formularios físicos o electrónicos, formatos de admisión, consentimientos informados, contratos, grabaciones de llamadas o cualquier conducta inequívoca que permita concluir que el titular otorgó su consentimiento.', en: 'Authorization for the processing of personal data may be obtained through physical or electronic forms, admission forms, informed consent documents, contracts, recorded calls, or any unequivocal conduct that shows the data subject granted consent.' } },
        { tipo: 'p', texto: { es: 'El titular podrá solicitar la revocatoria de la autorización o la supresión de sus datos cuando sea procedente legalmente. No obstante, la información que deba conservarse por disposición legal, como la historia clínica, continuará siendo almacenada durante el término exigido por la normatividad aplicable.', en: 'Data subjects may request the revocation of their authorization or the deletion of their data when legally applicable. However, information that must be retained by law, such as medical records, will continue to be stored for the period required by applicable regulations.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[4] },
        { tipo: 'p', texto: { es: 'Para garantizar la adecuada prestación de los servicios de salud y cumplir obligaciones legales, STEMWELL podrá compartir información personal con EPS, IPS aliadas, aseguradoras, laboratorios clínicos, entidades regulatorias, autoridades administrativas o judiciales, así como proveedores tecnológicos y plataformas utilizadas para la operación de los servicios.', en: 'To ensure proper healthcare service delivery and comply with legal obligations, STEMWELL may share personal information with health insurers (EPS), partner healthcare providers (IPS), insurance companies, clinical laboratories, regulatory entities, administrative or judicial authorities, as well as technology providers and platforms used to operate our services.' } },
        { tipo: 'p', texto: { es: 'En todos los casos, la Compañía exigirá que terceros implementen medidas adecuadas de seguridad y confidencialidad para proteger la información personal.', en: 'In all cases, the Company will require third parties to implement adequate security and confidentiality measures to protect personal information.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[5] },
        { tipo: 'lista', items: [
          { es: 'Conocer, actualizar y rectificar su información personal.', en: 'Know, update, and correct their personal information.' },
          { es: 'Solicitar prueba de la autorización otorgada.', en: 'Request proof of the authorization granted.' },
          { es: 'Ser informada sobre el uso dado a sus datos.', en: 'Be informed about how their data has been used.' },
          { es: 'Presentar consultas, solicitudes o reclamos.', en: 'Submit inquiries, requests, or complaints.' },
          { es: 'Solicitar la supresión de sus datos cuando sea legalmente procedente.', en: 'Request deletion of their data when legally applicable.' },
          { es: 'Presentar quejas ante la Superintendencia de Industria y Comercio.', en: 'File complaints with the Superintendency of Industry and Commerce.' },
          { es: 'Acceder gratuitamente a sus datos personales.', en: 'Access their personal data free of charge.' }
        ] },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[6] },
        { tipo: 'p', texto: { es: 'Las consultas o reclamos relacionados con protección de datos personales podrán presentarse a través del correo electrónico info@stemwell.co. Las consultas serán atendidas dentro de los diez (10) días hábiles siguientes a su recepción. Los reclamos serán respondidos dentro de los quince (15) días hábiles, conforme a los términos establecidos en la legislación colombiana.', en: 'Inquiries or complaints related to personal data protection may be submitted via email at info@stemwell.co. Inquiries will be handled within ten (10) business days of receipt. Complaints will be answered within fifteen (15) business days, in accordance with Colombian law.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[7] },
        { tipo: 'p', texto: { es: 'STEMWELL adopta medidas administrativas, técnicas y tecnológicas orientadas a proteger la información personal contra pérdida, alteración, acceso no autorizado, uso indebido o cualquier tratamiento fraudulento. Entre estas medidas se incluyen controles de acceso físico y digital, protocolos de confidencialidad, acceso restringido a historias clínicas, almacenamiento seguro de información y mecanismos de respaldo y protección de datos.', en: 'STEMWELL implements administrative, technical, and technological measures aimed at protecting personal information against loss, alteration, unauthorized access, misuse, or any fraudulent processing. These measures include physical and digital access controls, confidentiality protocols, restricted access to medical records, secure information storage, and data backup and protection mechanisms.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[8] },
        { tipo: 'p', texto: { es: 'La historia clínica es un documento privado, obligatorio y sometido a reserva legal, conforme a la Ley 23 de 1981 y la Resolución 1995 de 1999. Únicamente podrán acceder a ella el paciente, las personas autorizadas por este, el personal asistencial involucrado directamente en su atención y las autoridades legalmente facultadas. STEMWELL conservará las historias clínicas durante el término exigido por la normatividad vigente.', en: 'The medical record is a private, mandatory document subject to legal confidentiality, in accordance with Law 23 of 1981 and Resolution 1995 of 1999. Only the patient, persons authorized by the patient, healthcare staff directly involved in their care, and legally authorized authorities may access it. STEMWELL will retain medical records for the period required by current regulations.' } },

        { tipo: 'h', texto: POLITICA_DATOS_TITULOS[9] },
        { tipo: 'p', texto: { es: 'La presente Política rige a partir de su publicación y permanecerá vigente mientras STEMWELL realice tratamiento de datos personales. La Compañía podrá actualizar o modificar esta Política en cualquier momento. Cualquier cambio será informado a través de los canales oficiales de STEMWELL.', en: 'This Policy is effective as of its publication and will remain in force for as long as STEMWELL processes personal data. The Company may update or modify this Policy at any time. Any changes will be communicated through STEMWELL\'s official channels.' } }
      ]
    },

    descargo_responsabilidad: {
      key: 'descargo_responsabilidad',
      categoria: 'general',
      codigo: 'PQR-FR-006 V1',
      titulo: { es: 'Descargo de Responsabilidad', en: 'Liability Waiver' },
      firmantes: ['paciente', 'representante'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'He leído y acepto el <strong>Descargo de Responsabilidad</strong> descrito anteriormente.',
        en: 'I have read and accept the <strong>Liability Waiver</strong> described above.'
      },
      usaMedicoEnTexto: true,
      cuerpo: [
        { tipo: 'p', texto: { es: 'Manifiesto que, de manera libre, voluntaria y en pleno uso de mis facultades mentales, actuando en nombre propio o como representante legal del paciente, declaro lo siguiente:', en: 'I declare that, freely, voluntarily, and in full use of my mental faculties, acting on my own behalf or as the legal representative of the patient, I state the following:' } },
        { tipo: 'lista', items: [
          { es: 'Que he sido informado(a) de que el(la) médico(a) tratante será el(la) Dr.(a) {{medico}}, quien será el único responsable del(los) procedimiento(s) médico(s) o quirúrgico(s) a realizar, los cuales he autorizado previamente.', en: 'That I have been informed that the treating physician will be Dr. {{medico}}, who will be solely responsible for the medical or surgical procedure(s) to be performed, which I have previously authorized.' },
          { es: 'Que el(la) médico(a) tratante me ha explicado de forma clara y suficiente en qué consiste el(los) procedimiento(s), así como los objetivos del mismo y su alcance.', en: 'That the treating physician has clearly and sufficiently explained to me what the procedure(s) involve, as well as their objectives and scope.' },
          { es: 'Que he sido informado(a) de los riesgos generales y específicos inherentes al(los) procedimiento(s), así como de las posibles complicaciones y el porcentaje estimado de éxito, entendiéndose que tales riesgos son propios del ejercicio médico quirúrgico. En consecuencia, comprendo que la IPS no es responsable de los resultados derivados de la práctica médica, siempre que no medie dolo o negligencia por parte de sus profesionales.', en: 'That I have been informed of the general and specific risks inherent to the procedure(s), as well as possible complications and the estimated success rate, understanding that such risks are inherent to medical and surgical practice. Consequently, I understand that the IPS is not liable for outcomes resulting from medical practice, provided there is no willful misconduct or negligence on the part of its professionals.' },
          { es: 'Que tengo conocimiento de que la IPS STEMWELL presta exclusivamente servicios de quirófano, enfermería e instrumentación quirúrgica, y que cuenta con la debida habilitación otorgada por la Secretaría de Salud bajo el código No. 110012957901.', en: 'That I am aware that IPS STEMWELL provides exclusively operating room, nursing, and surgical instrumentation services, and holds the corresponding license granted by the Secretary of Health under code No. 110012957901.' },
          { es: 'Que comprendo que es responsabilidad del médico tratante gestionar y diligenciar cualquier trámite relacionado con pólizas de seguro o cobertura por complicaciones quirúrgicas, si estas fueran requeridas en el postoperatorio. Reconozco que esta gestión no corresponde a la IPS STEMWELL.', en: "That I understand it is the treating physician's responsibility to manage and process any matters related to insurance policies or coverage for surgical complications, if required post-operatively. I acknowledge that this is not the responsibility of IPS STEMWELL." }
        ] },
        { tipo: 'p', texto: { es: 'En constancia de lo anterior, firmo el presente documento en la ciudad de Bogotá D.C.', en: 'In witness whereof, I sign this document in the city of Bogotá D.C.' } }
      ]
    },

    uso_imagen: {
      key: 'uso_imagen',
      categoria: 'general',
      codigo: 'CMD-FR-010 V1',
      titulo: { es: 'Consentimiento Informado para Uso de Material Audiovisual', en: 'Informed Consent for the Use of Audiovisual Material' },
      firmantes: ['paciente', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'He leído y otorgo el <strong>Consentimiento para Uso de Material Audiovisual</strong> descrito anteriormente.',
        en: 'I have read and grant the <strong>Consent for the Use of Audiovisual Material</strong> described above.'
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'Por medio del presente documento otorgo autorización expresa, previa, informada y voluntaria para el uso de mis derechos de imagen a la IPS STEMWELL, conforme a la Constitución Política de Colombia, la Ley 1581 de 2012 y demás normas concordantes. La autorización se regirá por las siguientes cláusulas:', en: 'Through this document I grant express, prior, informed, and voluntary authorization for the use of my image rights to IPS STEMWELL, in accordance with the Political Constitution of Colombia, Law 1581 of 2012, and other applicable regulations. This authorization is governed by the following clauses:' } },
        { tipo: 'h', texto: { es: 'PRIMERA. Autorización y objeto', en: 'FIRST. Authorization and purpose' } },
        { tipo: 'p', texto: { es: 'Autorizo a la IPS STEMWELL para que utilice mi imagen en fotografías, procedimientos análogos a la fotografía, producciones audiovisuales (videos), y en general en cualquier medio de expresión relacionado con el derecho a la imagen, exclusivamente para fines institucionales, académicos, científicos, de divulgación y promocionales, sin que ello implique explotación comercial distinta a la aquí prevista.', en: 'I authorize IPS STEMWELL to use my image in photographs, photography-like processes, audiovisual productions (videos), and generally in any medium of expression related to image rights, exclusively for institutional, academic, scientific, informational, and promotional purposes, without implying any commercial use other than that provided for herein.' } },
        { tipo: 'h', texto: { es: 'SEGUNDA. Alcance de la autorización', en: 'SECOND. Scope of the authorization' } },
        { tipo: 'p', texto: { es: 'La autorización comprende la utilización de mi imagen en ediciones impresas, medios electrónicos, ópticos, magnéticos, redes (intranet e internet), mensajes de datos o similares, y en cualquier medio o soporte conocido o que se desarrolle en el futuro, directamente o a través de terceros designados por la IPS STEMWELL.', en: 'This authorization includes the use of my image in print editions, electronic, optical, and magnetic media, networks (intranet and internet), data messages or similar, and in any medium or format now known or developed in the future, either directly or through third parties designated by IPS STEMWELL.' } },
        { tipo: 'h', texto: { es: 'TERCERA. Territorio y exclusividad', en: 'THIRD. Territory and exclusivity' } },
        { tipo: 'p', texto: { es: 'Los derechos aquí autorizados se conceden sin limitación geográfica o territorial alguna. Esta autorización no es exclusiva, por lo que el titular se reserva el derecho de otorgar autorizaciones similares a terceros.', en: 'The rights authorized herein are granted without any geographic or territorial limitation. This authorization is non-exclusive, and the data subject reserves the right to grant similar authorizations to third parties.' } },
        { tipo: 'h', texto: { es: 'CUARTA. Derechos morales', en: 'FOURTH. Moral rights' } },
        { tipo: 'p', texto: { es: 'STEMWELL respetará en todo momento la normatividad vigente sobre los derechos morales de autor, que permanecerán radicados en cabeza de su titular.', en: 'STEMWELL will at all times respect current regulations regarding moral copyright, which remain vested in the rights holder.' } },
        { tipo: 'h', texto: { es: 'QUINTA. Duración y derecho a retracto', en: 'FIFTH. Duration and right of withdrawal' } },
        { tipo: 'p', texto: { es: 'La autorización se otorga por tiempo indefinido, hasta tanto sea revocada por el titular. En cualquier momento, el titular podrá revocar la autorización, sin costo alguno, mediante comunicación enviada al correo electrónico info@stemwell.co, conforme a la política de tratamiento de datos personales de la IPS STEMWELL.', en: 'This authorization is granted for an indefinite period, until revoked by the data subject. At any time, the data subject may revoke this authorization, free of charge, by sending an email to info@stemwell.co, in accordance with the IPS STEMWELL personal data processing policy.' } },
        { tipo: 'h', texto: { es: 'SEXTA. Voluntariedad y datos sensibles', en: 'SIXTH. Voluntary nature and sensitive data' } },
        { tipo: 'p', texto: { es: 'Declaro que la presente autorización es otorgada de manera libre y voluntaria. Reconozco que la imagen constituye un dato sensible y que no estoy obligado(a) a autorizar su tratamiento. Mi negativa a otorgar esta autorización no afectará la calidad, acceso o continuidad de los servicios de salud que me presta la IPS STEMWELL.', en: 'I declare that this authorization is granted freely and voluntarily. I acknowledge that image constitutes sensitive data and that I am not obligated to authorize its processing. My refusal to grant this authorization will not affect the quality, access, or continuity of the healthcare services provided to me by IPS STEMWELL.' } },
        { tipo: 'h', texto: { es: 'SÉPTIMA. Menores de edad', en: 'SEVENTH. Minors' } },
        { tipo: 'p', texto: { es: 'En caso de que la autorización se otorgue respecto de un menor de edad, manifiesto actuar en calidad de representante legal y que el menor, en la medida de lo posible, ha sido informado sobre el uso de su imagen.', en: 'If this authorization is granted on behalf of a minor, I state that I am acting as the legal representative and that the minor has, to the extent possible, been informed about the use of their image.' } },
        { tipo: 'h', texto: { es: 'OCTAVA. Limitación de responsabilidad', en: 'EIGHTH. Limitation of liability' } },
        { tipo: 'p', texto: { es: 'La IPS STEMWELL adoptará las medidas razonables para proteger el uso autorizado de las imágenes, pero no será responsable por usos indebidos que realicen terceros no autorizados.', en: 'IPS STEMWELL will take reasonable measures to protect the authorized use of the images, but will not be liable for misuse by unauthorized third parties.' } }
      ]
    },

    // ── ESPECÍFICOS DE PROCEDIMIENTO (selección del staff) ────────────────
    fisioterapia: {
      key: 'fisioterapia',
      categoria: 'procedimiento',
      codigo: 'ATP-FR-003 V1',
      titulo: { es: 'Consentimiento Informado — Fisioterapia y Terapia Avanzada', en: 'Informed Consent — Physiotherapy and Advanced Therapy' },
      etiquetaSeleccion: { es: 'Fisioterapia / Terapia avanzada', en: 'Physiotherapy / Advanced therapy' },
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'Autorizo de manera libre, voluntaria e informada la realización de las intervenciones de <strong>terapia física</strong> descritas anteriormente.',
        en: 'I freely, voluntarily, and knowingly authorize the <strong>physical therapy</strong> interventions described above.'
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'Autorizo de manera libre, voluntaria e informada a la clínica Stemwell para la realización de las intervenciones de terapia física indicadas, habiendo recibido información clara, suficiente y comprensible sobre el procedimiento, sus beneficios, posibles riesgos, alternativas terapéuticas y consecuencias de no realizarlo.', en: 'I freely, voluntarily, and knowingly authorize Stemwell Clinic to carry out the indicated physical therapy interventions, having received clear, sufficient, and understandable information about the procedure, its benefits, possible risks, therapeutic alternatives, and the consequences of not undergoing it.' } },
        { tipo: 'p', texto: { es: 'La terapia física es una disciplina clínico asistencial de la rehabilitación funcional que integra conocimientos de biomecánica, fisiología, neurociencia y control motor para la evaluación, diagnóstico fisioterapéutico e intervención terapéutica de las alteraciones del movimiento corporal humano.', en: 'Physical therapy is a clinical rehabilitation discipline that integrates knowledge of biomechanics, physiology, neuroscience, and motor control for the evaluation, physiotherapeutic diagnosis, and therapeutic intervention of human movement disorders.' } },
        { tipo: 'p', texto: { es: 'Se me ha informado también que la atención en este servicio es integral y puede requerir, según mi condición clínica, procedimientos de diferente naturaleza como: termoterapia, ultrasonido, electroterapia, ondas de choque, radiofrecuencia, magnetoterapia, láser, presoterapia, movilizaciones articulares pasivas y activas, estiramientos, ejercicios isométricos e isotónicos, balón-terapia, técnicas de facilitación neuropropioceptiva (TFNP), reeducación vestibular, reeducación del patrón respiratorio, reeducación postural y plan casero, entre otros.', en: 'I have also been informed that care under this service is comprehensive and, depending on my clinical condition, may require various procedures such as: thermotherapy, ultrasound, electrotherapy, shockwave therapy, radiofrequency, magnetotherapy, laser, pressotherapy, passive and active joint mobilizations, stretching, isometric and isotonic exercises, ball therapy, proprioceptive neuromuscular facilitation techniques (PNF), vestibular re-education, breathing pattern re-education, postural re-education, and home exercise plans, among others.' } },
        { tipo: 'h', texto: { es: 'Beneficios', en: 'Benefits' } },
        { tipo: 'lista', items: [
          { es: 'Disminución del dolor y la inflamación', en: 'Reduced pain and inflammation' },
          { es: 'Aumento de la fuerza muscular y resistencia', en: 'Increased muscle strength and endurance' },
          { es: 'Mejora de la calidad de vida', en: 'Improved quality of life' }
        ] },
        { tipo: 'h', texto: { es: 'Riesgos y efectos secundarios posibles', en: 'Possible risks and side effects' } },
        { tipo: 'lista', items: [
          { es: 'Dolor leve o moderado posterior a la sesión', en: 'Mild to moderate pain after the session' },
          { es: 'Fatiga muscular', en: 'Muscle fatigue' },
          { es: 'Inflamación transitoria', en: 'Transient inflammation' },
          { es: 'Espasmos musculares', en: 'Muscle spasms' }
        ] },
        { tipo: 'h', texto: { es: 'Contraindicaciones', en: 'Contraindications' } },
        { tipo: 'lista', items: [
          { es: 'Procesos infecciosos agudos', en: 'Acute infectious processes' },
          { es: 'Fracturas sin estabilización', en: 'Unstabilized fractures' },
          { es: 'Lesiones cutáneas', en: 'Skin lesions' }
        ] },
        { tipo: 'h', texto: { es: 'Alternativas', en: 'Alternatives' } },
        { tipo: 'lista', items: [
          { es: 'Tratamiento farmacológico (analgésicos / AINES)', en: 'Pharmacological treatment (analgesics / NSAIDs)' },
          { es: 'Cirugía', en: 'Surgery' }
        ] }
      ]
    },

    ortobiologicos: {
      key: 'ortobiologicos',
      categoria: 'procedimiento',
      codigo: 'ATP-FR-004 V1',
      titulo: { es: 'Consentimiento Informado — Aplicación de Ortobiológicos', en: 'Informed Consent — Application of Orthobiologics' },
      etiquetaSeleccion: { es: 'Aplicación de Ortobiológicos', en: 'Application of Orthobiologics' },
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'Autorizo la realización del procedimiento de <strong>aplicación de ortobiológicos</strong> descrito anteriormente.',
        en: 'I authorize the <strong>orthobiologics application</strong> procedure described above.'
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'De manera voluntaria y con pleno entendimiento, autorizo la realización del procedimiento consistente en la aplicación de ortobiológicos procesados, los cuales serán administrados por la vía intravenosa y/o en las zonas anatómicas previamente acordadas durante la consulta médica. Reconozco que he formulado todas las preguntas que consideré necesarias y que las mismas han sido resueltas de forma clara y satisfactoria por el equipo médico.', en: 'Voluntarily and with full understanding, I authorize the procedure consisting of the application of processed orthobiologics, to be administered intravenously and/or at the anatomical sites previously agreed upon during the medical consultation. I acknowledge that I have asked all the questions I considered necessary and that they have been clearly and satisfactorily answered by the medical team.' } },
        { tipo: 'h', texto: { es: 'Beneficios', en: 'Benefits' } },
        { tipo: 'lista', items: [
          { es: 'Posible mejoría del dolor', en: 'Possible pain improvement' },
          { es: 'Recuperación funcional', en: 'Functional recovery' },
          { es: 'Mejora de la circulación', en: 'Improved circulation' },
          { es: 'Reducción de inflamación', en: 'Reduced inflammation' }
        ] },
        { tipo: 'h', texto: { es: 'Riesgos y efectos secundarios posibles', en: 'Possible risks and side effects' } },
        { tipo: 'lista', items: [
          { es: 'Dependientes de la técnica, concentración y del paciente', en: "Dependent on the technique, concentration, and the patient's own condition" },
          { es: 'Reacción inflamatoria transitoria (frecuente en PRP)', en: 'Transient inflammatory reaction (common with PRP)' }
        ] },
        { tipo: 'h', texto: { es: 'Contraindicaciones', en: 'Contraindications' } },
        { tipo: 'lista', items: [
          { es: 'Infección activa en el sitio de aplicación', en: 'Active infection at the application site' },
          { es: 'Trastornos de coagulación severos', en: 'Severe coagulation disorders' }
        ] },
        { tipo: 'h', texto: { es: 'Alternativas', en: 'Alternatives' } },
        { tipo: 'lista', items: [
          { es: 'Fisioterapia (ejercicios de carga progresiva)', en: 'Physical therapy (progressive loading exercises)' },
          { es: 'Analgésicos / AINES', en: 'Analgesics / NSAIDs' },
          { es: 'Modificar la actividad física', en: 'Modifying physical activity' }
        ] },
        { tipo: 'p', texto: { es: 'Al firmar este documento reconozco que he leído y comprendido la información, que he tenido la oportunidad de preguntar al respecto y he aclarado mis inquietudes. Acepto que la medicina no es una ciencia exacta y que el resultado del procedimiento puede variar de un individuo a otro; entiendo que los tratamientos en salud no permiten garantías ni seguridad de éxito en los resultados. Doy mi consentimiento para la realización de la consulta y/o procedimientos mencionados.', en: 'By signing this document, I acknowledge that I have read and understood the information, that I have had the opportunity to ask questions, and that my concerns have been addressed. I accept that medicine is not an exact science and that the outcome of the procedure may vary from one individual to another; I understand that healthcare treatments offer no guarantee of success. I give my consent for the consultation and/or procedures mentioned above.' } }
      ]
    },

    oxigenacion_hiperbarica: {
      key: 'oxigenacion_hiperbarica',
      categoria: 'procedimiento',
      codigo: 'ATP-FR-006 V1',
      titulo: { es: 'Consentimiento Informado — Oxigenación Hiperbárica', en: 'Informed Consent — Hyperbaric Oxygen Therapy' },
      etiquetaSeleccion: { es: 'Oxigenación Hiperbárica', en: 'Hyperbaric Oxygen Therapy' },
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'Autorizo la realización del <strong>tratamiento de oxigenación hiperbárica</strong> descrito anteriormente.',
        en: 'I authorize the <strong>hyperbaric oxygen therapy</strong> treatment described above.'
      },
      cuerpo: [
        { tipo: 'checklist', clave: 'contraindicaciones_hiperbarica', codigo: 'ATP-FR-005 V1',
          titulo: { es: 'Cuestionario de contraindicaciones — cámara hiperbárica', en: 'Contraindications Questionnaire — Hyperbaric Chamber' },
          subtitulo: { es: 'Por favor marque Sí o No para cada condición.', en: 'Please mark Yes or No for each condition.' },
          grupos: [
            { titulo: { es: 'Contraindicaciones absolutas', en: 'Absolute contraindications' }, items: [
              { es: 'Uso de medicamentos citostáticos (Adriamicina / Bleomicina / Cisplatino)', en: 'Use of cytostatic medications (Adriamycin / Bleomycin / Cisplatin)' },
              { es: 'Neumotórax no tratado', en: 'Untreated pneumothorax' },
              { es: 'Implantes cocleares', en: 'Cochlear implants' },
              { es: 'Claustrofobia', en: 'Claustrophobia' },
              { es: 'Glaucoma', en: 'Glaucoma' },
              { es: 'Hígado graso severo', en: 'Severe fatty liver' }
            ] },
            { titulo: { es: 'Contraindicaciones relativas', en: 'Relative contraindications' }, items: [
              { es: 'Infecciones respiratorias agudas (gripe y/o neumonía)', en: 'Acute respiratory infections (flu and/or pneumonia)' },
              { es: 'Hipertensión no controlada', en: 'Uncontrolled hypertension' },
              { es: 'Epilepsia no tratada', en: 'Untreated epilepsy' },
              { es: 'Fiebre actual (temperatura mayor a 37.5°C)', en: 'Current fever (temperature above 37.5°C)' },
              { es: 'Dolor de oído o de senos paranasales', en: 'Ear or sinus pain' },
              { es: 'Ansiedad por confinamiento', en: 'Anxiety due to confinement' },
              { es: 'Cirugías dentales recientes', en: 'Recent dental surgeries' },
              { es: 'Trauma de membrana timpánica en el último mes y/o dolor crónico de oído', en: 'Eardrum trauma within the last month and/or chronic ear pain' },
              { es: 'Uso de lentes de contacto', en: 'Use of contact lenses' },
              { es: 'Infección cutánea y/o abscesos', en: 'Skin infection and/or abscesses' }
            ] }
          ] },
        { tipo: 'p', texto: { es: 'Autorizo al equipo de la IPS STEMWELL para realizar el tratamiento con oxigenación hiperbárica, que consiste en brindar al interior de una cámara, oxígeno al 100% a presiones más elevadas que la atmosférica.', en: 'I authorize the IPS STEMWELL team to perform hyperbaric oxygen therapy, which consists of providing 100% oxygen inside a chamber at pressures higher than atmospheric pressure.' } },
        { tipo: 'p', texto: { es: 'El profesional me ha explicado de forma suficiente y adecuada en qué consiste el tratamiento, sus beneficios, las complicaciones o molestias que podría sufrir, así como algunos consejos para evitar estas molestias, y me ha aclarado las dudas que tenía en forma satisfactoria. Declaro que no he dado información engañosa para que se me realice este tratamiento y que he decidido someterme a este procedimiento de forma voluntaria.', en: 'The professional has sufficiently and adequately explained to me what the treatment consists of, its benefits, the complications or discomfort I might experience, as well as tips to avoid such discomfort, and has satisfactorily answered the questions I had. I declare that I have not provided misleading information in order to undergo this treatment and that I have voluntarily decided to undergo this procedure.' } },
        { tipo: 'h', texto: { es: 'Beneficios', en: 'Benefits' } },
        { tipo: 'lista', items: [
          { es: 'Aceleración en la recuperación de tejidos', en: 'Faster tissue recovery' },
          { es: 'Disminución del dolor y la inflamación', en: 'Reduced pain and inflammation' },
          { es: 'Mejora de la circulación', en: 'Improved circulation' },
          { es: 'Apoyo en el tratamiento de heridas crónicas', en: 'Support in treating chronic wounds' }
        ] },
        { tipo: 'h', texto: { es: 'Riesgos y efectos secundarios posibles', en: 'Possible risks and side effects' } },
        { tipo: 'lista', items: [
          { es: 'Sensación de presión en oídos o senos paranasales (barotrauma)', en: 'Feeling of pressure in the ears or sinuses (barotrauma)' },
          { es: 'Dolor o molestia en los oídos', en: 'Ear pain or discomfort' },
          { es: 'Mareo o fatiga', en: 'Dizziness or fatigue' },
          { es: 'Claustrofobia', en: 'Claustrophobia' }
        ] },
        { tipo: 'h', texto: { es: 'Contraindicaciones', en: 'Contraindications' } },
        { tipo: 'lista', items: [
          { es: 'Neumotórax no tratado', en: 'Untreated pneumothorax' },
          { es: 'Algunas enfermedades pulmonares severas no controladas', en: 'Certain uncontrolled severe lung diseases' }
        ] },
        { tipo: 'h', texto: { es: 'Alternativas', en: 'Alternatives' } },
        { tipo: 'lista', items: [
          { es: 'Tratamiento médico convencional', en: 'Conventional medical treatment' },
          { es: 'Manejo farmacológico', en: 'Pharmacological management' },
          { es: 'Terapias complementarias', en: 'Complementary therapies' },
          { es: 'No realizar el tratamiento', en: 'Not undergoing the treatment' }
        ] }
      ]
    },

    anestesia: {
      key: 'anestesia',
      categoria: 'procedimiento',
      codigo: 'PQR-FR-005 V1',
      titulo: { es: 'Consentimiento Informado — Anestesia', en: 'Informed Consent — Anesthesia' },
      etiquetaSeleccion: { es: 'Anestesia', en: 'Anesthesia' },
      firmantes: ['paciente', 'representante', 'medico', 'anestesiologo'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'Autorizo a los anestesiólogos que actúan en nombre propio y de IPS STEMWELL para que se me administre la <strong>anestesia</strong> requerida.',
        en: 'I authorize the anesthesiologists, acting on their own behalf and on behalf of IPS STEMWELL, to administer the <strong>anesthesia</strong> required.'
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'Se me ha explicado que la anestesia es un procedimiento médico que permite realizar intervenciones quirúrgicas o diagnósticas sin dolor, mediante la administración de medicamentos que producen pérdida de la sensibilidad, del dolor y/o de la conciencia.', en: 'It has been explained to me that anesthesia is a medical procedure that allows surgical or diagnostic interventions to be performed without pain, through the administration of medications that produce loss of sensation, pain, and/or consciousness.' } },
        { tipo: 'p', texto: { es: 'Luego de haber sido atendido e interrogado sobre mis antecedentes, y de haber examinado y evaluado los estudios prequirúrgicos solicitados, se determinó mi condición clínica para afrontar el procedimiento anestésico. Entiendo que el anestesiólogo empleará todos los medios a su alcance buscando mi seguridad durante el acto anestésico. Sin embargo, soy consciente de que no existen garantías absolutas con la anestesia seleccionada.', en: 'After being evaluated and questioned about my medical history, and after the requested pre-surgical studies were examined and assessed, my clinical condition for undergoing the anesthesia procedure was determined. I understand that the anesthesiologist will use all available means to ensure my safety during the anesthetic procedure. However, I am aware that there are no absolute guarantees with the selected anesthesia.' } },
        { tipo: 'p', texto: { es: 'Autorizo a los anestesiólogos que actúen en nombre propio y de IPS STEMWELL para que se me administre la anestesia requerida para la práctica de mi intervención o procedimiento.', en: 'I authorize the anesthesiologists, acting on their own behalf and on behalf of IPS STEMWELL, to administer the anesthesia required for my intervention or procedure.' } },
        { tipo: 'seleccion', clave: 'tipo_anestesia', etiqueta: { es: 'Tipo de anestesia', en: 'Type of anesthesia' }, opciones: [
          { es: 'General', en: 'General' },
          { es: 'Raquídea', en: 'Spinal' },
          { es: 'Bloqueo periférico', en: 'Peripheral block' },
          { es: 'Sedación', en: 'Sedation' }
        ] },
        { tipo: 'h', texto: { es: 'Beneficios', en: 'Benefits' } },
        { tipo: 'lista', items: [
          { es: 'Ausencia de dolor durante el procedimiento', en: 'Absence of pain during the procedure' },
          { es: 'Mayor seguridad y control médico', en: 'Greater safety and medical control' },
          { es: 'Facilita la realización del acto quirúrgico o diagnóstico', en: 'Facilitates the surgical or diagnostic procedure' }
        ] },
        { tipo: 'h', texto: { es: 'Riesgos y efectos secundarios posibles', en: 'Possible risks and side effects' } },
        { tipo: 'lista', items: [
          { es: 'Náuseas y vómito', en: 'Nausea and vomiting' },
          { es: 'Dolor de cabeza', en: 'Headache' },
          { es: 'Dolor en el sitio de punción', en: 'Pain at the puncture site' }
        ] },
        { tipo: 'h', texto: { es: 'Contraindicaciones', en: 'Contraindications' } },
        { tipo: 'lista', items: [
          { es: 'Alergias a medicamentos anestésicos', en: 'Allergies to anesthetic medications' },
          { es: 'Enfermedades cardiovasculares o respiratorias no controladas', en: 'Uncontrolled cardiovascular or respiratory disease' },
          { es: 'Trastornos de coagulación (para anestesia regional)', en: 'Coagulation disorders (for regional anesthesia)' },
          { es: 'Infección en el sitio de punción', en: 'Infection at the puncture site' },
          { es: 'Ayuno inadecuado', en: 'Inadequate fasting' }
        ] },
        { tipo: 'h', texto: { es: 'Alternativas', en: 'Alternatives' } },
        { tipo: 'lista', items: [
          { es: 'Diferentes técnicas anestésicas según el caso', en: 'Different anesthetic techniques depending on the case' },
          { es: 'Procedimientos con anestesia local o sedación', en: 'Procedures with local anesthesia or sedation' },
          { es: 'No realizar el procedimiento (según indicación médica)', en: 'Not undergoing the procedure (per medical advice)' }
        ] },
        { tipo: 'p', texto: { es: 'Certifico que se me han aclarado mis temores, respondido mis preguntas en forma precisa y en lenguaje sencillo, y he comprendido satisfactoriamente la naturaleza y propósitos de la técnica anestésica, los riesgos, las complicaciones médicas y la necesidad de reservar sangre y/o traslado a cuidados intensivos si fuera necesario. Tengo claro que en cualquier momento puedo formular preguntas sobre el procedimiento anestésico. También me han informado de mi derecho a rechazar el tratamiento o revocar el consentimiento.', en: 'I certify that my concerns have been addressed, my questions have been answered precisely and in plain language, and I have satisfactorily understood the nature and purpose of the anesthetic technique, the risks, potential medical complications, and the possible need for a blood reserve and/or transfer to intensive care if necessary. I understand that I may ask questions about the anesthesia procedure at any time. I have also been informed of my right to refuse treatment or withdraw my consent.' } }
      ]
    },

    telemedicina: {
      key: 'telemedicina',
      categoria: 'procedimiento',
      codigo: null,
      titulo: { es: 'Consentimiento Informado — Atención por Telemedicina', en: 'Informed Consent — Telemedicine Care' },
      etiquetaSeleccion: { es: 'Telemedicina', en: 'Telemedicine' },
      firmantes: ['paciente', 'representante', 'medico'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'Acepto plenamente el contenido de este documento y me comprometo a cumplir los lineamientos de la <strong>atención por telemedicina</strong>.',
        en: 'I fully accept the content of this document and agree to comply with the <strong>telemedicine care</strong> guidelines.'
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'Se me ha informado que la atención en salud se realizará mediante telemedicina, utilizando tecnologías de la información y la comunicación (TIC), sin la presencia física simultánea entre el profesional de salud y el paciente.', en: 'I have been informed that healthcare will be provided through telemedicine, using information and communication technologies (ICT), without the simultaneous physical presence of the healthcare professional and the patient.' } },
        { tipo: 'p', texto: { es: 'De conformidad con la Resolución 2654 de 2019, la telemedicina implica la provisión de servicios de salud a distancia por profesionales de la salud que utilizan tecnologías de la información y la comunicación, con el propósito de facilitar y mejorar el acceso a servicios de salud en cualquiera de sus fases: promoción, prevención, diagnóstico, tratamiento, rehabilitación y paliación.', en: 'In accordance with Resolution 2654 of 2019, telemedicine involves the remote provision of healthcare services by health professionals using information and communication technologies, with the purpose of facilitating and improving access to healthcare services in any of its phases: promotion, prevention, diagnosis, treatment, rehabilitation, and palliative care.' } },
        { tipo: 'p', texto: { es: 'Al firmar este consentimiento informado, atestiguo que: (1) he leído personalmente este documento, lo entiendo y acepto plenamente su contenido; (2) han respondido a satisfacción mis preguntas, y me han explicado los riesgos, beneficios y alternativas de la atención por telemedicina en un lenguaje que entiendo; y (3) me comprometo con el profesional de la salud de la IPS STEMWELL a cumplir con los lineamientos de la atención por telemedicina aquí estipulados.', en: 'By signing this informed consent, I attest that: (1) I have personally read this document, understand it, and fully accept its content; (2) my questions have been satisfactorily answered, and the risks, benefits, and alternatives of telemedicine care have been explained to me in language I understand; and (3) I commit, together with the IPS STEMWELL health professional, to comply with the telemedicine care guidelines set out herein.' } },
        { tipo: 'h', texto: { es: 'Beneficios', en: 'Benefits' } },
        { tipo: 'lista', items: [
          { es: 'Acceso a servicios de salud desde cualquier ubicación', en: 'Access to healthcare services from any location' },
          { es: 'Reducción de tiempos de desplazamiento', en: 'Reduced travel time' },
          { es: 'Mayor oportunidad en la atención', en: 'Faster access to care' },
          { es: 'Continuidad del tratamiento', en: 'Continuity of treatment' }
        ] },
        { tipo: 'h', texto: { es: 'Riesgos y efectos secundarios posibles', en: 'Possible risks and side effects' } },
        { tipo: 'lista', items: [
          { es: 'Fallas tecnológicas o de conectividad', en: 'Technological or connectivity failures' },
          { es: 'Limitaciones en el examen físico', en: 'Limitations in the physical examination' },
          { es: 'Riesgo de interrupciones durante la consulta', en: 'Risk of interruptions during the consultation' },
          { es: 'Posibles dificultades en la calidad de audio o video', en: 'Possible issues with audio or video quality' }
        ] },
        { tipo: 'h', texto: { es: 'Contraindicaciones', en: 'Contraindications' } },
        { tipo: 'lista', items: [
          { es: 'Situaciones de urgencia o emergencia que requieren atención presencial inmediata', en: 'Urgent or emergency situations requiring immediate in-person care' },
          { es: 'Casos donde se requiera un examen físico detallado no sustituible', en: 'Cases requiring a detailed physical exam that cannot be substituted' },
          { es: 'Dificultades tecnológicas que impidan una adecuada comunicación', en: 'Technological difficulties that prevent proper communication' }
        ] },
        { tipo: 'h', texto: { es: 'Alternativas', en: 'Alternatives' } },
        { tipo: 'lista', items: [
          { es: 'Atención presencial', en: 'In-person care' },
          { es: 'Consulta con otro profesional', en: 'Consultation with another professional' },
          { es: 'No realizar la consulta', en: 'Not proceeding with the consultation' }
        ] }
      ]
    },

    venopuncion: {
      key: 'venopuncion',
      categoria: 'procedimiento',
      codigo: null,
      titulo: { es: 'Consentimiento Informado — Venopunción', en: 'Informed Consent — Venipuncture' },
      etiquetaSeleccion: { es: 'Venopunción', en: 'Venipuncture' },
      firmantes: ['paciente', 'representante', 'enfermero'],
      requiereAceptacion: true,
      textoAceptacion: {
        es: 'Autorizo al personal de enfermería de la Clínica STEMWELL a realizar el procedimiento de <strong>venopunción</strong> descrito anteriormente.',
        en: 'I authorize the STEMWELL Clinic nursing staff to perform the <strong>venipuncture</strong> procedure described above.'
      },
      cuerpo: [
        { tipo: 'p', texto: { es: 'Declaro de manera libre, voluntaria y en pleno uso de mis facultades mentales, que autorizo al personal de enfermería de la Clínica STEMWELL para realizar los procedimientos descritos a continuación, conforme a las indicaciones del médico tratante.', en: 'I declare freely, voluntarily, and in full use of my mental faculties, that I authorize the STEMWELL Clinic nursing staff to perform the procedures described below, in accordance with the instructions of the treating physician.' } },
        { tipo: 'p', texto: { es: 'Punción: es entendida como el procedimiento mediante el cual se introduce una aguja o catéter por diferentes vías de administración —venosa, arterial, intramuscular, intradérmica, subcutánea o capilar— con el fin de obtener muestras de sangre o administrar medicamentos o sustancias.', en: 'Puncture: understood as the procedure through which a needle or catheter is inserted via different routes of administration — venous, arterial, intramuscular, intradermal, subcutaneous, or capillary — in order to obtain blood samples or administer medications or substances.' } },
        { tipo: 'h', texto: { es: 'Beneficios', en: 'Benefits' } },
        { tipo: 'lista', items: [
          { es: 'Permite diagnóstico oportuno', en: 'Enables timely diagnosis' },
          { es: 'Facilita el tratamiento médico', en: 'Facilitates medical treatment' },
          { es: 'Procedimiento rápido y de bajo riesgo', en: 'Quick, low-risk procedure' }
        ] },
        { tipo: 'h', texto: { es: 'Riesgos y efectos secundarios posibles', en: 'Possible risks and side effects' } },
        { tipo: 'lista', items: [
          { es: 'Dolor o molestia en el sitio de punción', en: 'Pain or discomfort at the puncture site' },
          { es: 'Hematomas', en: 'Bruising' },
          { es: 'Sangrado leve', en: 'Minor bleeding' },
          { es: 'Infección (poco frecuente)', en: 'Infection (uncommon)' },
          { es: 'Mareo o desmayo', en: 'Dizziness or fainting' },
          { es: 'Dificultad para canalizar la vena (requiere varios intentos)', en: 'Difficulty accessing the vein (may require several attempts)' },
          { es: 'Flebitis (inflamación de la vena)', en: 'Phlebitis (inflammation of the vein)' }
        ] },
        { tipo: 'h', texto: { es: 'Contraindicaciones', en: 'Contraindications' } },
        { tipo: 'lista', items: [
          { es: 'Trastornos de la coagulación', en: 'Coagulation disorders' },
          { es: 'Uso de anticoagulantes', en: 'Use of anticoagulants' },
          { es: 'Infección o lesión en el sitio de punción', en: 'Infection or injury at the puncture site' },
          { es: 'Accesos venosos difíciles', en: 'Difficult venous access' },
          { es: 'Historia de síncope vasovagal', en: 'History of vasovagal syncope' }
        ] },
        { tipo: 'h', texto: { es: 'Alternativas', en: 'Alternatives' } },
        { tipo: 'lista', items: [
          { es: 'Uso de otro sitio de punción', en: 'Using a different puncture site' },
          { es: 'Métodos diagnósticos alternativos (según indicación médica)', en: 'Alternative diagnostic methods (per medical advice)' },
          { es: 'No realizar el procedimiento', en: 'Not performing the procedure' }
        ] }
      ]
    }
  };

  // Orden fijo de los documentos generales (siempre incluidos).
  // politica_datos va primero, y además solo se pide una vez por paciente
  // (ver 'unaVezPorPaciente' abajo y la verificación en index.html).
  var ORDEN_GENERAL = ['politica_datos', 'bienvenida', 'descargo_responsabilidad', 'uso_imagen'];

  // Orden fijo de los documentos de procedimiento (se filtran según selección del staff).
  var ORDEN_PROCEDIMIENTOS = ['fisioterapia', 'ortobiologicos', 'oxigenacion_hiperbarica', 'anestesia', 'telemedicina', 'venopuncion'];

  // Roles y sus etiquetas / metadatos para la UI.
  var ROLES = {
    paciente:      { etiqueta: { es: 'Firma del Paciente', en: "Patient's Signature" } },
    representante: { etiqueta: { es: 'Firma del Acudiente / Representante / Testigo', en: "Guardian's / Representative's / Witness's Signature" } },
    medico:        { etiqueta: { es: 'Firma del Médico Tratante', en: "Treating Physician's Signature" } },
    anestesiologo: { etiqueta: { es: 'Firma del Médico Anestesiólogo', en: "Anesthesiologist's Signature" } },
    enfermero:     { etiqueta: { es: 'Firma del Profesional de Enfermería', en: "Nursing Professional's Signature" } }
  };

  return {
    DOCUMENTOS: DOCUMENTOS,
    ORDEN_GENERAL: ORDEN_GENERAL,
    ORDEN_PROCEDIMIENTOS: ORDEN_PROCEDIMIENTOS,
    ROLES: ROLES
  };
}));
