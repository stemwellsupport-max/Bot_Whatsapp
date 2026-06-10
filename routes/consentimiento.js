const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');

// Configuración de PostgreSQL
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'stemwell',
  user: process.env.PG_USER || 'crm_user',
  password: process.env.PG_PASSWORD || 'crm2024',
});

// Directorio para PDFs
const PDF_DIR = path.join(__dirname, '..', 'pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// Crear tabla si no existe
async function initTabla() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consentimientos (
        id               SERIAL PRIMARY KEY,
        folio            VARCHAR(20) UNIQUE NOT NULL,
        nombres          TEXT NOT NULL,
        apellidos        TEXT NOT NULL,
        tipo_documento   VARCHAR(60) NOT NULL,
        numero_documento VARCHAR(30) NOT NULL,
        telefono         VARCHAR(30),
        email            VARCHAR(120),
        acepto_politica  BOOLEAN DEFAULT TRUE,
        firma_img        TEXT,
        pdf_path         TEXT,
        ip_address       VARCHAR(60),
        user_agent       TEXT,
        fecha_registro   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Tabla consentimientos lista');
  } catch (e) {
    console.error('⚠️ Error creando tabla:', e.message);
  }
}
initTabla();

// Generar folio único
function generarFolio() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `STW-${ts}-${rand}`;
}

// Generar PDF
function generarPDF(datos, folio) {
  return new Promise((resolve, reject) => {
    const filename = `consentimiento_${folio}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    const doc = new PDFDocument({ margin: 60, size: 'A4' });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    const VERDE = '#1A7A5E';
    const TEXTO = '#1C2B26';
    const BORDE = '#D4E6DF';

    // Encabezado
    doc.rect(0, 0, 595, 80).fill(VERDE);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text('STEMWELL', 60, 22);
    doc.font('Helvetica').fontSize(10).fillColor('#FFFFFF').text('Medicina Regenerativa · Bogotá D.C.', 60, 47);
    doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF').text('info@stemwell.co · +57 310 406 8755', 60, 62);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF').text(folio, 430, 37, { align: 'right', width: 105 });

    let y = 100;

    // Título
    doc.font('Helvetica-Bold').fontSize(14).fillColor(VERDE)
       .text('AUTORIZACIÓN DE TRATAMIENTO DE DATOS PERSONALES', 60, y, { width: 475, align: 'center' });
    y += 40;

    // Declaración
    const fechaFormateada = new Date().toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const declaracion = `Yo, ${datos.nombres} ${datos.apellidos}, identificado(a) con ${datos.tipo_documento} No. ${datos.numero_documento}, manifiesto que he leído la Política de Tratamiento de Datos Personales de STEMWELL y autorizo de manera PREVIA, EXPRESA, INFORMADA E INEQUÍVOCA a STEMWELL para el tratamiento de mis datos personales conforme a las finalidades allí descritas, en cumplimiento de la Ley 1581 de 2012.

Fecha y hora: ${fechaFormateada}`;

    doc.rect(55, y - 6, 485, 85).fill('#E8F5F0').stroke(BORDE);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXTO).text(declaracion, 65, y, { width: 465, lineGap: 3 });
    y += 95;

    // Firma
    if (datos.firma_img && datos.firma_img.startsWith('data:image/png;base64,')) {
      const base64Data = datos.firma_img.replace('data:image/png;base64,', '');
      const firmaBuffer = Buffer.from(base64Data, 'base64');
      doc.rect(55, y - 4, 260, 90).fill('#FAFAFA').stroke(BORDE);
      doc.image(firmaBuffer, 60, y, { width: 250, height: 80, fit: [250, 80] });
    }

    doc.end();
    stream.on('finish', () => resolve({ filepath, filename }));
    stream.on('error', reject);
  });
}

// ============================================
// POST /firmar
// ============================================
router.post('/firmar', async (req, res) => {
  try {
    const {
      nombres, apellidos, tipo_documento, numero_documento,
      telefono, email, firma_img, acepto_politica, user_agent
    } = req.body;

    // Validaciones
    if (!nombres || !apellidos || !tipo_documento || !numero_documento) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!firma_img) {
      return res.status(400).json({ error: 'Firma requerida' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const folio = generarFolio();

    // Generar PDF
    let pdfInfo = null;
    try {
      pdfInfo = await generarPDF({ ...req.body, folio }, folio);
    } catch (pdfErr) {
      console.error('Error generando PDF:', pdfErr.message);
    }

    // Guardar en BD
    await pool.query(`
      INSERT INTO consentimientos
        (folio, nombres, apellidos, tipo_documento, numero_documento,
         telefono, email, acepto_politica, firma_img, pdf_path, ip_address, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      folio, nombres, apellidos, tipo_documento, numero_documento,
      telefono || null, email || null, true,
      firma_img, pdfInfo?.filename || null, ip, user_agent || null
    ]);

    console.log(`✅ Consentimiento registrado: ${folio} - ${nombres} ${apellidos}`);

    res.json({
      ok: true,
      folio,
      mensaje: 'Autorización registrada exitosamente',
      pdf_url: pdfInfo ? `/pdf/${folio}` : null,
    });

  } catch (err) {
    console.error('Error en /firmar:', err);
    res.status(500).json({ error: 'Error interno', mensaje: err.message });
  }
});

// ============================================
// GET /pdf/:folio
// ============================================
router.get('/pdf/:folio', async (req, res) => {
  try {
    const { folio } = req.params;

    const result = await pool.query(
      'SELECT pdf_path, nombres, apellidos FROM consentimientos WHERE folio = $1',
      [folio]
    );
    if (!result.rows.length) {
      return res.status(404).send('Folio no encontrado');
    }

    const { pdf_path, nombres, apellidos } = result.rows[0];
    if (!pdf_path) {
      return res.status(404).send('PDF no disponible');
    }

    const filepath = path.join(PDF_DIR, pdf_path);
    if (!fs.existsSync(filepath)) {
      return res.status(404).send('Archivo no encontrado');
    }

    const downloadName = `Stemwell_Consentimiento_${nombres}_${apellidos}_${folio}.pdf`.replace(/\s+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filepath).pipe(res);

  } catch (err) {
    console.error('Error descargando PDF:', err);
    res.status(500).send('Error al descargar');
  }
});

// ============================================
// GET /consentimiento - servir el HTML
// ============================================
router.get('/consentimiento', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'consentimiento.html'));
});

module.exports = router;