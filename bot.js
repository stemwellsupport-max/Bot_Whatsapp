require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { handleIncomingMessage } = require('./commands/handlers');
const { initDB } = require('./services/postgres');

const app = express();
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// RUTA: FORMULARIO DE CONSENTIMIENTO
// ============================================
app.get('/consentimiento', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consentimiento', 'index.html'));
});

// ============================================
// RUTA: GENERAR QR DEL FORMULARIO
// ============================================
app.get('/consentimiento/qr', async (req, res) => {
  try {
    const urlConsentimiento = process.env.APP_URL 
      ? `${process.env.APP_URL}/consentimiento` 
      : `${req.protocol}://${req.get('host')}/consentimiento`;

    const qrBuffer = await QRCode.toBuffer(urlConsentimiento, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#00B2C2',
        light: '#FFFFFF'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);

  } catch (err) {
    console.error('Error al generar QR:', err);
    res.status(500).json({ mensaje: 'No se pudo generar el QR' });
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
    
    await pool.query(
      `INSERT INTO consentimientos (folio, nombres, apellidos, tipo_doc, cedula, telefono, email, firma_img, acepto_politica)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [folio, nombres, apellidos, tipo_doc, cedula, telefono, email, firma_img]
    );

    res.json({
      folio,
      mensaje: 'Consentimiento guardado exitosamente'
    });

  } catch (err) {
    console.error('Error guardando consentimiento:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
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
    console.log('Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    if (message && contact) {
      handleIncomingMessage(message, contact);
    }
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.json({ status: 'online', app: 'Stemwell Bot' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`🚀 Stemwell Bot corriendo en puerto ${PORT}`);
      console.log(`📱 QR: http://localhost:${PORT}/consentimiento/qr`);
    });
  } catch (err) {
    console.error('Error al iniciar:', err);
    process.exit(1);
  }
}

start();