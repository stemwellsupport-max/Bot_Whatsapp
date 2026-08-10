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
  await pool.query("UPDATE wa_outbox SET status='pending',error='Recovered after interrupted send' WHERE status='sending' AND created_at < NOW() - INTERVAL '5 minutes'");
}

async function isPaused(telefono) {
  const result = await pool.query('SELECT paused FROM wa_handoffs WHERE telefono=$1', [telefono]);
  return Boolean(result.rows[0]?.paused);
}

async function processOutbox() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT id,telefono,mensaje FROM wa_outbox
      WHERE status='pending' ORDER BY created_at,id
      FOR UPDATE SKIP LOCKED LIMIT 10
    `);
    for (const item of result.rows) {
      await client.query("UPDATE wa_outbox SET status='sending',error=NULL WHERE id=$1", [item.id]);
      const sent = await sendMessage(item.telefono, item.mensaje, 1);
      if (sent) {
        await client.query("UPDATE wa_outbox SET status='sent',sent_at=NOW() WHERE id=$1", [item.id]);
        await logMensaje(item.telefono, 'Equipo Stemwell', 'salida', item.mensaje);
      } else {
        await client.query("UPDATE wa_outbox SET status='pending',error='WhatsApp API no confirmo el envio' WHERE id=$1", [item.id]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[wa_outbox]', error.message);
  } finally {
    client.release();
  }
}

module.exports = { initHumanControl, isPaused, processOutbox };
