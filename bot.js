require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { handleIncomingMessage } = require('./commands/handlers');
const DOCUMENTOS_ADMISION = require('./public/consentimiento/documentos.js');
const { initDB } = require('./services/postgres');
const { initDB: initAgendaDB } = require('./services/agenda');
const adminRouter = require('./admin/router');
const {
  initHumanControl, processOutbox, claimResumedMessages,
  completeResumedMessage, releaseResumedMessage,
} = require('./services/human-control');

const app = express();
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;
const processedMessageIds = new Map();

function isDuplicateMessage(messageId) {
  if (!messageId) return false;
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.set(messageId, Date.now());
  const cleanup = setTimeout(() => processedMessageIds.delete(messageId), 10 * 60 * 1000);
  if (typeof cleanup.unref === 'function') cleanup.unref();
  return false;
}

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
// RUTA: GUARDAR ADMISIÓN (documentos + firmas del paciente)
// ============================================
app.post('/consentimiento/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });
  const client = await pool.connect();

  try {
    const { paciente, representante, medico, anestesiologo, enfermero, procedimientos, documentos, user_agent } = req.body;

    if (!paciente || !paciente.nombres || !paciente.apellidos || !paciente.tipo_doc || !paciente.cedula || !paciente.telefono || !paciente.email) {
      return res.status(400).json({ mensaje: 'Faltan datos del paciente.' });
    }
    if (!medico || !medico.nombre || !medico.documento) {
      return res.status(400).json({ mensaje: 'Falta el médico tratante.' });
    }
    if (!Array.isArray(documentos) || !documentos.length) {
      return res.status(400).json({ mensaje: 'No se recibieron documentos para guardar.' });
    }

    const DOCS = DOCUMENTOS_ADMISION.DOCUMENTOS;
    for (const d of documentos) {
      const def = DOCS[d.key];
      if (!def) {
        return res.status(400).json({ mensaje: `Documento desconocido: ${d.key}` });
      }
      const rolesRequeridos = (def.firmantes || []).filter((rol) => rol !== 'representante' || !!representante);
      for (const rol of rolesRequeridos) {
        if (!d.firmas || !d.firmas[rol]) {
          return res.status(400).json({ mensaje: `Falta la firma (${rol}) en "${def.titulo}".` });
        }
      }
      if (def.requiereAceptacion && !d.acepto) {
        return res.status(400).json({ mensaje: `Falta la aceptación de "${def.titulo}".` });
      }
    }

    const folio = 'SW-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const fechaActual = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    await client.query('BEGIN');

    const insertAdmision = await client.query(
      `INSERT INTO admisiones
        (folio, nombres, apellidos, tipo_doc, cedula, telefono, email, procedimientos,
         representante_nombre, representante_doc, representante_parentesco,
         medico_nombre, medico_doc, anestesiologo_nombre, anestesiologo_doc,
         enfermero_nombre, enfermero_doc, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        folio, paciente.nombres, paciente.apellidos, paciente.tipo_doc, paciente.cedula, paciente.telefono, paciente.email,
        (procedimientos || []).join(','),
        representante ? representante.nombre : '', representante ? representante.documento : '', representante ? (representante.parentesco || '') : '',
        medico.nombre, medico.documento,
        anestesiologo ? anestesiologo.nombre : '', anestesiologo ? anestesiologo.documento : '',
        enfermero ? enfermero.nombre : '', enfermero ? enfermero.documento : '',
        user_agent || ''
      ]
    );
    const admisionId = insertAdmision.rows[0].id;

    for (const d of documentos) {
      await client.query(
        `INSERT INTO admisiones_documentos
          (admision_id, documento_key, documento_titulo, documento_codigo, acepto, checklist, seleccion,
           firma_paciente, firma_representante, firma_medico, firma_anestesiologo, firma_enfermero)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          admisionId, d.key, d.titulo, d.codigo || '', !!d.acepto,
          JSON.stringify(d.checklist || {}), JSON.stringify(d.seleccion || {}),
          (d.firmas && d.firmas.paciente) || null,
          (d.firmas && d.firmas.representante) || null,
          (d.firmas && d.firmas.medico) || null,
          (d.firmas && d.firmas.anestesiologo) || null,
          (d.firmas && d.firmas.enfermero) || null,
        ]
      );
    }

    await client.query('COMMIT');

    const pdfDir = path.join(__dirname, 'public', 'consentimientos');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, `${folio}.pdf`);

    generarPDFAdmision({ pdfPath, folio, fechaActual, paciente, representante, medico, anestesiologo, enfermero, documentos })
      .then(() => console.log(`✅ PDF de admisión generado: ${pdfPath}`))
      .catch((err) => console.error('❌ Error generando PDF de admisión:', err));

    console.log(`✅ Admisión guardada: ${folio} - ${paciente.nombres} ${paciente.apellidos} (${documentos.length} documentos)`);

    res.json({
      folio,
      mensaje: 'Admisión guardada exitosamente',
      pdf_url: `/consentimientos/${folio}.pdf`
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error guardando admisión:', err);
    res.status(500).json({
      mensaje: 'Error interno del servidor',
      error: err.message
    });
  } finally {
    client.release();
    await pool.end();
  }
});

