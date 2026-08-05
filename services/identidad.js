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

// ── Buscar lead por teléfono o email (SOLO LECTURA) ────────
async function buscarLead({ pool, telefono, email }) {
  if (!pool) throw new Error('pool requerido');

  const params = [];
  let where = [];
  let idx = 1;

  if (telefono) {
    const t = normalizarTelefono(telefono);
    if (t.length >= 8) {
      where.push(`regexp_replace(coalesce(telefono,''),'\D','','g') LIKE $${idx}`);
      params.push(`%${t}`);
      idx++;
    }
  }
  if (email && /@/.test(email)) {
    where.push(`lower(email) = lower($${idx})`);
    params.push(email.trim());
    idx++;
  }

  if (!where.length) return null;

  const result = await pool.query(
    `SELECT id, nombre, telefono, email, sales_status, appointment_status, medical_status,
            treatment_date, treatment_start_date, modalidad_consulta, doctor_id, doctor_nombre
     FROM leads
     WHERE ${where.join(' OR ')}
     ORDER BY 
       CASE WHEN (${idx} > 1 AND telefono ILIKE $1) THEN 0 ELSE 1 END,
       fecha_actualizacion DESC NULLS LAST
     LIMIT 5`,
    params
  );
  return result.rows;
}

// ── Obtener citas del paciente (tabla citas) por teléfono ──
async function getCitasPorTelefono({ pool, telefono }) {
  if (!pool) throw new Error('pool requerido');
  const t = normalizarTelefono(telefono);
  const result = await pool.query(
    `SELECT c.nro_cita, c.fecha_cita, c.hora_inicio, c.hora_fin,
            c.estado_cita, c.tipo_atencion, c.modalidad_consulta,
            NULLIF(TRIM(CONCAT_WS(' ', c.nombre_paciente, c.apellidos_paciente)),'') AS paciente
     FROM citas c
     WHERE regexp_replace(coalesce(c.celular, c.telefono, ''), '\D','','g') LIKE $1
        OR regexp_replace(coalesce(c.telefono,''),'\D','','g') LIKE $1
     ORDER BY c.fecha_cita ASC, c.hora_inicio ASC
     LIMIT 20`,
    [`%${t}`]
  );
  return result.rows;
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

