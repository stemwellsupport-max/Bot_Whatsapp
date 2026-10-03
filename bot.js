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
const { enviarCorreoAdmision, enviarCorreoEncuesta, enviarCorreoAdmisionCirugias } = require('./services/email');
const { initDB } = require('./services/postgres');
const { initDB: initAgendaDB, apiCrearLead } = require('./services/agenda');
const adminRouter = require('./admin/router');
const { permitirEnvio, pareceRobot } = require('./services/antiabuso');
const { protegerModulo, iniciarSesion, cerrarSesion } = require('./services/acceso');
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

// El bot está detrás de un solo proxy (el túnel ngrok). Con esto req.ip es la IP
// real del paciente (la que ngrok anota) y no la del túnel; se usa para limitar
// envíos repetidos en las encuestas.
app.set('trust proxy', 1);

// ============================================
// CONTRASEÑA DEL MÓDULO PRINCIPAL (ver services/acceso.js)
// Todo /consentimiento/... pide clave, excepto la encuesta de satisfacción y la
// calificación rápida, que siguen públicas para los pacientes.
// La clave se define en MODULO_PASSWORD (archivo .env).
// ============================================
app.use(protegerModulo);
app.post('/consentimiento/login', express.json(), iniciarSesion);
app.get('/consentimiento/salir', cerrarSesion);

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
      calificacion_instalaciones, claridad_informacion, comentarios_mejora, opinion, user_agent
    } = req.body;
    const en = idioma === 'en';

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

    // Robots: se responde "ok" sin guardar nada para que no sepan que fueron detectados.
    if (pareceRobot(req.body, 8000)) {
      console.warn(`🚫 Encuesta descartada (parece robot) desde ${req.ip}`);
      return res.json({ mensaje: 'Encuesta guardada exitosamente' });
    }

    // Una sola encuesta por persona y por fecha (mismo nombre, sin importar mayúsculas).
    const yaExiste = await pool.query(
      `SELECT 1 FROM encuestas_satisfaccion
       WHERE lower(trim(nombre_completo)) = lower(trim($1)) AND fecha_registro = $2 LIMIT 1`,
      [nombre_completo, fecha_registro]
    );
    if (yaExiste.rowCount) {
      return res.status(409).json({
        mensaje: en
          ? 'We already received a survey with this name for this date. Thank you!'
          : 'Ya recibimos una encuesta con este nombre en esta fecha. ¡Gracias!'
      });
    }

    if (!permitirEnvio(req.ip)) {
      console.warn(`🚫 Encuesta bloqueada por exceso de envíos desde ${req.ip}`);
      return res.status(429).json({
        mensaje: en
          ? 'Too many submissions from this connection. Please try again later.'
          : 'Se han enviado demasiadas encuestas desde esta conexión. Inténtalo más tarde.'
      });
    }

    await pool.query(
      `INSERT INTO encuestas_satisfaccion
        (idioma, fecha_registro, nombre_completo, procedimientos, procedimiento_otro,
         calificacion_personal, recomendaria, satisfaccion_general, calificacion_instalaciones,
         claridad_informacion, comentarios_mejora, opinion, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        idioma === 'en' ? 'en' : 'es', fecha_registro, nombre_completo, procedimientos.join(','), procedimiento_otro || '',
        calificacion_personal, recomendaria, satisfaccion_general, calificacion_instalaciones,
        claridad_informacion, comentarios_mejora.trim(), (opinion || '').trim(), user_agent || ''
      ]
    );

    console.log(`✅ Encuesta de satisfacción guardada: ${nombre_completo} (${idioma})`);

    enviarCorreoEncuesta({
      idioma, fecha_registro, nombre_completo, procedimientos, procedimiento_otro,
      calificacion_personal, recomendaria, satisfaccion_general,
      calificacion_instalaciones, claridad_informacion, comentarios_mejora, opinion,
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
// RUTA: GUARDAR CALIFICACIÓN RÁPIDA (link /consentimiento/calificacion/)
// Mismas 5 calificaciones de la encuesta + opinión libre (opcional). No pide
// ni guarda nombre, fecha ni procedimiento, y va a su propia tabla para no
// mezclarse con la encuesta de satisfacción completa.
// ============================================
app.post('/consentimiento/calificacion/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const {
      idioma, calificacion_personal, recomendaria, satisfaccion_general,
      calificacion_instalaciones, claridad_informacion, opinion, user_agent
    } = req.body;

    // Máximo de cada escala: personal, recomendaría y satisfacción van de 1 a 4;
    // instalaciones y claridad de 1 a 5 (igual que la encuesta completa).
    const escalas = [
      ['calificacion_personal', calificacion_personal, 4],
      ['recomendaria', recomendaria, 4],
      ['satisfaccion_general', satisfaccion_general, 4],
      ['calificacion_instalaciones', calificacion_instalaciones, 5],
      ['claridad_informacion', claridad_informacion, 5],
    ];
    for (const [campo, valor, max] of escalas) {
      if (!Number.isInteger(valor) || valor < 1 || valor > max) {
        return res.status(400).json({ mensaje: `Falta responder: ${campo}` });
      }
    }

    if (pareceRobot(req.body, 4000)) {
      console.warn(`🚫 Calificación descartada (parece robot) desde ${req.ip}`);
      return res.json({ mensaje: 'Calificación guardada exitosamente' });
    }

    if (!permitirEnvio(req.ip)) {
      console.warn(`🚫 Calificación bloqueada por exceso de envíos desde ${req.ip}`);
      return res.status(429).json({
        mensaje: idioma === 'en'
          ? 'Too many submissions from this connection. Please try again later.'
          : 'Se han enviado demasiadas calificaciones desde esta conexión. Inténtalo más tarde.'
      });
    }

    await pool.query(
      `INSERT INTO calificaciones_rapidas
        (idioma, calificacion_personal, recomendaria, satisfaccion_general,
         calificacion_instalaciones, claridad_informacion, opinion, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        idioma === 'en' ? 'en' : 'es', calificacion_personal, recomendaria, satisfaccion_general,
        calificacion_instalaciones, claridad_informacion, (opinion || '').trim(), user_agent || ''
      ]
    );

    console.log(`✅ Calificación rápida guardada (${idioma})`);
    res.json({ mensaje: 'Calificación guardada exitosamente' });

  } catch (err) {
    console.error('❌ Error guardando calificación rápida:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: GUARDAR REGISTRO DE VISITANTE (Planilla SGSST-F02)
// ============================================
app.post('/consentimiento/registro/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const {
      idioma, fecha, nombre, documento, rh, motivo_visita, eps,
      contacto_emergencia, telefono, hora_ingreso, hora_salida, firma_img, user_agent
    } = req.body;

    if (!fecha || !nombre || !documento || !motivo_visita || !contacto_emergencia || !telefono || !firma_img) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
    }

    await pool.query(
      `INSERT INTO registro_visitantes
        (fecha, nombre, documento, rh, motivo_visita, eps, contacto_emergencia, telefono,
         hora_ingreso, hora_salida, firma_img, idioma, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        fecha, nombre.trim(), documento.trim(), rh || '', motivo_visita.trim(), (eps || '').trim(),
        contacto_emergencia.trim(), telefono.trim(), hora_ingreso || '', hora_salida || '',
        firma_img, idioma === 'en' ? 'en' : 'es', user_agent || ''
      ]
    );

    console.log(`✅ Registro de visitante guardado: ${nombre} (${documento})`);
    res.json({ mensaje: 'Registro guardado exitosamente' });

  } catch (err) {
    console.error('❌ Error guardando registro de visitante:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: VISITANTES YA REGISTRADOS ANTES (para autocompletar la 2da+ visita
// y evitar que vuelvan a escribir mal sus datos — un documento por persona,
// con los datos de su registro más reciente)
// ============================================
app.get('/consentimiento/registro/visitantes-previos', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    // Descarta documentos placeholder obvios (todo ceros/nueves, muy cortos)
    // para no perpetuar la basura que motivó esta función en primer lugar.
    const r = await pool.query(
      `SELECT DISTINCT ON (documento) documento, nombre, rh, eps, contacto_emergencia, telefono
       FROM registro_visitantes
       WHERE documento IS NOT NULL
         AND length(trim(documento)) >= 6
         AND documento !~ '^(\\d)\\1*$'
       ORDER BY documento, creado_en DESC`
    );
    const visitantes = r.rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    res.json({ visitantes });
  } catch (err) {
    console.error('❌ Error obteniendo visitantes previos:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: LISTA DE VISITANTES DE HOY PENDIENTES DE MARCAR SALIDA
// ============================================
app.get('/consentimiento/registro/pendientes/lista', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const r = await pool.query(
      `SELECT id, nombre, documento, motivo_visita, hora_ingreso
       FROM registro_visitantes
       WHERE fecha = CURRENT_DATE AND (hora_salida IS NULL OR hora_salida = '')
       ORDER BY hora_ingreso ASC`
    );
    res.json({ pendientes: r.rows });
  } catch (err) {
    console.error('❌ Error obteniendo pendientes de salida:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTAS: PLANILLA DE REGISTRO DIARIA (para consultar, no para llenar)
// /consentimiento/registro/planilla/            -> página (public/.../planilla/index.html)
// /consentimiento/registro/planilla/datos       -> visitantes de un día (?fecha=YYYY-MM-DD)
// /consentimiento/registro/planilla/firma/:id   -> imagen de la firma de un visitante
// Quedan detrás de la contraseña del módulo (services/acceso.js).
// ============================================
app.get('/consentimiento/registro/planilla/datos', async (req, res) => {
  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ mensaje: 'La fecha debe tener el formato AAAA-MM-DD.' });
  }
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    // La firma no viaja aquí (pesa ~35 KB por visitante): solo se avisa si existe
    // y la página la pide aparte por /firma/:id.
    const r = await pool.query(
      `SELECT id, nombre, documento, rh, motivo_visita, eps, contacto_emergencia, telefono,
              hora_ingreso, hora_salida, (COALESCE(firma_img, '') <> '') AS tiene_firma
       FROM registro_visitantes
       WHERE fecha = $1
       ORDER BY NULLIF(hora_ingreso, '') ASC NULLS LAST, id ASC`,
      [fecha]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ fecha, visitantes: r.rows });
  } catch (err) {
    console.error('❌ Error obteniendo la planilla diaria:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  } finally {
    await pool.end();
  }
});

app.get('/consentimiento/registro/planilla/firma/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).end();
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const r = await pool.query(`SELECT firma_img FROM registro_visitantes WHERE id = $1`, [id]);
    const dataUrl = r.rows[0] && r.rows[0].firma_img;
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return res.status(404).end();
    res.set('Content-Type', `image/${m[1]}`);
    res.set('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(m[2], 'base64'));
  } catch (err) {
    console.error('❌ Error obteniendo la firma del visitante:', err);
    res.status(500).end();
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: MARCAR LA HORA DE SALIDA DE UN VISITANTE
// ============================================
app.post('/consentimiento/registro/pendientes/:id/salida', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const id = parseInt(req.params.id, 10);
    const { hora_salida } = req.body;
    if (!id || !hora_salida) {
      return res.status(400).json({ mensaje: 'Faltan datos.' });
    }

    const r = await pool.query(
      `UPDATE registro_visitantes SET hora_salida = $1
       WHERE id = $2 AND (hora_salida IS NULL OR hora_salida = '')
       RETURNING id`,
      [hora_salida, id]
    );

    if (!r.rows.length) {
      return res.status(404).json({ mensaje: 'No encontrado o ya tenía una salida registrada.' });
    }

    console.log(`✅ Salida registrada: visitante #${id} a las ${hora_salida}`);
    res.json({ mensaje: 'Hora de salida registrada' });
  } catch (err) {
    console.error('❌ Error registrando salida:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: ADMISIÓN DE SALA DE CIRUGÍAS (mismo formato que la "Hoja de
// Admisión de Pacientes" / SIAU-FR-007 del CRM) — la llena recepción antes
// de entregar la tablet al paciente. Deliberadamente independiente del
// CRM: no crea ni actualiza nada allá, solo queda su propio registro aquí.
// ============================================
app.post('/consentimiento/admision-cirugias/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const {
      idioma, nombres_apellidos, identificacion, sexo, edad, fecha_nacimiento, rh,
      telefono, correo, estado_civil, direccion, lugar_residencia, ocupacion,
      procedimiento, doctora, hgm, peso, estatura, responsable, parentesco,
      celular_responsable, entidad, numero_afiliacion, particular, fecha_ingreso,
      tipo_afiliacion, servicio, eps, prepagada, servicio_complementario, user_agent
    } = req.body;

    if (!nombres_apellidos) {
      return res.status(400).json({ mensaje: 'Falta el nombre del paciente.' });
    }

    await pool.query(
      `INSERT INTO admision_sala_cirugias
        (nombres_apellidos, identificacion, sexo, edad, fecha_nacimiento, rh,
         telefono, correo, estado_civil, direccion, lugar_residencia, ocupacion,
         procedimiento, doctora, hgm, peso, estatura, responsable, parentesco,
         celular_responsable, entidad, numero_afiliacion, particular, fecha_ingreso,
         tipo_afiliacion, servicio, eps, prepagada, servicio_complementario,
         idioma, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [
        nombres_apellidos.trim(), identificacion || '', sexo || '', edad || '',
        fecha_nacimiento || '', rh || '', telefono || '', correo || '',
        estado_civil || '', direccion || '', lugar_residencia || '', ocupacion || '',
        procedimiento || '', doctora || '', hgm || '', peso || '', estatura || '',
        responsable || '', parentesco || '', celular_responsable || '', entidad || '',
        numero_afiliacion || '', particular || '', fecha_ingreso || '',
        tipo_afiliacion || '', servicio || '', eps || '', prepagada || '',
        servicio_complementario || '', idioma === 'en' ? 'en' : 'es', user_agent || ''
      ]
    );

    console.log(`✅ Admisión de sala de cirugías guardada: ${nombres_apellidos}`);

    enviarCorreoAdmisionCirugias({
      nombres_apellidos, identificacion, sexo, edad, fecha_nacimiento, rh,
      telefono, correo, estado_civil, direccion, lugar_residencia, ocupacion,
      procedimiento, doctora, hgm, peso, estatura, responsable, parentesco,
      celular_responsable, entidad, numero_afiliacion, particular, fecha_ingreso,
      tipo_afiliacion, servicio, eps, prepagada, servicio_complementario
    })
      .then((destinatarios) => console.log(`✅ Correo de admisión de sala de cirugías enviado a: ${destinatarios.join(', ')}`))
      .catch((err) => console.error('❌ Error enviando correo de admisión de sala de cirugías:', err));

    res.json({ mensaje: 'Admisión guardada exitosamente' });

  } catch (err) {
    console.error('❌ Error guardando admisión de sala de cirugías:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: FORMATO DE REGISTRO PARA PACIENTES NUEVOS (llegan caminando, sin
// estar todavía en el CRM) — al guardar, además crea/actualiza el lead en
// la base compartida del CRM (misma BD `stemwell`), canal 'Walk-in'.
// ============================================
app.post('/consentimiento/paciente-nuevo/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const { idioma, nombre, telefono, correo, informacion, firma_img, user_agent } = req.body;

    if (!nombre || !telefono || !firma_img) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
    }

    // Todo paciente que se registra aquí debe llegar al CRM como Walk-in, ya
    // con asesor, pipeline y origen del consentimiento (firma del formulario).
    // Si el canal original del lead ya existía (p. ej. Meta) se conserva.
    let leadId = null;
    const datosLead = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: (correo || '').trim(),
      canal: 'Walk-in',
      notas: (informacion || '').trim(),
      idioma: idioma === 'en' ? 'en' : 'es',
      consentimientoFuente: 'walkin_formulario_firmado',
    };
    for (let intento = 1; intento <= 2 && !leadId; intento++) {
      try {
        leadId = await apiCrearLead(datosLead);
      } catch (leadErr) {
        console.error(`⚠️ No se pudo crear/actualizar el lead en el CRM (intento ${intento}/2):`, leadErr.message);
        if (intento < 2) await new Promise(r => setTimeout(r, 800));
      }
    }
    // Si sigue sin lead NO se bloquea el registro: el formato queda guardado
    // (lead_id vacío) y se puede vincular a mano.

    await pool.query(
      `INSERT INTO registro_pacientes_nuevos
        (nombre, telefono, correo, informacion, firma_img, lead_id, idioma, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        nombre.trim(), telefono.trim(), (correo || '').trim(), (informacion || '').trim(),
        firma_img, leadId, idioma === 'en' ? 'en' : 'es', user_agent || ''
      ]
    );

    console.log(`✅ Registro de paciente nuevo guardado: ${nombre} (lead #${leadId || 'sin CRM'})`);
    res.json({ mensaje: 'Registro guardado exitosamente', lead_id: leadId });

  } catch (err) {
    console.error('❌ Error guardando registro de paciente nuevo:', err);
    res.status(500).json({ mensaje: 'Error interno del servidor', error: err.message });
  } finally {
    await pool.end();
  }
});

