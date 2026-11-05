const express = require('express');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a PostgreSQL LOCAL
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: 'stemwell',
  user: 'crm_user',
  password: process.env.PG_PASSWORD,  // viene del entorno, nunca escrita en el código
  max: 5,
});

// Ruta para guardar el consentimiento
app.post('/consentimiento/guardar', async (req, res) => {
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

    console.log(`✅ Consentimiento guardado: ${folio} - ${nombres} ${apellidos}`);
    res.json({ folio });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`📄 Servidor de consentimiento en http://localhost:${PORT}`);
});