// ══════════════════════════════════════════════════════════
// STEMWELL - INGESTA DE DOCUMENTOS MÉDICOS AL RAG
// Divide libros/docs en chunks y los guarda en pgvector
// Uso: node rag/ingestDocuments.js
// ══════════════════════════════════════════════════════════

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../services/postgres');

const DOCS_DIR    = path.join(__dirname, '../documents');
const CHUNK_SIZE  = 800;   // caracteres por chunk
const CHUNK_OVERLAP = 100; // solapamiento entre chunks

// ── DIVIDIR TEXTO EN CHUNKS ───────────────────────────────
function chunkText(texto, fuente, categoria) {
  const chunks = [];
  let i = 0;
  while (i < texto.length) {
    const fin = Math.min(i + CHUNK_SIZE, texto.length);
    const chunk = texto.slice(Math.max(0, i - CHUNK_OVERLAP), fin).trim();
    if (chunk.length > 100) {
      chunks.push({ contenido: chunk, fuente, categoria });
    }
    i = fin;
  }
  return chunks;
}

// ── GENERAR EMBEDDING ─────────────────────────────────────
async function getEmbedding(texto) {
  const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
  if (!VOYAGE_KEY) {
    console.log('⚠️  Sin VOYAGE_API_KEY — guardando sin embedding (solo búsqueda keyword)');
    return null;
  }

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_KEY}`,
    },
    body: JSON.stringify({ input: [texto], model: 'voyage-large-2' }),
  });
  const data = await res.json();
  return data?.data?.[0]?.embedding || null;
}

// ── GUARDAR CHUNK EN BD ───────────────────────────────────
async function guardarChunk({ contenido, fuente, categoria, embedding }) {
  if (embedding) {
    const vectorStr = `[${embedding.join(',')}]`;
    await pool.query(
      `INSERT INTO rag_documentos (contenido, fuente, categoria, embedding)
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT DO NOTHING`,
      [contenido, fuente, categoria, vectorStr]
    );
  } else {
    await pool.query(
      `INSERT INTO rag_documentos (contenido, fuente, categoria)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [contenido, fuente, categoria]
    );
  }
}

// ── PROCESAR UN ARCHIVO ───────────────────────────────────
async function procesarArchivo(rutaArchivo, categoria) {
  const ext      = path.extname(rutaArchivo).toLowerCase();
  const fuente   = path.basename(rutaArchivo, ext);
  let   texto    = '';

  if (ext === '.txt' || ext === '.md') {
    texto = fs.readFileSync(rutaArchivo, 'utf8');
  } else if (ext === '.json') {
    const data = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
    // Espera formato: [{ pregunta, respuesta }] o [{ titulo, contenido }]
    texto = data.map(d =>
      d.pregunta
        ? `P: ${d.pregunta}\nR: ${d.respuesta}`
        : `${d.titulo || ''}\n${d.contenido || ''}`
    ).join('\n\n');
  } else {
    console.log(`⚠️  Formato no soportado: ${ext} — saltando ${rutaArchivo}`);
    return 0;
  }

  const chunks = chunkText(texto, fuente, categoria);
  let guardados = 0;

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.contenido);
    await guardarChunk({ ...chunk, embedding });
    guardados++;
    process.stdout.write(`\r  💾 ${guardados}/${chunks.length} chunks`);
  }
  console.log(`\n  ✅ ${fuente}: ${guardados} chunks ingresados`);
  return guardados;
}

// ── PROCESAR DIRECTORIO COMPLETO ──────────────────────────
async function ingestarTodo() {
  console.log('\n🚀 STEMWELL RAG — Iniciando ingesta de documentos\n');

  // Mapeo carpeta → categoría
  const categorias = {
    faqs:          'faqs_stemwell',
    protocolos:    'protocolos_stemwell',
    procedimientos:'procedimientos_stemwell',
    libros:        'libros_medicos',
    medicos:       'perfiles_medicos',
  };

  let total = 0;

  for (const [carpeta, categoria] of Object.entries(categorias)) {
    const dir = path.join(DOCS_DIR, carpeta);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); continue; }

    const archivos = fs.readdirSync(dir).filter(f => /\.(txt|md|json)$/i.test(f));
    if (!archivos.length) { console.log(`📂 ${carpeta}/ — vacío`); continue; }

    console.log(`📂 Procesando ${carpeta}/ (${archivos.length} archivos):`);
    for (const archivo of archivos) {
      total += await procesarArchivo(path.join(dir, archivo), categoria);
    }
  }

  console.log(`\n✅ Ingesta completada — ${total} chunks totales en BD`);
  await pool.end();
}

ingestarTodo().catch(console.error);