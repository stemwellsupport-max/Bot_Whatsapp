require('dotenv').config();
const express = require('express');
const path    = require('path');
const { handleIncomingMessage } = require('./commands/handlers');
const { initDB }                = require('./services/mysql');
const adminRouter               = require('./admin/router');

const app          = express();
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT         = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'admin/public')));

// ── Panel Admin ──────────────────────────────
app.use('/admin', adminRouter);

// ── Webhook GET: verificación Meta ───────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado');
    return res.status(200).send(challenge);
  }
  console.log('❌ Verificación fallida');
  res.sendStatus(403);
});

// ── Webhook POST: mensajes entrantes ─────────
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    if (message && contact) {
      handleIncomingMessage(message, contact); // async, no bloqueamos
    }
  }
  res.sendStatus(200); // siempre 200 para Meta
});

// ── Health check ─────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:    'online',
    app:       process.env.APP_NAME || 'Stemwell Bot',
    timestamp: new Date().toISOString(),
  });
});

// ── Arrancar ──────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`🚀 ${process.env.APP_NAME || 'Stemwell Bot'} corriendo en puerto ${PORT}`);
      console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
      console.log(`🖥️  Admin KB: http://localhost:${PORT}/admin`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar:', err);
    process.exit(1);
  }
}

start();