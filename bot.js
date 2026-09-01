require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { handleIncomingMessage } = require('./commands/handlers');
const DOCUMENTOS_ADMISION = require('./public/consentimiento/documentos.js');
// Extrae el texto en el idioma pedido de un campo bilingüe { es, en };
// si el valor ya es un string (o no existe), lo devuelve tal cual.
function L(valor, lang) {
  if (valor && typeof valor === 'object') return valor[lang] || valor.es || '';
  return valor || '';
}
const { enviarCorreoAdmision, enviarCorreoEncuesta } = require('./services/email');
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
// RUTA: ¿ESTE PACIENTE YA FIRMÓ LA POLÍTICA DE DATOS?
// (se firma una sola vez por paciente, no en cada visita)
// ============================================
app.get('/consentimiento/verificar-politica', async (req, res) => {
  const cedula = (req.query.cedula || '').trim();
  if (!cedula) return res.json({ politica_firmada: false });

  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const r = await pool.query(
      `SELECT 1 FROM admisiones_documentos ad
       JOIN admisiones a ON a.id = ad.admision_id
       WHERE a.cedula = $1 AND ad.documento_key = 'politica_datos' AND ad.acepto = true
       LIMIT 1`,
      [cedula]
    );
    res.json({ politica_firmada: r.rows.length > 0 });
  } catch (err) {
    console.error('❌ Error verificando política de datos:', err);
    // Ante un error de BD, se prefiere volver a mostrar la política (más seguro
    // legalmente) a asumir que ya fue firmada.
    res.json({ politica_firmada: false });
  } finally {
    await pool.end();
  }
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
// RUTA: IMAGEN PNG DE UN QR (para incrustar con <img>, ej. en la
// pantalla de agradecimiento de la encuesta). ?url= apunta a un enlace
// externo completo (ej. reseñas de Google); ?path= apunta a una ruta
// interna del sitio. Si no se pasa ninguno, apunta a la encuesta.
// ============================================
app.get('/consentimiento/qr-imagen', async (req, res) => {
  try {
    const base = process.env.APP_URL || 'https://stemwell.bot.com.ngrok.dev';
    let url;
    if (req.query.url && /^https?:\/\//i.test(req.query.url)) {
      url = req.query.url;
    } else {
      const path = req.query.path && req.query.path.startsWith('/') ? req.query.path : '/consentimiento/encuesta/';
      url = `${base}${path}`;
    }

    const buffer = await QRCode.toBuffer(url, {
      width: 700,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('❌ Error al generar la imagen QR:', err);
    res.status(500).end();
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
    const { paciente, representante, medico, anestesiologo, enfermero, procedimientos, documentos, user_agent, idioma } = req.body;
    const lang = idioma === 'en' ? 'en' : 'es';

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
          return res.status(400).json({ mensaje: `Falta la firma (${rol}) en "${L(def.titulo, lang)}".` });
        }
      }
      if (def.requiereAceptacion && !d.acepto) {
        return res.status(400).json({ mensaje: `Falta la aceptación de "${L(def.titulo, lang)}".` });
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
         enfermero_nombre, enfermero_doc, idioma, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        folio, paciente.nombres, paciente.apellidos, paciente.tipo_doc, paciente.cedula, paciente.telefono, paciente.email,
        (procedimientos || []).join(','),
        representante ? representante.nombre : '', representante ? representante.documento : '', representante ? (representante.parentesco || '') : '',
        medico.nombre, medico.documento,
        anestesiologo ? anestesiologo.nombre : '', anestesiologo ? anestesiologo.documento : '',
        enfermero ? enfermero.nombre : '', enfermero ? enfermero.documento : '',
        lang, user_agent || ''
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

    generarPDFAdmision({ pdfPath, folio, fechaActual, paciente, representante, medico, anestesiologo, enfermero, documentos, idioma: lang })
      .then(() => {
        console.log(`✅ PDF de admisión generado: ${pdfPath}`);
        return enviarCorreoAdmision({ paciente, procedimientos, folio, pdfPath });
      })
      .then((destinatarios) => {
        if (destinatarios) console.log(`✅ Correo de admisión enviado a: ${destinatarios.join(', ')}`);
      })
      .catch((err) => console.error('❌ Error generando/enviando PDF de admisión:', err));

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
// RUTA: GUARDAR ENCUESTA DE SATISFACCIÓN (ES/EN)
// ============================================
app.post('/consentimiento/encuesta/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const {
      idioma, fecha_registro, nombre_completo, procedimientos, procedimiento_otro,
      calificacion_personal, recomendaria, satisfaccion_general,
      calificacion_instalaciones, claridad_informacion, comentarios_mejora, user_agent
    } = req.body;

    if (!fecha_registro || !nombre_completo || !Array.isArray(procedimientos) || !procedimientos.length) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
    }
    const escalas = { calificacion_personal, recomendaria, satisfaccion_general, calificacion_instalaciones, claridad_informacion };
    for (const [campo, valor] of Object.entries(escalas)) {
      if (!Number.isInteger(valor)) {
        return res.status(400).json({ mensaje: `Falta responder: ${campo}` });
      }
    }
    if (!comentarios_mejora || !comentarios_mejora.trim()) {
      return res.status(400).json({ mensaje: 'Falta el campo de comentarios.' });
    }

    await pool.query(
      `INSERT INTO encuestas_satisfaccion
        (idioma, fecha_registro, nombre_completo, procedimientos, procedimiento_otro,
         calificacion_personal, recomendaria, satisfaccion_general, calificacion_instalaciones,
         claridad_informacion, comentarios_mejora, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        idioma === 'en' ? 'en' : 'es', fecha_registro, nombre_completo, procedimientos.join(','), procedimiento_otro || '',
        calificacion_personal, recomendaria, satisfaccion_general, calificacion_instalaciones,
        claridad_informacion, comentarios_mejora.trim(), user_agent || ''
      ]
    );

    console.log(`✅ Encuesta de satisfacción guardada: ${nombre_completo} (${idioma})`);

    enviarCorreoEncuesta({
      idioma, fecha_registro, nombre_completo, procedimientos, procedimiento_otro,
      calificacion_personal, recomendaria, satisfaccion_general,
      calificacion_instalaciones, claridad_informacion, comentarios_mejora,
    })
      .then((destinatarios) => console.log(`✅ Correo de encuesta enviado a: ${destinatarios.join(', ')}`))
      .catch((err) => console.error('❌ Error enviando correo de encuesta:', err));

    res.json({ mensaje: 'Encuesta guardada exitosamente' });

  } catch (err) {
    console.error('❌ Error guardando encuesta:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: RESUMEN DE LA ENCUESTA DE SATISFACCIÓN (para /consentimiento/graficos)
// Devuelve conteos crudos (valor + cantidad); el cliente traduce las
// etiquetas al idioma elegido, igual que el resto del sitio.
// ============================================
app.get('/consentimiento/encuesta/resumen', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    // Filtro opcional por año/mes (?anio=2026&mes=03). Si no se pasan, se
    // usan todas las encuestas históricas.
    const anio = /^\d{4}$/.test(req.query.anio) ? req.query.anio : null;
    const mes = /^\d{1,2}$/.test(req.query.mes) ? String(req.query.mes).padStart(2, '0') : null;
    const where = [];
    const params = [];
    if (anio) {
      params.push(anio);
      where.push(`EXTRACT(YEAR FROM fecha_registro) = $${params.length}`);
    }
    if (anio && mes) {
      params.push(mes);
      where.push(`EXTRACT(MONTH FROM fecha_registro) = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const withField = (extra) => (whereSql ? `${whereSql} AND ${extra}` : `WHERE ${extra}`);

    const totalRes = await pool.query(`SELECT COUNT(*) AS n FROM encuestas_satisfaccion ${whereSql}`, params);
    const total = parseInt(totalRes.rows[0].n, 10);

    async function distribucion(campo) {
      const r = await pool.query(
        `SELECT ${campo} AS valor, COUNT(*) AS n FROM encuestas_satisfaccion ${withField(`${campo} IS NOT NULL`)} GROUP BY ${campo} ORDER BY ${campo} DESC`,
        params
      );
      return r.rows.map((row) => ({ valor: row.valor, count: parseInt(row.n, 10) }));
    }

    const generales = {
      calificacion_personal: await distribucion('calificacion_personal'),
      recomendaria: await distribucion('recomendaria'),
      satisfaccion_general: await distribucion('satisfaccion_general'),
      calificacion_instalaciones: await distribucion('calificacion_instalaciones'),
      claridad_informacion: await distribucion('claridad_informacion'),
    };

    const idiomasRes = await pool.query(`SELECT idioma, COUNT(*) AS n FROM encuestas_satisfaccion ${whereSql} GROUP BY idioma`, params);
    const idiomas = idiomasRes.rows.map((row) => ({ idioma: row.idioma, count: parseInt(row.n, 10) }));

    const procRes = await pool.query(`SELECT procedimientos FROM encuestas_satisfaccion ${withField(`procedimientos <> ''`)}`, params);
    const procCounts = {};
    procRes.rows.forEach((row) => {
      (row.procedimientos || '').split(',').forEach((k) => {
        const key = k.trim();
        if (!key) return;
        procCounts[key] = (procCounts[key] || 0) + 1;
      });
    });
    const procedimientos = Object.entries(procCounts)
      .map(([clave, count]) => ({ clave, count }))
      .sort((a, b) => b.count - a.count);

    // Años reales con datos, independiente del filtro actual, para poblar el selector.
    const aniosRes = await pool.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM fecha_registro)::int AS anio FROM encuestas_satisfaccion ORDER BY anio DESC`
    );
    const anios = aniosRes.rows.map((row) => row.anio);

    res.json({ total, generales, procedimientos, idiomas, anios });
  } catch (err) {
    console.error('❌ Error obteniendo resumen de encuestas:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// GENERACIÓN DEL PDF COMBINADO DE ADMISIÓN
// (una página por documento, con el texto oficial + firmas)
// ============================================
function generarPDFAdmision({ pdfPath, folio, fechaActual, paciente, representante, medico, anestesiologo, enfermero, documentos, idioma }) {
  return new Promise((resolve, reject) => {
    const lang = idioma === 'en' ? 'en' : 'es';
    const DOCS = DOCUMENTOS_ADMISION.DOCUMENTOS;
    const ROLES = DOCUMENTOS_ADMISION.ROLES;
    const verde = '#00B2C2';
    const gris = '#555555';
    const negro = '#222222';

    const T = lang === 'en'
      ? { paciente: 'Patient', documento: 'Document', fecha: 'Date', generado: 'Document generated on', folio: 'Folio', si: 'Yes', no: 'No', sinResp: '—', doc: 'Doc.' }
      : { paciente: 'Paciente', documento: 'Documento', fecha: 'Fecha', generado: 'Documento generado el', folio: 'Folio', si: 'Sí', no: 'No', sinResp: '—', doc: 'Doc.' };

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    const logoPath = path.join(__dirname, 'public', 'images', 'stemwell_header.png');
    const medicoNombreTexto = (medico && medico.nombre) || '';

    function sustituir(texto) {
      return String(L(texto, lang)).replace(/\{\{medico\}\}/g, medicoNombreTexto || '____________________');
    }

    // Busca, dentro de las opciones bilingües de una pregunta de selección
    // o checklist, la que coincide con el valor canónico guardado (siempre
    // en español) y devuelve su texto en el idioma del PDF.
    function textoOpcion(opciones, valorGuardado) {
      if (!valorGuardado) return T.sinResp;
      var encontrada = (opciones || []).find(function (op) { return L(op, 'es') === valorGuardado; });
      return encontrada ? L(encontrada, lang) : valorGuardado;
    }

    function encabezado() {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 0, 0, { width: doc.page.width });
      }
      doc.y = 110;
    }
    // Dibuja el logo también en las páginas que PDFKit agrega automáticamente
    // cuando el contenido de un documento largo desborda una sola página.
    doc.on('pageAdded', encabezado);

    function piePagina() {
      const pieY = doc.page.height - 50;
      // El pie va pegado al margen inferior: se desactiva momentáneamente el
      // salto de página automático de PDFKit para que no lo empuje a una
      // página nueva por estar justo en el límite del margen.
      const margenInferiorOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(50, pieY - 10).lineTo(doc.page.width - 50, pieY - 10).strokeColor(verde).stroke();
      doc.fontSize(8).fillColor(gris)
        .text('STEMWELL · NIT 900.439.194-0 · Carrera 13 No. 118-08 · Bogotá D.C.', 50, pieY, { align: 'center' })
        .text('info@stemwell.co · +57 310 406 8755', 50, pieY + 10, { align: 'center' })
        .text(`${T.generado} ${fechaActual} · ${T.folio}: ${folio}`, 50, pieY + 20, { align: 'center' });
      doc.page.margins.bottom = margenInferiorOriginal;
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

      doc.fontSize(15).font('Helvetica-Bold').fillColor(verde)
         .text((L((def && def.titulo) || d.titulo, lang) || '').toUpperCase(), { align: 'center' });
      if (def && def.codigo) {
        doc.fontSize(9).font('Helvetica').fillColor(gris).text(def.codigo, { align: 'center' });
      }
      doc.moveDown(1);

      doc.fontSize(9).font('Helvetica').fillColor(negro)
         .text(`${T.paciente}: ${paciente.nombres} ${paciente.apellidos}   |   ${T.documento}: ${paciente.tipo_doc} ${paciente.cedula}   |   ${T.fecha}: ${fechaActual}`);
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
          doc.fontSize(10).font('Helvetica-Bold').fillColor(verde).text(L(item.titulo, lang) + (item.codigo ? ` (${item.codigo})` : ''));
          doc.moveDown(0.2);
          if (item.subtitulo) {
            doc.fontSize(9).font('Helvetica').fillColor(negro).text(L(item.subtitulo, lang));
            doc.moveDown(0.15);
          }
          item.grupos.forEach((grupo, gIdx) => {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(negro).text(L(grupo.titulo, lang));
            grupo.items.forEach((texto, iIdx) => {
              const itemId = 'chk_' + idx + '_' + gIdx + '_' + iIdx;
              const val = d.checklist && d.checklist[itemId];
              const valTexto = val === 'si' ? T.si : val === 'no' ? T.no : T.sinResp;
              doc.fontSize(9).font('Helvetica').fillColor(negro).text(`${L(texto, lang)}: ${valTexto}`);
            });
          });
          doc.moveDown(0.4);
        } else if (item.tipo === 'seleccion') {
          const valGuardado = (d.seleccion && d.seleccion[item.clave]) || null;
          const valTexto = textoOpcion(item.opciones, valGuardado);
          doc.fontSize(9.5).font('Helvetica-Bold').fillColor(negro).text(`${L(item.etiqueta, lang)}: ${valTexto}`);
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
        }
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(verde)
           .text(`${L(ROLES[rol].etiqueta, lang)}: ${info.nombre}  ·  ${T.doc} ${info.doc || ''}`);
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
