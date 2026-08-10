const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'stemwell',
  user:     process.env.PG_USER     || 'crm_user',
  password: process.env.PG_PASSWORD || 'crm2024',
  ssl:      false,
  max: 10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 10000,
});

async function initDB() {
  const client = await pool.connect();
  try {
    // Contactos enriquecidos con datos de lead
    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_contactos (
        id                  SERIAL PRIMARY KEY,
        telefono            VARCHAR(30) UNIQUE NOT NULL,
        nombre              VARCHAR(150) DEFAULT '',
        apellido            VARCHAR(150) DEFAULT '',
        email               VARCHAR(255) DEFAULT '',
        -- Lead scoring
        interes             VARCHAR(100) DEFAULT '',
        dolor_principal     VARCHAR(200) DEFAULT '',
        enfermedad          VARCHAR(200) DEFAULT '',
        nivel_interes       VARCHAR(10)  DEFAULT 'cold',
        quiere_agendar      BOOLEAN      DEFAULT FALSE,
        objecion            VARCHAR(300) DEFAULT '',
        -- Control
        ultimo_msg          TIMESTAMP DEFAULT NULL,
        creado_en           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_articulos (
        id             SERIAL PRIMARY KEY,
        categoria      VARCHAR(100) NOT NULL,
        pregunta       VARCHAR(500) NOT NULL,
        respuesta      TEXT NOT NULL,
        palabras_clave VARCHAR(500) DEFAULT '',
        activo         SMALLINT DEFAULT 1,
        creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_conversaciones (
        id         SERIAL PRIMARY KEY,
        telefono   VARCHAR(30) NOT NULL,
        nombre     VARCHAR(150) DEFAULT '',
        direccion  VARCHAR(10) NOT NULL,
        mensaje    TEXT NOT NULL,
        fecha      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 🆕 TABLA DE CONOCIMIENTO APRENDIDO POR IA
    await client.query(`
      CREATE TABLE IF NOT EXISTS ia_conocimiento (
        id                  SERIAL PRIMARY KEY,
        pregunta_original   TEXT NOT NULL,
        pregunta_normalizada VARCHAR(500) NOT NULL,
        respuesta           TEXT NOT NULL,
        idioma              VARCHAR(5) DEFAULT 'es',
        veces_usada         INT DEFAULT 1,
        ultima_uso          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        creado_en           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confianza           FLOAT DEFAULT 0.5,
        activo              BOOLEAN DEFAULT TRUE,
        UNIQUE(pregunta_normalizada)
      );
    `);

        // Índices para búsqueda rápida
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pregunta_normalizada 
      ON ia_conocimiento(pregunta_normalizada);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ia_conocimiento_activo 
      ON ia_conocimiento(activo, idioma);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ia_conocimiento_confianza 
      ON ia_conocimiento(confianza DESC, veces_usada DESC);
    `);

        // 🆕 TABLA DE ESTADOS PERSISTENTES DE CONVERSACIÓN
    // Guarda la máquina de estados del flujo de agenda y la sesión
    // del usuario para que no se pierdan al reiniciar el bot.
    // La PK es compuesta (telefono + tipo) para permitir coexistir
    // el estado de 'agenda' y el de 'sesion' por contacto sin que
    // se sobrescriban mutuamente.
    await client.query(`
      CREATE TABLE IF NOT EXISTS wa_estados (
        telefono     VARCHAR(30) NOT NULL,
        tipo         VARCHAR(20) NOT NULL DEFAULT 'agenda',
        estado       JSONB NOT NULL DEFAULT '{}',
        actualizado  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (telefono, tipo)
      );
    `);
    // Migración defensiva: si una versión anterior creó la tabla con
    // PK solo en telefono, la corregimos a (telefono, tipo).
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'wa_estados'::regclass
            AND contype = 'p'
            AND pg_get_constraintdef(oid) = 'PRIMARY KEY (telefono)'
        ) THEN
          ALTER TABLE wa_estados DROP CONSTRAINT wa_estados_pkey;
          ALTER TABLE wa_estados ADD PRIMARY KEY (telefono, tipo);
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wa_estados_actualizado 
      ON wa_estados(actualizado);
    `);

    // Agregar columnas opcionales si no existen (migraciones seguras)
    await client.query(`
      ALTER TABLE wa_contactos 
        ADD COLUMN IF NOT EXISTS canal VARCHAR(50) DEFAULT 'WhatsApp',
        ADD COLUMN IF NOT EXISTS notas TEXT DEFAULT '';
    `).catch(() => {});

    console.log('✅ Tablas PostgreSQL verificadas/creadas');
  } finally {
    client.release();
  }
}

// ── CONTACTOS ─────────────────────────────────────────────
async function saveContacto({ nombre, apellido, email, telefono }) {
  console.log(`💾 [saveContacto] Intentando guardar: ${telefono} | ${nombre} | ${email}`);
  try {
    await pool.query(
      `INSERT INTO wa_contactos (telefono, nombre, apellido, email, ultimo_msg)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (telefono) DO UPDATE SET
         nombre   = COALESCE(NULLIF($2,''), wa_contactos.nombre),
         apellido = COALESCE(NULLIF($3,''), wa_contactos.apellido),
         email    = COALESCE(NULLIF($4,''), wa_contactos.email),
         ultimo_msg = NOW()`,
      [telefono, nombre||'', apellido||'', email||'']
    );
    const result = await pool.query('SELECT * FROM wa_contactos WHERE telefono=$1',[telefono]);
    console.log('✅ [saveContacto] Registro actualizado:', result.rows[0]);
    return result.rows[0];
  } catch (err) {
    console.error('❌ [saveContacto] Error:', err.message);
    throw err;
  }
}

async function getContactoByTelefono(telefono) {
  const r = await pool.query('SELECT * FROM wa_contactos WHERE telefono=$1',[telefono]);
}

async function getContactos() {
  const r = await pool.query(
    'SELECT * FROM wa_contactos ORDER BY ultimo_msg DESC NULLS LAST, creado_en DESC'
  );
  return r.rows;
}

async function upsertContactoBasico(telefono, nombre) {
  await pool.query(
    `INSERT INTO wa_contactos (telefono, nombre, ultimo_msg)
     VALUES ($1, $2, NOW())
     ON CONFLICT (telefono) DO UPDATE SET
       nombre     = CASE WHEN wa_contactos.nombre='' AND $2!='' THEN $2 ELSE wa_contactos.nombre END,
       ultimo_msg = NOW()`,
    [telefono, nombre||'']
  );
}

async function updateLeadData(telefono, data) {
  const campos = [];
  const vals   = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    campos.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!campos.length) return;
  vals.push(telefono);
  await pool.query(
    `UPDATE wa_contactos SET ${campos.join(', ')} WHERE telefono = $${i}`,
    vals
  ).catch(() => {});
}

// ── BASE DE CONOCIMIENTO (KB) ──────────────────────────────────
async function buscarEnKB(texto) {
  const limpio   = texto.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9 ]/g,' ').trim();
  const palabras = limpio.split(' ').filter(p => p.length > 2);
  if (!palabras.length) return [];
  const conds  = palabras.map((_,i)=>
    `(pregunta ILIKE $${i*3+1} OR respuesta ILIKE $${i*3+2} OR palabras_clave ILIKE $${i*3+3})`
  ).join(' OR ');
  const params = palabras.flatMap(p=>[`%${p}%`,`%${p}%`,`%${p}%`]);
  const r = await pool.query(
    `SELECT * FROM kb_articulos WHERE activo=1 AND (${conds}) LIMIT 3`, params
  );
  return r.rows;
}

