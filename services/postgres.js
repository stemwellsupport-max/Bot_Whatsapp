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
  return r.rows[0] || null;
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
  
  // 🧠 APRENDIZAJE AUTOMÁTICO (nuevas funciones)
  normalizarPregunta,
  buscarEnConocimiento,
  guardarConocimiento,
  aumentarConfianza,
  getEstadisticasAprendizaje,
  listarConocimiento,
  eliminarConocimiento,
};