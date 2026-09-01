// ============================================================
// services/email.js
// Envío de los documentos de admisión firmados por correo:
// al paciente, a recepción siempre, a enfermería si hubo
// procedimiento, y copia a soporte.
// ============================================================
const nodemailer = require('nodemailer');
require('dotenv').config();

const RECEPCION = ['recepcion.stemwell@gmail.com', 'drivestemwell@gmail.com'];
const ENFERMERIA = 'enfermeria@stemwell.co';
const SOPORTE = process.env.BACKOFFICE_EMAIL || 'stemwellsupport@gmail.com';

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

// Expuesto aparte para poder probar la lista de destinatarios sin enviar correos reales.
function construirDestinatarios({ pacienteEmail, procedimientos }) {
  const destinatarios = new Set();
  if (pacienteEmail) destinatarios.add(pacienteEmail);
  RECEPCION.forEach((e) => destinatarios.add(e));
  destinatarios.add(SOPORTE);
  if (Array.isArray(procedimientos) && procedimientos.length > 0) {
    destinatarios.add(ENFERMERIA);
  }
  return Array.from(destinatarios);
}

async function enviarCorreoAdmision({ paciente, procedimientos, folio, pdfPath }) {
  const destinatarios = construirDestinatarios({ pacienteEmail: paciente.email, procedimientos });
  const nombreCompleto = `${paciente.nombres} ${paciente.apellidos}`;
  const tieneProcedimientos = Array.isArray(procedimientos) && procedimientos.length > 0;

  const html = `
    <div style="font-family: Arial, sans-serif; color:#1C2B26; font-size:14px; line-height:1.6;">
      <p>Hola,</p>
      <p>Se registró una nueva admisión en <strong>Stemwell</strong>. Adjunto va el PDF con los documentos firmados.</p>
      <table cellpadding="4" cellspacing="0" style="margin:12px 0;">
        <tr><td><strong>Paciente</strong></td><td>${nombreCompleto}</td></tr>
        <tr><td><strong>Documento</strong></td><td>${paciente.tipo_doc || ''} ${paciente.cedula || ''}</td></tr>
        <tr><td><strong>Teléfono</strong></td><td>${paciente.telefono || ''}</td></tr>
        <tr><td><strong>Folio</strong></td><td>${folio}</td></tr>
        ${tieneProcedimientos ? `<tr><td><strong>Procedimiento(s)</strong></td><td>${procedimientos.join(', ')}</td></tr>` : ''}
      </table>
      <p style="color:#6B7B76; font-size:12px;">STEMWELL · NIT 900.439.194-0 · Carrera 13 No. 118-08 · Bogotá D.C.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Stemwell'}" <${process.env.SMTP_USER}>`,
    to: destinatarios,
    subject: `Admisión registrada — ${nombreCompleto} (${folio})`,
    html,
    attachments: [{ filename: `${folio}.pdf`, path: pdfPath }],
  });

  return destinatarios;
}

// ============================================================
// Envío de notificación cuando un paciente completa la encuesta
// de satisfacción. Siempre en español (correo interno para el
// personal), sin importar el idioma en que el paciente respondió.
// ============================================================
const PROCEDIMIENTOS_ENCUESTA = {
  ortobiologicos: 'Ortobiológicos (Células madre, exosomas, PRP)',
  camara_hiperbarica: 'Cámara Hiperbárica',
  terapia_avanzada: 'Terapia Avanzada',
  consulta_medica: 'Consulta médica',
  infusion_multivitaminicos: 'Infusión endovenosa de complejos multivitamínicos',
  otro: 'Otro',
};
const ESCALA4 = { 4: 'Muy bueno', 3: 'Bueno', 2: 'Malo', 1: 'Muy malo' };
const ESCALA5 = { 5: 'Muy buena', 4: 'Buena', 3: 'Regular', 2: 'Mala', 1: 'Muy mala' };
const ESCALA_RECOMENDACION = { 4: 'Definitivamente sí', 3: 'Probablemente sí', 2: 'Probablemente no', 1: 'Definitivamente no' };