async function getCategorias() {
  const r = await pool.query(
    `SELECT categoria, COUNT(*)::int AS total FROM kb_articulos WHERE activo=1 GROUP BY categoria ORDER BY categoria`
  );
  return r.rows;
}

async function getAllArticulos() {
  const r = await pool.query(
    `SELECT * FROM kb_articulos WHERE activo=1 ORDER BY categoria, id`
  );
  return r.rows;
}

async function saveArticuloKB({ categoria, pregunta, respuesta, palabras_clave='' }) {
  const r = await pool.query(
    `INSERT INTO kb_articulos (categoria,pregunta,respuesta,palabras_clave) VALUES ($1,$2,$3,$4) RETURNING id`,
    [categoria, pregunta, respuesta, palabras_clave]
  );
  return r.rows[0].id;
}

async function updateArticuloKB(id, { categoria, pregunta, respuesta, palabras_clave }) {
  await pool.query(
    `UPDATE kb_articulos SET categoria=$1,pregunta=$2,respuesta=$3,palabras_clave=$4 WHERE id=$5`,
    [categoria, pregunta, respuesta, palabras_clave||'', id]
  );
}

async function deleteArticuloKB(id) {
  await pool.query('UPDATE kb_articulos SET activo=0 WHERE id=$1',[id]);
}