// ============================================
// GENERACIÓN DEL PDF COMBINADO DE ADMISIÓN
// (una página por documento, con el texto oficial + firmas)
// ============================================
function generarPDFAdmision({ pdfPath, folio, fechaActual, paciente, representante, medico, anestesiologo, enfermero, documentos }) {
  return new Promise((resolve, reject) => {
    const DOCS = DOCUMENTOS_ADMISION.DOCUMENTOS;
    const ROLES = DOCUMENTOS_ADMISION.ROLES;
    const verde = '#00B2C2';
    const gris = '#555555';
    const negro = '#222222';

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    const logoPath = path.join(__dirname, 'public', 'images', 'stemwell_header.png');
    const medicoNombreTexto = (medico && medico.nombre) || '';

    function sustituir(texto) {
      return String(texto).replace(/\{\{medico\}\}/g, medicoNombreTexto || '____________________');
    }

    function encabezado() {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 0, 0, { width: doc.page.width });
      }
      doc.y = 110;
    }

    function piePagina() {
      const pieY = doc.page.height - 50;
      doc.moveTo(50, pieY - 10).lineTo(doc.page.width - 50, pieY - 10).strokeColor(verde).stroke();
      doc.fontSize(8).fillColor(gris)
        .text('STEMWELL · NIT 900.439.194-0 · Carrera 13 No. 118-08 · Bogotá D.C.', 50, pieY, { align: 'center' })
        .text('info@stemwell.co · +57 310 406 8755', 50, pieY + 10, { align: 'center' })
        .text(`Documento generado el ${fechaActual} · Folio: ${folio}`, 50, pieY + 20, { align: 'center' });
    }

    const firmantesInfo = {
      paciente: { nombre: `${paciente.nombres} ${paciente.apellidos}`, doc: `${paciente.tipo_doc} ${paciente.cedula}` },
      representante: representante ? { nombre: representante.nombre, doc: representante.documento } : null,
      medico: medico ? { nombre: medico.nombre, doc: medico.documento } : null,
      anestesiologo: anestesiologo ? { nombre: anestesiologo.nombre, doc: anestesiologo.documento } : null,
      enfermero: enfermero ? { nombre: enfermero.nombre, doc: enfermero.documento } : null,
    };

    documentos.forEach((d) => {
      const def = DOCS[d.key];
      doc.addPage();
      encabezado();

      doc.fontSize(15).font('Helvetica-Bold').fillColor(verde)
         .text(((def && def.titulo) || d.titulo || '').toUpperCase(), { align: 'center' });
      if (def && def.codigo) {
        doc.fontSize(9).font('Helvetica').fillColor(gris).text(def.codigo, { align: 'center' });
      }
      doc.moveDown(1);

      doc.fontSize(9).font('Helvetica').fillColor(negro)
         .text(`Paciente: ${paciente.nombres} ${paciente.apellidos}   |   Documento: ${paciente.tipo_doc} ${paciente.cedula}   |   Fecha: ${fechaActual}`);
      doc.moveDown(0.8);

      ((def && def.cuerpo) || []).forEach((item, idx) => {
        if (item.tipo === 'h') {
          doc.fontSize(10.5).font('Helvetica-Bold').fillColor(verde).text(sustituir(item.texto));
          doc.moveDown(0.3);
        } else if (item.tipo === 'p') {
          doc.fontSize(9.5).font('Helvetica').fillColor(negro).text(sustituir(item.texto), { align: 'justify', lineGap: 2 });
          doc.moveDown(0.4);
        } else if (item.tipo === 'lista') {
          item.items.forEach((t) => {
            doc.fontSize(9.5).font('Helvetica').fillColor(negro).text('•  ' + sustituir(t), { lineGap: 2 });
          });
          doc.moveDown(0.4);
        } else if (item.tipo === 'checklist') {
          doc.fontSize(10).font('Helvetica-Bold').fillColor(verde).text(item.titulo + (item.codigo ? ` (${item.codigo})` : ''));
          doc.moveDown(0.2);
          item.grupos.forEach((grupo, gIdx) => {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(negro).text(grupo.titulo);
            grupo.items.forEach((texto, iIdx) => {
              const itemId = 'chk_' + idx + '_' + gIdx + '_' + iIdx;
              const val = d.checklist && d.checklist[itemId];
              const valTexto = val === 'si' ? 'Sí' : val === 'no' ? 'No' : '—';
              doc.fontSize(9).font('Helvetica').fillColor(negro).text(`${texto}: ${valTexto}`);
            });
          });
          doc.moveDown(0.4);
        } else if (item.tipo === 'seleccion') {
          const val = (d.seleccion && d.seleccion[item.clave]) || '—';
          doc.fontSize(9.5).font('Helvetica-Bold').fillColor(negro).text(`${item.etiqueta}: ${val}`);
          doc.moveDown(0.4);
        }
      });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(verde).stroke();
      doc.moveDown(1);

      ((def && def.firmantes) || []).forEach((rol) => {
        const info = firmantesInfo[rol];
        if (!info) return;
        if (doc.y > doc.page.height - 180) {
          doc.addPage();
          encabezado();
        }
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(verde)
           .text(`${ROLES[rol].etiqueta}: ${info.nombre}  ·  Doc. ${info.doc || ''}`);
        doc.moveDown(0.3);

        const firmaImg = d.firmas && d.firmas[rol];
        if (firmaImg && firmaImg.startsWith('data:image')) {
          try {
            const base64Data = firmaImg.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imgBuffer, { width: 160, height: 65 });
          } catch (e) {
            // firma inválida: se omite la imagen pero se conserva el registro en BD
          }
        }
        doc.moveDown(1);
      });

      piePagina();
    });

    doc.end();
  });
}

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
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = value.contacts || [];
        for (const message of value.messages || []) {
          if (isDuplicateMessage(message.id)) {
            console.log(`WHATSAPP_DUPLICATE_IGNORED ${message.id}`);
            continue;
          }
          const contact = contacts.find(item => String(item.wa_id || '') === String(message.from || ''))
            || { wa_id: message.from, profile: {} };
          handleIncomingMessage(message, contact).catch((err) => {
            console.error('❌ Error procesando mensaje:', err?.message || err);
          });
        }
      }
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
    await initHumanControl();
    setInterval(() => processOutbox().catch(err => console.error('âŒ Outbox:', err.message)), 2000);
    setInterval(async () => {
      const pending = await claimResumedMessages();
      for (const item of pending) {
        try {
          await handleIncomingMessage(
            { from: item.telefono, type: 'text', text: { body: item.mensaje } },
            { wa_id: item.telefono, profile: { name: item.nombre } },
            { skipInboundLog: true },
          );
          await completeResumedMessage(item.telefono);
        } catch (err) {
          console.error('âŒ Error retomando conversacion:', err?.message || err);
          await releaseResumedMessage(item.telefono);
        }
      }
    }, 3000);
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
