const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  database:           process.env.DB_NAME     || 'crm_stemwell',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           'local',
});

// ══════════════════════════════════════════════════════════
// INIT — crea las tablas del bot si no existen
// ══════════════════════════════════════════════════════════
async function initDB() {
  const conn = await pool.getConnection();
  try {
    // Contactos que escriben por WhatsApp
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS wa_contactos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        telefono    VARCHAR(30)  UNIQUE NOT NULL,
        nombre      VARCHAR(150) DEFAULT '',
        apellido    VARCHAR(150) DEFAULT '',
        email       VARCHAR(255) DEFAULT '',
        ultimo_msg  DATETIME     DEFAULT NULL,
        creado_en   DATETIME     DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Base de conocimiento — artículos que responde el bot
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS kb_articulos (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        categoria      VARCHAR(100) NOT NULL,
        pregunta       VARCHAR(500) NOT NULL,
        respuesta      TEXT         NOT NULL,
        palabras_clave VARCHAR(500) DEFAULT '',
        activo         TINYINT(1)   DEFAULT 1,
        creado_en      DATETIME     DEFAULT CURRENT_TIMESTAMP,
        actualizado    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Intentar agregar índice FULLTEXT (falla silenciosamente si ya existe)
    try {
      await conn.execute(`
        ALTER TABLE kb_articulos
        ADD FULLTEXT INDEX ft_kb (pregunta, respuesta, palabras_clave)
      `);
    } catch (e) { /* ya existe */ }

    // Log de conversaciones (entrada y salida)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS wa_conversaciones (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        telefono   VARCHAR(30)              NOT NULL,
        nombre     VARCHAR(150)             DEFAULT '',
        direccion  ENUM('entrada','salida') NOT NULL,
        mensaje    TEXT                     NOT NULL,
        fecha      DATETIME                 DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tel (telefono),
        INDEX idx_fecha (fecha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('✅ Tablas del bot verificadas/creadas en MySQL');
  } finally {
    conn.release();
  }
}

// ══════════════════════════════════════════════════════════
// CONTACTOS
// ══════════════════════════════════════════════════════════
async function saveContacto({ nombre, apellido, email, telefono }) {
  await pool.execute(
    `INSERT INTO wa_contactos (telefono, nombre, apellido, email, ultimo_msg)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       nombre     = IF(VALUES(nombre) != '', VALUES(nombre), nombre),
       apellido   = IF(VALUES(apellido) != '', VALUES(apellido), apellido),
       email      = IF(VALUES(email) != '', VALUES(email), email),
       ultimo_msg = NOW()`,
    [telefono, nombre || '', apellido || '', email || '']
  );
  const [rows] = await pool.execute(
    'SELECT * FROM wa_contactos WHERE telefono = ?', [telefono]
  );
  return rows[0];
}

async function getContactoByTelefono(telefono) {
  const [rows] = await pool.execute(
    'SELECT * FROM wa_contactos WHERE telefono = ?', [telefono]
  );
  return rows[0] || null;
}

async function getContactos() {
  const [rows] = await pool.execute(
    'SELECT * FROM wa_contactos ORDER BY ultimo_msg DESC, creado_en DESC'
  );
  return rows;
}

async function upsertContactoBasico(telefono, nombre) {
  await pool.execute(
    `INSERT INTO wa_contactos (telefono, nombre, ultimo_msg)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       nombre     = IF(nombre = '' AND VALUES(nombre) != '', VALUES(nombre), nombre),
       ultimo_msg = NOW()`,
    [telefono, nombre || '']
  );
}

// ══════════════════════════════════════════════════════════
// BASE DE CONOCIMIENTO
// ══════════════════════════════════════════════════════════
async function buscarEnKB(texto) {
  const limpio = texto.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9 ]/g, ' ').trim();

  // 1. FULLTEXT
  try {
    const [ftRows] = await pool.execute(
      `SELECT *, MATCH(pregunta, respuesta, palabras_clave)
                 AGAINST(? IN BOOLEAN MODE) AS score
       FROM kb_articulos
       WHERE activo = 1
         AND MATCH(pregunta, respuesta, palabras_clave)
             AGAINST(? IN BOOLEAN MODE)
       ORDER BY score DESC LIMIT 3`,
      [limpio, limpio]
    );
    if (ftRows.length > 0) return ftRows;
  } catch (e) { /* FULLTEXT puede fallar si hay < 3 palabras */ }

  // 2. Fallback LIKE palabra por palabra
  const palabras = limpio.split(' ').filter(p => p.length > 3);
  if (!palabras.length) return [];

  const conds  = palabras.map(() =>
    '(pregunta LIKE ? OR respuesta LIKE ? OR palabras_clave LIKE ?)'
  ).join(' OR ');
  const params = palabras.flatMap(p => [`%${p}%`, `%${p}%`, `%${p}%`]);

  const [likeRows] = await pool.execute(
    `SELECT * FROM kb_articulos WHERE activo = 1 AND (${conds}) LIMIT 3`,
    params
  );
  return likeRows;
}