function construirDestinatariosEncuesta() {
  const destinatarios = new Set();
  RECEPCION.forEach((e) => destinatarios.add(e));
  destinatarios.add(SOPORTE);
  return Array.from(destinatarios);
}

async function enviarCorreoEncuesta({
  idioma, fecha_registro, nombre_completo, procedimientos, procedimiento_otro,
  calificacion_personal, recomendaria, satisfaccion_general,
  calificacion_instalaciones, claridad_informacion, comentarios_mejora,
}) {
  const destinatarios = construirDestinatariosEncuesta();

  const listaProcedimientos = (procedimientos || []).map((key) => {
    if (key === 'otro' && procedimiento_otro) return `Otro: ${procedimiento_otro}`;
    return PROCEDIMIENTOS_ENCUESTA[key] || key;
  }).join(', ');

  const html = `
    <div style="font-family: Arial, sans-serif; color:#1C2B26; font-size:14px; line-height:1.6;">
      <p>Hola,</p>
      <p>Se registró una nueva <strong>encuesta de satisfacción</strong> en Stemwell.</p>
      <table cellpadding="4" cellspacing="0" style="margin:12px 0;">
        <tr><td><strong>Paciente</strong></td><td>${nombre_completo}</td></tr>
        <tr><td><strong>Fecha</strong></td><td>${fecha_registro}</td></tr>
        <tr><td><strong>Procedimiento(s)</strong></td><td>${listaProcedimientos}</td></tr>
        <tr><td><strong>Idioma de la encuesta</strong></td><td>${idioma === 'en' ? 'Inglés' : 'Español'}</td></tr>
      </table>
      <table cellpadding="4" cellspacing="0" style="margin:12px 0; border-collapse:collapse;">
        <tr><td style="border-bottom:1px solid #D4E6DF;"><strong>Personal médico/asistencial</strong></td><td style="border-bottom:1px solid #D4E6DF;">${ESCALA4[calificacion_personal] || calificacion_personal}</td></tr>
        <tr><td style="border-bottom:1px solid #D4E6DF;"><strong>¿Recomendaría la Clínica?</strong></td><td style="border-bottom:1px solid #D4E6DF;">${ESCALA_RECOMENDACION[recomendaria] || recomendaria}</td></tr>
        <tr><td style="border-bottom:1px solid #D4E6DF;"><strong>Satisfacción general</strong></td><td style="border-bottom:1px solid #D4E6DF;">${ESCALA4[satisfaccion_general] || satisfaccion_general}</td></tr>
        <tr><td style="border-bottom:1px solid #D4E6DF;"><strong>Instalaciones</strong></td><td style="border-bottom:1px solid #D4E6DF;">${ESCALA5[calificacion_instalaciones] || calificacion_instalaciones}</td></tr>
        <tr><td><strong>Claridad de la información</strong></td><td>${ESCALA5[claridad_informacion] || claridad_informacion}</td></tr>
      </table>
      <p><strong>¿En qué podríamos mejorar?</strong><br>${(comentarios_mejora || '').replace(/\n/g, '<br>')}</p>
      <p style="color:#6B7B76; font-size:12px;">STEMWELL · NIT 900.439.194-0 · Carrera 13 No. 118-08 · Bogotá D.C.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Stemwell'}" <${process.env.SMTP_USER}>`,
    to: destinatarios,
    subject: `Nueva encuesta de satisfacción — ${nombre_completo}`,
    html,
  });

  return destinatarios;
}

module.exports = {
  enviarCorreoAdmision, construirDestinatarios, enviarCorreoEncuesta, construirDestinatariosEncuesta, getTransporter,
  PROCEDIMIENTOS_ENCUESTA, ESCALA4, ESCALA5, ESCALA_RECOMENDACION,
};
