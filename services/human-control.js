const { pool, logMensaje } = require('./postgres');
const { sendMessage } = require('./whatsapp');

async function initHumanControl() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_handoffs (
      telefono VARCHAR(30) PRIMARY KEY,
      paused BOOLEAN NOT NULL DEFAULT FALSE,
      paused_by INTEGER,
      paused_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_outbox (
      id BIGSERIAL PRIMARY KEY,
      telefono VARCHAR(30) NOT NULL,
      mensaje TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP,
      error TEXT
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wa_outbox_pending ON wa_outbox(status, created_at)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_bot_pending_inbound (
      telefono VARCHAR(30) PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL DEFAULT '',
      mensaje TEXT NOT NULL,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      replaying_at TIMESTAMP
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_advisor_requests (
      telefono VARCHAR(30) PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL DEFAULT '',
      idioma VARCHAR(20) NOT NULL DEFAULT 'spanish',
      mensaje TEXT NOT NULL DEFAULT '',
      asesor_id INTEGER,
      estado VARCHAR(20) NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      taken_at TIMESTAMP
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wa_advisor_requests_pending ON wa_advisor_requests(estado,asesor_id,requested_at)');
  // Si el proceso se reinició mientras retomaba un chat, el mensaje vuelve a
  // estar disponible en pocos minutos en lugar de quedar bloqueado para siempre.
  await pool.query("UPDATE wa_bot_pending_inbound SET replaying_at=NULL WHERE replaying_at < NOW() - INTERVAL '5 minutes'");
  await pool.query("UPDATE wa_outbox SET status='pending',error='Recovered after interrupted send' WHERE status='sending' AND created_at < NOW() - INTERVAL '5 minutes'");
}

// Advisors staff the chat 8:30 AM to 6:00 PM, Bogota time, every day.
// Outside that window nobody is watching a paused/handed-off conversation,
// so the bot must keep answering instead of going silent until morning.
function isBusinessHours(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour').value);
  const minute = Number(parts.find(p => p.type === 'minute').value);
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= (8 * 60 + 30) && minutesSinceMidnight < (18 * 60);
}

async function requestAdvisor(telefono, nombre, idioma, mensaje, { pauseBot = true } = {}) {
  // Reparte por carga entre los asesores activos que puedan atender el idioma.
  const language = idioma === 'en' ? 'english' : 'spanish';
  const advisor = await pool.query(`
    SELECT u.id,u.nombre
    FROM usuarios u
    LEFT JOIN wa_advisor_requests r ON r.asesor_id=u.id AND r.estado='pending'
    WHERE u.activo=TRUE AND u.rol IN ('asesor','apoyo','visitas','soporte')
      AND (u.rol='soporte' OR LOWER(COALESCE(u.idiomas,'spanish')) LIKE '%' || $1 || '%')
    GROUP BY u.id,u.nombre
    ORDER BY COUNT(r.telefono),u.id
    LIMIT 1
  `, [language]);
  const selected = advisor.rows[0] || null;
  await pool.query(`
    INSERT INTO wa_advisor_requests (telefono,nombre,idioma,mensaje,asesor_id,estado,requested_at,taken_at)
    VALUES ($1,$2,$3,$4,$5,'pending',NOW(),NULL)
    ON CONFLICT (telefono) DO UPDATE SET
      nombre=EXCLUDED.nombre,idioma=EXCLUDED.idioma,mensaje=EXCLUDED.mensaje,
      asesor_id=EXCLUDED.asesor_id,estado='pending',requested_at=NOW(),taken_at=NULL
  `, [telefono, nombre || 'Paciente', language, mensaje || '', selected?.id || null]);
  // Outside business hours the request still gets queued for the morning,
  // but the bot must not go silent, so it stays unpaused.
  if (pauseBot) {
    await pool.query(`
      INSERT INTO wa_handoffs (telefono,paused,paused_by,paused_at,updated_at)
      VALUES ($1,TRUE,$2,NOW(),NOW())
      ON CONFLICT (telefono) DO UPDATE SET paused=TRUE,paused_by=EXCLUDED.paused_by,
        paused_at=NOW(),updated_at=NOW()
    `, [telefono, selected?.id || null]);
  }
  return selected;
}

async function isPaused(telefono) {
  const result = await pool.query('SELECT paused FROM wa_handoffs WHERE telefono=$1', [telefono]);
  return Boolean(result.rows[0]?.paused);
}

async function savePendingInbound(telefono, nombre, mensaje) {
  await pool.query(`
    INSERT INTO wa_bot_pending_inbound (telefono,nombre,mensaje,received_at,replaying_at)
    VALUES ($1,$2,$3,NOW(),NULL)
    ON CONFLICT (telefono) DO UPDATE SET
      nombre=EXCLUDED.nombre,mensaje=EXCLUDED.mensaje,
      received_at=NOW(),replaying_at=NULL
  `, [telefono, nombre || '', mensaje]);
}

async function claimResumedMessages(limit = 10) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT p.telefono,p.nombre,p.mensaje
      FROM wa_bot_pending_inbound p
      LEFT JOIN wa_handoffs h ON h.telefono=p.telefono
      WHERE COALESCE(h.paused,FALSE)=FALSE AND p.replaying_at IS NULL
      ORDER BY p.received_at
      FOR UPDATE OF p SKIP LOCKED LIMIT $1
    `, [limit]);
    for (const row of result.rows) {
      await client.query('UPDATE wa_bot_pending_inbound SET replaying_at=NOW() WHERE telefono=$1', [row.telefono]);
    }
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[wa_pending_inbound]', error.message);
    return [];
  } finally {
    client.release();
  }
}

async function completeResumedMessage(telefono) {
  await pool.query('DELETE FROM wa_bot_pending_inbound WHERE telefono=$1', [telefono]);
}

async function releaseResumedMessage(telefono) {
  await pool.query('UPDATE wa_bot_pending_inbound SET replaying_at=NULL WHERE telefono=$1', [telefono]);
}

async function processOutbox() {
  const client = await pool.connect();
  let items = [];
  try {
    // Claim pending messages in a short transaction. Never keep database
    // locks open while waiting for Meta/WhatsApp or while writing the chat log
    // through another pooled connection.
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT id,telefono,mensaje FROM wa_outbox
      WHERE status='pending' ORDER BY created_at,id
      FOR UPDATE SKIP LOCKED LIMIT 10
    `);
    items = result.rows;
    for (const item of items) {
      await client.query("UPDATE wa_outbox SET status='sending',error=NULL WHERE id=$1", [item.id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[wa_outbox]', error.message);
    return;
  } finally {
    client.release();
  }

  for (const item of items) {
    try {
      const sent = await sendMessage(item.telefono, item.mensaje, 1);
      if (sent) {
        await pool.query("UPDATE wa_outbox SET status='sent',sent_at=NOW() WHERE id=$1", [item.id]);
        await logMensaje(item.telefono, 'Equipo Stemwell', 'salida', item.mensaje);
      } else {
        await pool.query("UPDATE wa_outbox SET status='pending',error='WhatsApp API no confirmo el envio' WHERE id=$1", [item.id]);
      }
    } catch (error) {
      await pool.query(
        "UPDATE wa_outbox SET status='pending',error=$2 WHERE id=$1",
        [item.id, String(error.message || error).slice(0, 1000)]
      ).catch(() => {});
      console.error(`[wa_outbox:${item.id}]`, error.message || error);
    }
  }
}

module.exports = {
  initHumanControl, isPaused, processOutbox,
  savePendingInbound, claimResumedMessages, completeResumedMessage, releaseResumedMessage,
  requestAdvisor, isBusinessHours,
};
