require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { handleIncomingMessage } = require('./commands/handlers');
const { initDB } = require('./services/postgres');
const { initDB: initAgendaDB } = require('./services/agenda');
const adminRouter = require('./admin/router');

const app = express();
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

// ============================================
// CAPTURA DE ERRORES GLOBALES (evita que el
// bot se detenga por errores de red o no capturados)
// ============================================
process.on('uncaughtException', (err) => {
  console.error('🛡️ [uncaughtException] Capturado (el bot continúa):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('🛡️ [unhandledRejection] Capturado (el bot continúa):', reason?.message || reason);
});

// Middlewares
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', adminRouter);

// ============================================
// RUTA: FORMULARIO DE CONSENTIMIENTO
// ============================================
app.get('/consentimiento', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consentimiento', 'index.html'));
});

// ============================================
// RUTA: GENERAR QR DEL FORMULARIO
// ============================================
// ============================================
// ============================================
// RUTA: GENERAR QR DEL FORMULARIO (VERSIÓN HTML)
// ============================================
app.get('/consentimiento/qr', async (req, res) => {
  try {
    const urlConsentimiento = process.env.APP_URL 
      ? `${process.env.APP_URL}/consentimiento` 
      : `https://stemwell.bot.com.ngrok.dev/consentimiento`;

    console.log('🔗 Generando QR para:', urlConsentimiento);

    const qrDataURL = await QRCode.toDataURL(urlConsentimiento, {
      width: 400,
      margin: 2,
      color: {
        dark: '#00B2C2',
        light: '#FFFFFF'
      }
    });

    // Enviar como página HTML con la imagen incrustada
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR - Consentimiento Stemwell</title>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
            flex-direction: column;
            font-family: Arial, sans-serif;
          }
          img {
            max-width: 400px;
            height: auto;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          p {
            margin-top: 20px;
            color: #555;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <img src="${qrDataURL}" alt="QR Consentimiento Stemwell" />
        <p>📋 Escanea para llenar el formulario de consentimiento</p>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('❌ Error al generar el QR:', err);
    res.status(500).json({ mensaje: 'No se pudo generar el código QR' });
  }
});

// ============================================
// RUTA: GUARDAR CONSENTIMIENTO
// ============================================
app.post('/consentimiento/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const { nombres, apellidos, tipo_doc, cedula, telefono, email, firma_img } = req.body;

    if (!nombres || !apellidos || !tipo_doc || !cedula || !telefono || !email || !firma_img) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
    }

    const folio = 'SW-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const fechaActual = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    await pool.query(
      `INSERT INTO consentimientos (folio, nombres, apellidos, tipo_doc, cedula, telefono, email, firma_img, acepto_politica)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [folio, nombres, apellidos, tipo_doc, cedula, telefono, email, firma_img]
    );

    const pdfDir = path.join(__dirname, 'public', 'consentimientos');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    
    const pdfPath = path.join(pdfDir, `${folio}.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const verde = '#00B2C2';
    const gris = '#555555';
    const negro = '#222222';

    const logoPath = path.join(__dirname, 'public', 'images', 'stemwell_header.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 0, 0, { width: doc.page.width });
    }
    doc.y = 110;

    doc.fontSize(16).font('Helvetica-Bold').fillColor(verde)
       .text('POLÍTICA DE TRATAMIENTO DE DATOS PERSONALES – STEMWELL', { align: 'center' });
    doc.moveDown(1);

    const politicaTexto = `En STEMWELL, entendemos que la información personal de nuestros pacientes, usuarios, trabajadores, proveedores y aliados debe ser tratada con responsabilidad, confidencialidad y respeto. Por esta razón, hemos adoptado la presente Política de Tratamiento de Datos Personales, mediante la cual informamos de manera clara cómo recolectamos, utilizamos, almacenamos, protegemos y, cuando sea necesario, compartimos la información personal suministrada en el desarrollo de nuestras actividades asistenciales, administrativas y operativas.

Esta Política se desarrolla conforme a la Constitución Política de Colombia, la Ley 1581 de 2012, el Decreto 1377 de 2013, la Ley 23 de 1981, la Resolución 1995 de 1999 y demás normas aplicables relacionadas con la protección de datos personales, la confidencialidad de la información y la reserva de la historia clínica.

¿QUIÉN ES EL RESPONSABLE DEL TRATAMIENTO DE LOS DATOS?

El responsable del tratamiento de los datos personales es STEMWELL, identificada con NIT 900.439.194-0, con domicilio en la Carrera 13 No. 118-08 de la ciudad de Bogotá D.C.

Para cualquier consulta, actualización, solicitud o reclamo relacionado con el tratamiento de datos personales, los titulares podrán comunicarse a través de los siguientes canales:

• Correo electrónico: info@stemwell.co
• Teléfono: +57 310 406 8755

¿QUÉ INFORMACIÓN RECOPILAMOS Y PARA QUÉ LA USAMOS?

En STEMWELL recolectamos únicamente la información necesaria para prestar adecuadamente nuestros servicios y cumplir nuestras obligaciones legales y contractuales.

En el caso de pacientes y usuarios, los datos personales se utilizan para la prestación de servicios de salud, realización de valoraciones médicas, exámenes médicos, diagnósticos, tratamientos, procedimientos, seguimientos clínicos y procesos de rehabilitación. Asimismo, la información permite elaborar, actualizar y custodiar la historia clínica y demás registros asistenciales requeridos por la normatividad vigente.

También utilizamos la información para gestionar citas médicas, autorizaciones, remisiones, incapacidades, certificados, facturación, procesos administrativos y reportes obligatorios ante entidades del Sistema General de Seguridad Social en Salud, autoridades regulatorias y organismos de control.

Adicionalmente, los datos podrán ser utilizados para atender peticiones, quejas, reclamos, auditorías internas y externas, procesos de calidad y demás actividades necesarias para garantizar una adecuada prestación de los servicios de salud.

Respecto de trabajadores, proveedores y contratistas, la información personal podrá ser utilizada para procesos de selección, contratación, afiliaciones al sistema de seguridad social, control de acceso, cumplimiento de obligaciones laborales, administrativas, financieras y contractuales.

TRATAMIENTO DE DATOS SENSIBLES Y DE SALUD

Algunos de los datos que STEMWELL trata corresponden a datos sensibles, especialmente aquellos relacionados con la salud. Este tipo de información será manejada bajo estrictos estándares de confidencialidad, seguridad y acceso restringido.

El titular no está obligado a autorizar el tratamiento de datos sensibles; sin embargo, en materia asistencial, cierta información resulta indispensable para garantizar una adecuada atención médica y la continuidad del tratamiento. En caso de no suministrarse información esencial, podrían existir limitaciones para la prestación del servicio de salud.

La información clínica y la historia clínica solo serán utilizadas para fines asistenciales, administrativos y legales autorizados por la normatividad vigente.

AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS

La autorización para el tratamiento de datos personales podrá obtenerse mediante formularios físicos o electrónicos, formatos de admisión, consentimientos informados, contratos, grabaciones de llamadas o cualquier conducta inequívoca que permita concluir que el titular otorgó su consentimiento.

El titular podrá solicitar la revocatoria de la autorización o la supresión de sus datos cuando sea procedente legalmente. No obstante, la información que deba conservarse por disposición legal, como la historia clínica, continuará siendo almacenada durante el término exigido por la normatividad aplicable.

¿CON QUIÉN PODEMOS COMPARTIR LA INFORMACIÓN?

Para garantizar la adecuada prestación de los servicios de salud y cumplir obligaciones legales, STEMWELL podrá compartir información personal con EPS, IPS aliadas, aseguradoras, laboratorios clínicos, entidades regulatorias, autoridades administrativas o judiciales, así como proveedores tecnológicos y plataformas utilizadas para la operación de los servicios.

En todos los casos, la Compañía exigirá que terceros implementen medidas adecuadas de seguridad y confidencialidad para proteger la información personal.

DERECHOS DE LOS TITULARES

Toda persona cuyos datos personales sean tratados por STEMWELL tiene derecho a:

• Conocer, actualizar y rectificar su información personal.
• Solicitar prueba de la autorización otorgada.
• Ser informada sobre el uso dado a sus datos.
• Presentar consultas, solicitudes o reclamos.
• Solicitar la supresión de sus datos cuando sea legalmente procedente.
• Presentar quejas ante la Superintendencia de Industria y Comercio.
• Acceder gratuitamente a sus datos personales.

ATENCIÓN DE CONSULTAS Y RECLAMOS

Las consultas o reclamos relacionados con protección de datos personales podrán presentarse a través del correo electrónico info@stemwell.co.

Las consultas serán atendidas dentro de los diez (10) días hábiles siguientes a su recepción. Los reclamos serán respondidos dentro de los quince (15) días hábiles, conforme a los términos establecidos en la legislación colombiana.

SEGURIDAD DE LA INFORMACIÓN

STEMWELL adopta medidas administrativas, técnicas y tecnológicas orientadas a proteger la información personal contra pérdida, alteración, acceso no autorizado, uso indebido o cualquier tratamiento fraudulento.

Entre estas medidas se incluyen controles de acceso físico y digital, protocolos de confidencialidad, acceso restringido a historias clínicas, almacenamiento seguro de información y mecanismos de respaldo y protección de datos.

HISTORIA CLÍNICA

La historia clínica es un documento privado, obligatorio y sometido a reserva legal, conforme a la Ley 23 de 1981 y la Resolución 1995 de 1999.

Únicamente podrán acceder a ella el paciente, las personas autorizadas por este, el personal asistencial involucrado directamente en su atención y las autoridades legalmente facultadas.

STEMWELL conservará las historias clínicas durante el término exigido por la normatividad vigente.

VIGENCIA Y MODIFICACIONES

La presente Política rige a partir de su publicación y permanecerá vigente mientras STEMWELL realice tratamiento de datos personales.

La Compañía podrá actualizar o modificar esta Política en cualquier momento. Cualquier cambio será informado a través de los canales oficiales de STEMWELL.
`;

    const lineas = politicaTexto.split('\n');
    const titulosNegrilla = [
      '¿QUIÉN ES EL RESPONSABLE DEL TRATAMIENTO DE LOS DATOS?',
      '¿QUÉ INFORMACIÓN RECOPILAMOS Y PARA QUÉ LA USAMOS?',
      'TRATAMIENTO DE DATOS SENSIBLES Y DE SALUD',
      'AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS',
      '¿CON QUIÉN PODEMOS COMPARTIR LA INFORMACIÓN?',
      'DERECHOS DE LOS TITULARES',
      'ATENCIÓN DE CONSULTAS Y RECLAMOS',
      'SEGURIDAD DE LA INFORMACIÓN',
      'HISTORIA CLÍNICA',
      'VIGENCIA Y MODIFICACIONES',
    ];

    for (const linea of lineas) {
      const texto = linea.trim();
      if (!texto) {
        doc.moveDown(0.4);
        continue;
      }
      const esTitulo = titulosNegrilla.includes(texto);
      doc.fontSize(esTitulo ? 10 : 9.5)
         .font(esTitulo ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(esTitulo ? verde : negro)
         .text(texto, { align: esTitulo ? 'left' : 'justify', lineGap: 3 });
      if (esTitulo) doc.moveDown(0.3);
    }

    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(verde).stroke();
    doc.moveDown(1);

    const nombreCompleto = `${nombres} ${apellidos}`;
    const tipoDocTexto = tipo_doc === 'CC' ? 'Cédula de Ciudadanía' : 
                         tipo_doc === 'CE' ? 'Cédula de Extranjería' : 
                         tipo_doc === 'PA' ? 'Pasaporte' : 
                         tipo_doc === 'TI' ? 'Tarjeta de Identidad' : 'Documento de identidad';

    doc.fontSize(11).font('Helvetica-Bold').fillColor(verde)
       .text('AUTORIZACIÓN DEL TITULAR', { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(10).font('Helvetica').fillColor(negro)
       .text(`Yo, ${nombreCompleto}, identificado con ${tipoDocTexto} No. ${cedula}, manifiesto que he leído la Política de Tratamiento de Datos Personales y autorizo de manera previa, expresa, informada e inequívoca a STEMWELL para el tratamiento de mis datos personales conforme a las finalidades allí descritas.`, { align: 'justify', lineGap: 4 });
    
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold')
       .text(`Fecha de autorización: ${fechaActual}`);
    
    doc.moveDown(1.5);

    doc.fontSize(9).font('Helvetica').fillColor(gris)
       .text(`Teléfono: ${telefono}`, { continued: true })
       .text(`   |   Correo: ${email}`, { continued: true })
       .text(`   |   Folio: ${folio}`);
    
    doc.moveDown(2);

    doc.fontSize(10).font('Helvetica-Bold').fillColor(verde)
       .text('Firma del Titular:');
    doc.moveDown(0.5);
    
    if (firma_img && firma_img.startsWith('data:image')) {
      const base64Data = firma_img.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      doc.image(imgBuffer, { width: 200, height: 80 });
    }
    
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor(gris)
       .text('(Firma digital registrada conforme a la Ley 527 de 1999)');
    
    doc.moveDown(1.5);

    const pieY = doc.page.height - 50;
    doc.moveTo(50, pieY - 10).lineTo(doc.page.width - 50, pieY - 10).strokeColor(verde).stroke();
    
    doc.fontSize(8).fillColor(gris)
       .text('STEMWELL · NIT 900.439.194-0 · Carrera 13 No. 118-08 · Bogotá D.C.', 50, pieY, { align: 'center' })
       .text('info@stemwell.co · +57 310 406 8755', 50, pieY + 10, { align: 'center' })
       .text(`Documento generado el ${fechaActual} · Folio: ${folio}`, 50, pieY + 20, { align: 'center' });

    doc.end();

    stream.on('finish', () => {
      console.log(`✅ PDF generado: ${pdfPath}`);
    });

    console.log(`✅ Consentimiento guardado: ${folio} - ${nombreCompleto}`);
    
    res.json({
      folio,
      mensaje: 'Consentimiento guardado exitosamente',
      pdf_url: `/consentimientos/${folio}.pdf`
    });

  } catch (err) {
    console.error('❌ Error guardando consentimiento:', err);
    res.status(500).json({
      mensaje: 'Error interno del servidor',
      error: err.message
    });
  } finally {
    await pool.end();
  }
});

// ============================================
// WEBHOOK WHATSAPP
// ============================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado');
    return res.status(200).send(challenge);
  }
  console.log('❌ Verificación fallida');
  res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    
        if (message && contact) {
      handleIncomingMessage(message, contact).catch((err) => {
        console.error('❌ Error procesando mensaje:', err?.message || err);
      });
    }
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'Stemwell Bot',
    timestamp: new Date().toISOString(),
  });
});

async function start() {
  try {
    await initDB();
    await initAgendaDB();
    app.listen(PORT, () => {
      console.log(`🚀 Stemwell Bot corriendo en puerto ${PORT}`);
      console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
      console.log(`📝 Consentimiento: http://localhost:${PORT}/consentimiento`);
      console.log(`📱 QR: http://localhost:${PORT}/consentimiento/qr`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar:', err);
    process.exit(1);
  }
}

start();