async function getCategorias() {
  const [rows] = await pool.execute(
    `SELECT categoria, COUNT(*) AS total
     FROM kb_articulos WHERE activo = 1
     GROUP BY categoria ORDER BY categoria`
  );
  return rows;
}

async function getAllArticulos() {
  const [rows] = await pool.execute(
    `SELECT * FROM kb_articulos WHERE activo = 1 ORDER BY categoria, id`
  );
  return rows;
}

async function saveArticuloKB({ categoria, pregunta, respuesta, palabras_clave = '' }) {
  const [result] = await pool.execute(
    `INSERT INTO kb_articulos (categoria, pregunta, respuesta, palabras_clave)
     VALUES (?, ?, ?, ?)`,
    [categoria, pregunta, respuesta, palabras_clave]
  );
  return result.insertId;
}

async function updateArticuloKB(id, { categoria, pregunta, respuesta, palabras_clave }) {
  await pool.execute(
    `UPDATE kb_articulos
     SET categoria=?, pregunta=?, respuesta=?, palabras_clave=?
     WHERE id=?`,
    [categoria, pregunta, respuesta, palabras_clave || '', id]
  );
}

async function deleteArticuloKB(id) {
  await pool.execute('UPDATE kb_articulos SET activo = 0 WHERE id = ?', [id]);
}

// ══════════════════════════════════════════════════════════
// CONVERSACIONES
// ══════════════════════════════════════════════════════════
async function logMensaje(telefono, nombre, direccion, mensaje) {
  try {
    await pool.execute(
      `INSERT INTO wa_conversaciones (telefono, nombre, direccion, mensaje)
       VALUES (?, ?, ?, ?)`,
      [telefono, nombre || '', direccion, mensaje.slice(0, 4000)]
    );
  } catch (e) { /* no crítico */ }
}

// Para el panel: últimas conversaciones agrupadas por contacto
async function getConversacionesRecientes(limite = 50) {
  const [rows] = await pool.execute(
    `SELECT telefono, nombre,
            MAX(fecha) AS ultimo,
            COUNT(*) AS total_msgs,
            SUM(direccion = 'entrada') AS msgs_entrada,
            SUM(direccion = 'salida')  AS msgs_salida
     FROM wa_conversaciones
     GROUP BY telefono, nombre
     ORDER BY ultimo DESC
     LIMIT ?`,
    [limite]
  );
  return rows;
}

async function getMensajesDeContacto(telefono, limite = 100) {
  const [rows] = await pool.execute(
    `SELECT * FROM wa_conversaciones
     WHERE telefono = ?
     ORDER BY fecha ASC
     LIMIT ?`,
    [telefono, limite]
  );
  return rows;
}

module.exports = {
  initDB, pool,
  // contactos
  saveContacto, getContactoByTelefono, getContactos, upsertContactoBasico,
  // kb
  buscarEnKB, getCategorias, getAllArticulos,
  saveArticuloKB, updateArticuloKB, deleteArticuloKB,
  // conversaciones
  logMensaje, getConversacionesRecientes, getMensajesDeContacto,
};