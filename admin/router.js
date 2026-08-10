const express = require('express');
const path    = require('path');
const router  = express.Router();
const {
  getEstadisticas, getPreguntasSinResponder,
  getTodasRespuestas, guardarRespuesta,
} = require('../services/aprendizaje');

const {
  getAllArticulos, saveArticuloKB, updateArticuloKB, deleteArticuloKB,
  getCategorias, getContactos,
  getConversacionesRecientes, getMensajesDeContacto,
} = require('../services/postgres');

const { pool } = require('../services/agenda');

// ── Servir panel HTML ─────────────────────────────────────
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════════════════════
// BASE DE CONOCIMIENTO
// ══════════════════════════════════════════════════════════
router.get('/api/articulos', async (req, res) => {
  try {
    res.json({ ok: true, articulos: await getAllArticulos() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/articulos', async (req, res) => {
  try {
    const { categoria, pregunta, respuesta, palabras_clave } = req.body;
    if (!categoria || !pregunta || !respuesta)
      return res.status(400).json({ ok: false, error: 'categoria, pregunta y respuesta son obligatorios' });
    const id = await saveArticuloKB({ categoria, pregunta, respuesta, palabras_clave });
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/api/articulos/:id', async (req, res) => {
  try {
    await updateArticuloKB(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/api/articulos/:id', async (req, res) => {
  try {
    await deleteArticuloKB(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/api/categorias', async (req, res) => {
  try {
    res.json({ ok: true, categorias: await getCategorias() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// CONTACTOS
// ══════════════════════════════════════════════════════════
router.get('/api/contactos', async (req, res) => {
  try {
    res.json({ ok: true, contactos: await getContactos() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// CONVERSACIONES (chat en vivo)
// ══════════════════════════════════════════════════════════
router.get('/api/conversaciones', async (req, res) => {
  try {
    res.json({ ok: true, conversaciones: await getConversacionesRecientes(100) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/api/conversaciones/:telefono', async (req, res) => {
  try {
    const msgs = await getMensajesDeContacto(
      req.params.telefono,
      parseInt(req.query.limite) || 100
    );
    res.json({ ok: true, mensajes: msgs });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// CITAS
// ══════════════════════════════════════════════════════════
router.get('/api/citas', async (req, res) => {
  try {
    const { estado, fecha } = req.query;
    let query = `
      SELECT
        id,
        COALESCE(NULLIF(TRIM(nombre_paciente), ''), '') AS nombre_paciente,
        telefono,
        fecha_cita,
        hora_inicio AS hora_cita,
        COALESCE(NULLIF(TRIM(tipo_atencion), ''), COALESCE(NULLIF(TRIM(tratamiento), ''), 'Consulta')) AS tratamiento,
        CASE
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('agendado', 'confirmado') THEN 'confirmada'
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('atendido', 'completado', 'completada') THEN 'completada'
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('anulado', 'cancelado', 'canceled') THEN 'cancelada'
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('reagendado', 'cambio de fecha') THEN 'pendiente'
          ELSE LOWER(COALESCE(estado_cita, 'pendiente'))
        END AS estado
      FROM citas`;
    const params = [];
    const conds = [];
    if (estado) { params.push(estado); conds.push(`LOWER(
        CASE
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('agendado', 'confirmado') THEN 'confirmada'
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('atendido', 'completado', 'completada') THEN 'completada'
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('anulado', 'cancelado', 'canceled') THEN 'cancelada'
          WHEN LOWER(COALESCE(estado_cita, '')) IN ('reagendado', 'cambio de fecha') THEN 'pendiente'
          ELSE LOWER(COALESCE(estado_cita, 'pendiente'))
        END
      ) = LOWER($${params.length})`); }
    if (fecha)  { params.push(fecha);  conds.push(`fecha_cita = $${params.length}`); }
    if (conds.length) query += ' WHERE ' + conds.join(' AND ');
    query += ' ORDER BY fecha_cita ASC, hora_cita ASC';
    const result = await pool.query(query, params);
    res.json({ ok: true, citas: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/api/citas/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    const estados = ['confirmada', 'pendiente', 'cancelada', 'completada'];
    if (!estados.includes(estado))
      return res.status(400).json({ ok: false, error: 'Estado inválido' });
    const estadoCRM = estado === 'confirmada' ? 'Confirmado'
      : estado === 'pendiente' ? 'Agendado'
      : estado === 'cancelada' ? 'Anulado'
      : 'Atendido';
    await pool.query(
      `UPDATE citas SET estado_cita = $1, updated_at = NOW(), status_changed_at = NOW() WHERE id = $2`,
      [estadoCRM, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// APRENDIZAJE DEL BOT
// ═══════════════════════════════════════
router.get('/aprender', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'aprender.html'));
});

router.get('/api/aprender/stats', (req, res) => {
  res.json(getEstadisticas());
});

router.get('/api/aprender/pendientes', (req, res) => {
  res.json(getPreguntasSinResponder());
});

router.get('/api/aprender/aprendidas', (req, res) => {
  res.json(getTodasRespuestas());
});

router.post('/api/aprender/ensenar', (req, res) => {
  const { pregunta, respuesta } = req.body;
  if (!pregunta || !respuesta) return res.status(400).json({ ok: false });
  guardarRespuesta(pregunta, respuesta);
  res.json({ ok: true });
});

module.exports = router;