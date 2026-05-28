const express = require('express');
const path    = require('path');
const router  = express.Router();
const { getEstadisticas, getPreguntasSinResponder, getTodasRespuestas, guardarRespuesta } = require('../rag/ml-engine');


const {
  getAllArticulos, saveArticuloKB, updateArticuloKB, deleteArticuloKB,
  getCategorias, getContactos,
  getConversacionesRecientes, getMensajesDeContacto,
} = require('../services/postgres');

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

// ═══════════════════════════════════════
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