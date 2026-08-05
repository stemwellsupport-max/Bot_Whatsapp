// ============================================================
// services/identidad.js
// VALIDACIÓN DE IDENTIDAD DEL PACIENTE
//
// Antes de agendar/cancelar/reagendar, el bot debe saber QUÉ
// paciente es. Usamos SOLO LECTURA (SELECT) sobre las tablas del
// CRM (leads, citas) para identificarlo por teléfono y/o email.
//
// IMPORTANTE: No escribimos en el CRM aquí. Solo leemos para
// validar identidad y conocer sus citas.
// ============================================================

// ── Normalizar teléfono (quitar +, espacios, guiones) ──────
function normalizarTelefono(tel) {
  if (!tel) return '';
  return String(tel).replace(/[^\d]/g, '').replace(/^00/, '').replace(/^57/, '');
}

// ── Buscar lead por teléfono o email ───────────────────────
// Busca primero en tabla leads (CRM), si no encuentra busca en wa_contactos (bot).
// Siempre devuelve array de objetos { id, nombre, telefono, email, doctor_id }.
async function buscarLead({ pool, telefono, email }) {
  if (!pool) throw new Error('pool requerido');

  // 1. Intentar en tabla CRM leads
  try {
    const params = [];
    const where = [];
    let idx = 1;
    if (telefono) {
      const t = normalizarTelefono(telefono);
      if (t.length >= 8) {
        where.push(`regexp_replace(coalesce(telefono,''),'[^0-9]','','g') LIKE $${idx}`);
        params.push(`%${t}`);
        idx++;
      }
    }
    if (email && /@/.test(email)) {
      where.push(`lower(email) = lower($${idx})`);
      params.push(email.trim());
    }
    if (where.length) {
      const result = await pool.query(
        `SELECT id, nombre, telefono, email, doctor_id, doctor_nombre,
                sales_status, appointment_status, medical_status,
                treatment_date, treatment_start_date, modalidad_consulta
         FROM leads
         WHERE ${where.join(' OR ')}
         ORDER BY fecha_actualizacion DESC NULLS LAST
         LIMIT 5`,
        params
      );
      if (result.rows.length) return result.rows;
    }
  } catch (e) {
    // leads table might not be accessible; fall through to wa_contactos
    console.warn('⚠️ [buscarLead] leads query failed, trying wa_contactos:', e.message);
  }

  // 2. Fallback: buscar en wa_contactos (pacientes que agendaron por bot)
  try {
    const params2 = [];
    const where2 = [];
    let idx2 = 1;
    if (telefono) {
      const t = normalizarTelefono(telefono);
      if (t.length >= 8) {
        where2.push(`regexp_replace(coalesce(telefono,''),'[^0-9]','','g') LIKE $${idx2}`);
        params2.push(`%${t}`);
        idx2++;
      }
    }
    if (email && /@/.test(email)) {
      where2.push(`lower(email) = lower($${idx2})`);
      params2.push(email.trim());
    }
    if (!where2.length) return [];
    const r2 = await pool.query(
      `SELECT id, nombre, telefono, email, NULL AS doctor_id, NULL AS doctor_nombre,
              'Activo' AS sales_status, NULL AS appointment_status, NULL AS medical_status,
              NULL AS treatment_date, NULL AS treatment_start_date, NULL AS modalidad_consulta
       FROM wa_contactos
       WHERE ${where2.join(' OR ')}
       ORDER BY creado_en DESC
       LIMIT 5`,
      params2
    );
    return r2.rows;
  } catch (e) {
    console.error('❌ [buscarLead] wa_contactos query failed:', e.message);
    return [];
  }
}

// ── Obtener citas del paciente por teléfono ─────────────────
// Busca en tabla citas (CRM) + wa_citas (bot). Devuelve formato unificado.
async function getCitasPorTelefono({ pool, telefono }) {
  if (!pool) throw new Error('pool requerido');
  const t = normalizarTelefono(telefono);
  const rows = [];

  // 1. Citas del CRM
  try {
    const result = await pool.query(
      `SELECT c.nro_cita, c.fecha_cita, c.hora_inicio AS hora_inicio, c.hora_fin,
              c.estado_cita, c.tipo_atencion, c.modalidad_consulta,
              NULLIF(TRIM(CONCAT_WS(' ', c.nombre_paciente, c.apellidos_paciente)),'') AS paciente,
              'crm' AS fuente
       FROM citas c
       WHERE regexp_replace(coalesce(c.celular, c.telefono, ''),'[^0-9]','','g') LIKE $1
          OR regexp_replace(coalesce(c.telefono,''),'[^0-9]','','g') LIKE $1
       ORDER BY c.fecha_cita ASC, c.hora_inicio ASC
       LIMIT 20`,
      [`%${t}`]
    );
    rows.push(...result.rows);
  } catch (e) {
    console.warn('⚠️ [getCitasPorTelefono] citas CRM query failed:', e.message);
  }

  // 2. Citas del bot (wa_citas)
  try {
    const result2 = await pool.query(
      `SELECT id AS nro_cita, fecha_cita,
              hora_cita AS hora_inicio, NULL AS hora_fin,
              estado AS estado_cita, tratamiento AS tipo_atencion, NULL AS modalidad_consulta,
              nombre_paciente AS paciente,
              'bot' AS fuente
       FROM wa_citas
       WHERE regexp_replace(coalesce(telefono,''),'[^0-9]','','g') LIKE $1
         AND estado NOT IN ('cancelada')
       ORDER BY fecha_cita ASC, hora_cita ASC
       LIMIT 20`,
      [`%${t}`]
    );
    rows.push(...result2.rows);
  } catch (e) {
    console.warn('⚠️ [getCitasPorTelefono] wa_citas query failed:', e.message);
  }

  return rows;
}

// ── Citas pendientes desde leads (consultoría/tratamiento) ──
async function getCitasLead({ pool, leadId }) {
  if (!pool || !leadId) return [];
  const result = await pool.query(
    `SELECT id, treatment_date, treatment_start_date, appointment_status,
            sales_status, modalidad_consulta
     FROM leads
     WHERE id = $1`,
    [leadId]
  );
  return result.rows[0] || null;
}

// ── Formatear cita para mostrarla al usuario ────────────────
function formatearCita(c) {
  const dia = c.fecha_cita ? String(c.fecha_cita).slice(0, 10) : 'sin fecha';
  const hora = c.hora_inicio ? String(c.hora_inicio).slice(0, 5) : '—';
  const estado = c.estado_cita || c.appointment_status || 'Reservado';
  return `🗓️ ${dia} a las ${hora} — *${estado}*`;
}

module.exports = {
  buscarLead,
  getCitasPorTelefono,
  getCitasLead,
  formatearCita,
  normalizarTelefono,
};