// ============================================
// RUTA: PLANILLA DE INGRESO DE EQUIPOS (GAD-FR-009)
// ============================================
app.post('/consentimiento/equipos/guardar', async (req, res) => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stemwell',
    user: process.env.PG_USER || 'crm_user',
    password: process.env.PG_PASSWORD || 'crm2024',
  });

  try {
    const {
      idioma, fecha, nombre, cedula, contacto, registro_equipos,
      hora_ingreso, hora_salida, firma_img, user_agent
    } = req.body;

    if (!fecha || !nombre || !cedula || !contacto || !registro_equipos || !firma_img) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
    }

    await pool.query(
      `INSERT INTO registro_equipos
        (fecha, nombre, cedula, contacto, registro_equipos, hora_ingreso, hora_salida,
         firma_img, idioma, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        fecha, nombre.trim(), cedula.trim(), contacto.trim(), registro_equipos.trim(),
        hora_ingreso || '', hora_salida || '', firma_img,
        idioma === 'en' ? 'en' : 'es', user_agent || ''
      ]
    );

    console.log(`✅ Registro de ingreso de equipos guardado: ${nombre} (${cedula})`);
    res.json({ mensaje: 'Registro guardado exitosamente' });

  } catch (err) {
    console.error('❌ Error guardando registro de equipos:', err);
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

// One shared pool for the receipts: Meta sends several per message, so opening a pool each time would be wasteful.
let statusPool = null;
async function recordMessageStatus(status) {
  if (!status || !status.id || !status.status) return;
  if (!statusPool) {
    statusPool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'stemwell',
      user: process.env.PG_USER || 'crm_user',
      password: process.env.PG_PASSWORD || 'crm2024',
      max: 2,
    });
  }
  const error = (status.errors || [])[0] || {};
  const at = Number(status.timestamp) > 0 ? new Date(Number(status.timestamp) * 1000) : new Date();
  await statusPool.query(
    `INSERT INTO wa_message_statuses (wa_message_id, status, status_at, error_code, error_title)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (wa_message_id, status) DO NOTHING`,
    [status.id, status.status, at, error.code || null, (error.title || error.message || null)],
  );
}

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = value.contacts || [];
        // Delivery receipts (sent / delivered / read / failed) for campaign analytics.
        for (const status of value.statuses || []) {
          recordMessageStatus(status).catch((err) => {
            console.error('WHATSAPP_STATUS_ERROR', err?.message || err);
          });
        }
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