// ── CONVERSACIONES ────────────────────────────────────────
async function logMensaje(telefono, nombre, direccion, mensaje) {
  try {
    await pool.query(
      `INSERT INTO wa_conversaciones (telefono,nombre,direccion,mensaje) VALUES ($1,$2,$3,$4)`,
      [telefono, nombre||'', direccion, mensaje.slice(0,4000)]
    );
  } catch(e) {}
}

async function getConversacionesRecientes(limite=50) {
  const r = await pool.query(
    `SELECT telefono, nombre,
            MAX(fecha) AS ultimo,
            COUNT(*)::int AS total_msgs,
            SUM(CASE WHEN direccion='entrada' THEN 1 ELSE 0 END)::int AS msgs_entrada,
            SUM(CASE WHEN direccion='salida'  THEN 1 ELSE 0 END)::int AS msgs_salida
     FROM wa_conversaciones
     GROUP BY telefono, nombre
     ORDER BY ultimo DESC LIMIT $1`,
    [limite]
  );
  return r.rows;
}

async function getMensajesDeContacto(telefono, limite=100) {
  const r = await pool.query(
    `SELECT * FROM wa_conversaciones WHERE telefono=$1 ORDER BY fecha ASC LIMIT $2`,
    [telefono, limite]
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 FUNCIONES DE HISTORIAL PARA IA
// ═══════════════════════════════════════════════════════════════════════════
async function getHistorialMensajes(telefono, limite = 10) {
  try {
    const result = await pool.query(
      `SELECT mensaje, direccion, fecha 
       FROM wa_conversaciones 
       WHERE telefono = $1 
       ORDER BY fecha DESC 
       LIMIT $2`,
      [telefono, limite]
    );
    return result.rows.reverse();
  } catch (error) {
    console.error('❌ [getHistorialMensajes] Error:', error.message);
    return [];
  }
}

async function guardarMensajeRAG(telefono, mensaje, rol) {
  return logMensaje(telefono, '', rol, mensaje);
}

async function getHistorialRAG(telefono, limite = 10) {
  return getHistorialMensajes(telefono, limite);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 FUNCIONES DE APRENDIZAJE AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════════════════

// Normalizar pregunta para búsqueda
function normalizarPregunta(pregunta) {
  return pregunta
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Buscar en conocimiento aprendido
async function buscarEnConocimiento(pregunta, idioma) {
  const preguntaNorm = normalizarPregunta(pregunta);
  const palabras = preguntaNorm.split(' ').filter(p => p.length > 3);
  
  if (palabras.length === 0) return null;
  
  const condiciones = palabras.map((_, i) => 
    `pregunta_normalizada LIKE $${i + 1}`
  ).join(' OR ');
  
  const params = palabras.map(p => `%${p}%`);
  params.push(idioma);
  
  const result = await pool.query(
    `SELECT * FROM ia_conocimiento 
     WHERE activo = TRUE 
       AND idioma = $${params.length}
       AND (${condiciones})
     ORDER BY veces_usada DESC, confianza DESC 
     LIMIT 1`,
    params
  );
  
  if (result.rows.length > 0) {
    await pool.query(
      `UPDATE ia_conocimiento 
       SET veces_usada = veces_usada + 1, 
           ultima_uso = NOW() 
       WHERE id = $1`,
      [result.rows[0].id]
    );
    return result.rows[0];
  }
  
  return null;
}

// Guardar nueva respuesta aprendida
async function guardarConocimiento(pregunta, respuesta, idioma, confianza = 0.7) {
  const preguntaNorm = normalizarPregunta(pregunta);
  
  const existente = await pool.query(
    `SELECT * FROM ia_conocimiento WHERE pregunta_normalizada = $1`,
    [preguntaNorm]
  );
  
  if (existente.rows.length > 0) {
    await pool.query(
      `UPDATE ia_conocimiento 
       SET respuesta = $1, 
           confianza = (confianza + $2) / 2,
           ultima_uso = NOW()
       WHERE id = $3`,
      [respuesta, confianza, existente.rows[0].id]
    );
    return existente.rows[0].id;
  }
  
  const result = await pool.query(
    `INSERT INTO ia_conocimiento 
     (pregunta_original, pregunta_normalizada, respuesta, idioma, confianza)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [pregunta, preguntaNorm, respuesta, idioma, confianza]
  );
  
  console.log(`📚 [Aprendizaje] Nueva pregunta guardada: "${pregunta.substring(0, 50)}..."`);
  return result.rows[0].id;
}

// Incrementar confianza de una respuesta
async function aumentarConfianza(id) {
  await pool.query(
    `UPDATE ia_conocimiento 
     SET confianza = LEAST(confianza + 0.1, 1.0)
     WHERE id = $1`,
    [id]
  );
}

// Obtener estadísticas de aprendizaje
async function getEstadisticasAprendizaje() {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total,
      SUM(veces_usada) as usos_totales,
      AVG(confianza) as confianza_promedio,
      idioma,
      COUNT(*) FILTER (WHERE confianza > 0.8) as alta_confianza
    FROM ia_conocimiento 
    WHERE activo = TRUE
    GROUP BY idioma
  `);
  return result.rows;
}

// Listar todo el conocimiento aprendido
async function listarConocimiento(limite = 100) {
  const result = await pool.query(`
    SELECT id, pregunta_original, respuesta, idioma, veces_usada, confianza, ultima_uso
    FROM ia_conocimiento 
    WHERE activo = TRUE
    ORDER BY confianza DESC, veces_usada DESC
    LIMIT $1
  `, [limite]);
  return result.rows;
}

// Eliminar conocimiento (si es incorrecto)
async function eliminarConocimiento(id) {
  await pool.query(
    `UPDATE ia_conocimiento SET activo = FALSE WHERE id = $1`,
    [id]
  );
  console.log(`🗑️ [Aprendizaje] Conocimiento ID ${id} desactivado`);
}


// ═══════════════════════════════════════════════════════════════════════════
// 🔍 OBTENER ÚLTIMO CONTEXTO DEL USUARIO
// (Para saber qué preguntaba cuando responde encuesta)
// ═══════════════════════════════════════════════════════════════════════════
async function getUltimoContexto(telefono) {
  try {
    // Buscar la última pregunta que hizo este usuario
    const result = await pool.query(`
      SELECT mensaje as pregunta, fecha
      FROM wa_conversaciones
      WHERE telefono = $1 
        AND direccion = 'entrada'
      ORDER BY fecha DESC
      LIMIT 1
    `, [telefono]);
    
    if (result.rows.length > 0) {
      return {
        pregunta: result.rows[0].pregunta,
        fecha: result.rows[0].fecha
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ [getUltimoContexto] Error:', error.message);
    return null;
  }
}
// ═══════════════════════════════════════════════════════════════════════════
// 💾 ESTADOS PERSISTENTES DE CONVERSACIÓN
// Permiten que el flujo de agenda / sesión sobreviva reinicios del bot.
// ═══════════════════════════════════════════════════════════════════════════
async function guardarEstado(telefono, estado, tipo = 'agenda') {
  telefono = normalizarTelefono(telefono);
  if (!/^\d{8,15}$/.test(telefono)) {
    console.warn('[guardarEstado] Estado ignorado: telefono ausente o invalido');
    return false;
  }
  try {
    await pool.query(
      `INSERT INTO wa_estados (telefono, tipo, estado, actualizado)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (telefono, tipo) DO UPDATE SET
         estado = EXCLUDED.estado,
         actualizado = NOW()`,
      [telefono, tipo, JSON.stringify(estado || {})]
    );
  } catch (e) {
    console.error('❌ [guardarEstado] Error:', e.message);
  }
}














async function obtenerEstado(telefono, tipo = 'agenda') {
  try {
    const r = await pool.query(
      `SELECT estado FROM wa_estados WHERE telefono = $1 AND tipo = $2`,
      [telefono, tipo]
    );
    return r.rows.length ? r.rows[0].estado : null;
  } catch (e) {
    console.error('❌ [obtenerEstado] Error:', e.message);
    return null;
  }
}

async function borrarEstado(telefono, tipo = 'agenda') {
  try {
    await pool.query(
      `DELETE FROM wa_estados WHERE telefono = $1 AND tipo = $2`,
      [telefono, tipo]
    );
  } catch (e) {
    console.error('❌ [borrarEstado] Error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 FUNCIONES DE AGENDA - ESTADO, DISPONIBILIDAD Y CRM
// ═══════════════════════════════════════════════════════════════════════════

// Wrappers con nombres que usa handlers.js
async function getEstadoAgenda(telefono) {
  return await obtenerEstado(telefono, 'agenda');
}

async function setEstadoAgenda(telefono, estado) {
  return await guardarEstado(telefono, estado, 'agenda');
}

async function resetEstadoAgenda(telefono) {
  return await borrarEstado(telefono, 'agenda');
}

const TERMINAL_CITA_ESTADOS = [
  'anulado',
  'cancelado',
  'canceled',
  'no show',
  'no asiste',
  'reagendado',
  'cambio de fecha',
  'completada',
  'completado',
  'atendido',
];

function normalizarTelefono(telefono) {
  return String(telefono || '').replace(/[^\d]/g, '');
}

function horaParaBD(hora) {
  const h = String(hora || '').trim();
  if (!h) return h;
  return h.length === 5 ? h + ':00' : h;
}

function fechaParaBD(fecha) {
  if (!fecha) return '';
  if (fecha instanceof Date) return fecha.toISOString().slice(0, 10);
  const s = String(fecha).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

async function getDisponibilidad({ fecha, doctorNombre = '' }) {
  try {
    const fechaStr = fechaParaBD(fecha);
    const result = await pool.query(
      `SELECT hora_inicio
       FROM citas
       WHERE fecha_cita = $1::date
         AND LOWER(COALESCE(estado_cita, '')) <> ALL($2::text[])
         AND ($3 = '' OR LOWER(TRIM(CONCAT_WS(' ', nombre_profesional, apellidos_profesional))) = LOWER(TRIM($3)))`,
      [fechaStr, TERMINAL_CITA_ESTADOS, doctorNombre || '']
    );
    const ocupadas = new Set(result.rows.map(r => String(r.hora_inicio || '').slice(0, 5)));

    const todos = [];
    for (let h = 8; h < 18; h++) {
      for (const m of [0, 45]) {
        if (h === 17 && m === 45) continue;
        todos.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    const libres = todos.filter(h => !ocupadas.has(h));
    return { libres, ocupadas: [...ocupadas] };
  } catch (e) {
    console.error('❌ [getDisponibilidad] Error:', e.message);
    return { libres: [], ocupadas: [] };
  }
}

async function buscarLeadPorTelefonoEmail({ telefono, email }) {
  const params = [];
  const where = [];
  if (telefono) {
    params.push(`%${normalizarTelefono(telefono)}`);
    where.push(`regexp_replace(coalesce(telefono,''),'[^0-9]','','g') LIKE $${params.length}`);
  }
  if (email && /@/.test(email)) {
    params.push(email.trim());
    where.push(`lower(email) = lower($${params.length})`);
  }
  if (!where.length) return null;
  const result = await pool.query(
    `SELECT id, nombre, telefono, email, doctor_id
     FROM leads
     WHERE ${where.join(' OR ')}
     ORDER BY fecha_actualizacion DESC NULLS LAST
     LIMIT 1`,
    params
  );
  return result.rows[0] || null;
}

async function apiCrearLead({ nombre, telefono, email, canal = 'WhatsApp', notas = '' }) {
  try {
    const existente = await buscarLeadPorTelefonoEmail({ telefono, email });
    if (existente) {
      const updated = await pool.query(
        `UPDATE leads
         SET nombre = COALESCE(NULLIF($1, ''), nombre),
             email = CASE WHEN $2 <> '' THEN $2 ELSE email END,
             canal = COALESCE(NULLIF($3, ''), canal),
             notas = COALESCE(NULLIF($4, ''), notas),
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id`,
        [nombre || '', email || '', canal || 'WhatsApp', notas || '', existente.id]
      );
      const id = updated.rows[0]?.id;
      console.log('✅ [apiCrearLead] Lead actualizado id:', id);
      return id;
    }

    const result = await pool.query(
      `INSERT INTO leads (
         nombre, telefono, email, categoria, canal, genero, ciudad, pais, notas,
         metodo_contacto, horario_preferido, sales_status, asesor_id, doctor_id,
         creado_por, pipeline, last_contact_date, admission_date, favorito,
         program_to_which_belong_it_is
       ) VALUES (
         $1, $2, $3, '', $4, '', '', '', $5,
         '', '', 'New Lead', NULL, NULL,
         'bot', '', CURRENT_DATE, CURRENT_DATE, FALSE,
         ''
       )
       RETURNING id`,
      [nombre || '', telefono || '', email || '', canal || 'WhatsApp', notas || '']
    );
    const id = result.rows[0]?.id;
    console.log('✅ [apiCrearLead] Lead creado id:', id);
    return id;
  } catch (e) {
    console.error('❌ [apiCrearLead] Error:', e.message);
    throw e;
  }
}

async function actualizarLeadEstado({ leadId, doctorId, fecha, estado, tipoConsulta = '' }) {
  const fechaCita = fechaParaBD(fecha);
  const appointmentStatus = estado === 'Canceled' ? 'Canceled' : (estado === 'Rescheduled' ? 'Rescheduled' : 'Scheduled');
  const isConsulting = String(tipoConsulta).toLowerCase().includes('consultoria');
  const salesStatus = estado === 'Canceled' ? 'Cancelled Appointment' : (isConsulting ? 'Consultor\u00eda Agendada' : 'Scheduled Appointment');
  const medicalStatus = (estado === 'Canceled' || isConsulting) ? null : 'Pending Evaluation';
  await pool.query(
    `UPDATE leads
     SET sales_status = $1,
         appointment_status = $2,
         medical_status = $3,
         cita_confirmada = FALSE,
         doctor_id = COALESCE($4, doctor_id),
         treatment_date = COALESCE($5::date, treatment_date),
         fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE id = $6`,
    [salesStatus, appointmentStatus, medicalStatus, doctorId || null, fechaCita || null, leadId]
  );
}

async function apiAgendar({ leadId, estado, fecha, hora, doctorId, tipoConsulta, notas, email }) {
  try {
    const leadResult = await pool.query(
      `SELECT id, nombre, telefono, email, medilink_numero, tipo_consulta, program_to_which_belong_it_is, doctor_id
       FROM leads
       WHERE id = $1`,
      [leadId]
    );
    if (!leadResult.rows.length) throw new Error('Lead no encontrado: ' + leadId);

    const lead = leadResult.rows[0];
    const fechaStr = fechaParaBD(fecha);
    const horaStr = horaParaBD(hora);
    const tipoFinal = tipoConsulta || lead.tipo_consulta || 'Consulta gratuita';
    const doctorFinal = doctorId || lead.doctor_id || null;
    const doctorNombre = doctorFinal
      ? (await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [doctorFinal]).catch(() => ({ rows: [] }))).rows[0]?.nombre || ''
      : '';

    if (estado === 'Canceled') {
      const cancelled = await pool.query(
        `WITH target AS (
           SELECT id
           FROM citas
           WHERE lead_id = $1
           ORDER BY fecha_cita DESC, hora_inicio DESC, id DESC
           LIMIT 1
         )
         UPDATE citas
         SET estado_cita = 'Anulado',
             status_changed_at = NOW(),
             updated_at = NOW()
         WHERE id IN (SELECT id FROM target)
         RETURNING id`,
        [leadId]
      );
      await actualizarLeadEstado({ leadId, doctorId: doctorFinal, fecha, estado });
      console.log('✅ [apiAgendar] Cita cancelada para lead:', leadId);
      return cancelled.rows[0] || null;
    }

    const prev = await pool.query(
      `SELECT id, appointment_root_id
       FROM citas
       WHERE lead_id = $1
       ORDER BY fecha_cita DESC, hora_inicio DESC, id DESC
       LIMIT 1`,
      [leadId]
    );
    const prevId = prev.rows[0]?.id || null;
    const rootId = prev.rows[0]?.appointment_root_id || prevId || null;

    const inserted = await pool.query(
      `INSERT INTO citas (
         lead_id, estado_cita, fecha_cita, hora_inicio, comentario_cita,
         nro_paciente, nombre_paciente, tipo_atencion, nombre_profesional,
         origen, agendado_por, fecha_creacion_cita, program_to_which_belong_it_is,
         consulta_medilink, consulta_pagada, appointment_kind,
         rescheduled_from_cita_id, appointment_root_id, appointment_attempt_number, status_changed_at
       ) VALUES (
         $1, $2, $3::date, $4::time, $5,
         $6, $7, $8, $9,
         'bot', 'WhatsApp Bot', NOW(), $10,
         $11, $12, $13,
         $14, $15, 1, NOW()
       )
       RETURNING id`,
      [
        leadId,
        'Agendado',
        fechaStr,
        horaStr,
        notas || '',
        lead.medilink_numero || '',
        lead.nombre || '',
        tipoFinal,
        doctorNombre,
        lead.program_to_which_belong_it_is || '',
        tipoFinal,
        tipoFinal === 'Consulta medicina general',
        String(tipoFinal).toLowerCase().includes('consultoria') ? 'consulting' : 'consultation',
        estado === 'Rescheduled' ? prevId : null,
        rootId,
      ]
    );

    if (prevId && estado === 'Rescheduled') {
      await pool.query(
        `UPDATE citas
         SET estado_cita = 'Reagendado',
             status_changed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [prevId]
      );
    }

    await pool.query(
      `UPDATE citas
       SET appointment_root_id = COALESCE($1, id)
       WHERE id = $2`,
      [rootId || inserted.rows[0].id, inserted.rows[0].id]
    );

    await actualizarLeadEstado({ leadId, doctorId: doctorFinal, fecha, estado, tipoConsulta: tipoFinal });
    console.log('✅ [apiAgendar] Cita', estado, 'para lead:', leadId, fechaStr, horaStr);
    return inserted.rows[0];
  } catch (e) {
    console.error('❌ [apiAgendar] Error:', e.message);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTAR TODO
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  // Inicialización
  initDB, pool,
  
  // Contactos
  saveContacto, 
  getContactoByTelefono, 
  getContactos, 
  upsertContactoBasico, 
  updateLeadData,
  
  // Base de conocimiento KB
  buscarEnKB, 
  getCategorias, 
  getAllArticulos,
  saveArticuloKB, 
  updateArticuloKB, 
  deleteArticuloKB,
  
  // Conversaciones
  logMensaje, 
  getConversacionesRecientes, 
  getMensajesDeContacto,
  
  // Historial para IA
  getHistorialMensajes,
  guardarMensajeRAG,
  getHistorialRAG,
  
  // 🧠 APRENDIZAJE AUTOMÁTICO
  normalizarPregunta,
  buscarEnConocimiento,
  guardarConocimiento,
  aumentarConfianza,
  getEstadisticasAprendizaje,
  listarConocimiento,
  eliminarConocimiento,
  
  // 🆕 CONTEXTO DE USUARIO
  getUltimoContexto,

  // 💾 ESTADOS PERSISTENTES (nombres internos)
  guardarEstado, obtenerEstado, borrarEstado,

  // 📅 AGENDA - nombres que usa handlers.js
  getEstadoAgenda, setEstadoAgenda, resetEstadoAgenda,
  getDisponibilidad,
  apiCrearLead,
  apiAgendar,
};
