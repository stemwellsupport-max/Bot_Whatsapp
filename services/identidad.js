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
// Busca solo en la tabla leads del CRM.
// Siempre devuelve array de objetos { id, nombre, telefono, email, doctor_id }.
async function buscarLead({ pool, telefono, email }) {
  if (!pool) throw new Error('pool requerido');

  try {
    const params = [];
    const where = [];
    if (telefono) {
      const t = normalizarTelefono(telefono);
      if (t.length >= 8) {
        params.push(`%${t}`);
        where.push(`regexp_replace(coalesce(telefono,''),'[^0-9]','','g') LIKE $${params.length}`);
      }
    }
    if (email && /@/.test(email)) {
      params.push(email.trim());
      where.push(`lower(email) = lower($${params.length})`);
    }
    if (!where.length) return [];
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
    return result.rows;
  } catch (e) {
    console.error('❌ [buscarLead] Error consultando leads:', e.message);
    return [];
  }
}

// ── Obtener citas del paciente (tabla citas del CRM) ───────
async function getCitasPorTelefono({ pool, telefono, leadId = null }) {
  if (!pool) throw new Error('pool requerido');
  const t = normalizarTelefono(telefono);
  try {
    const result = await pool.query(
      `SELECT c.nro_cita, c.fecha_cita, c.hora_inicio, c.hora_fin,
              c.estado_cita, c.tipo_atencion, c.modalidad_consulta,
              NULLIF(TRIM(CONCAT_WS(' ', c.nombre_paciente, c.apellidos_paciente)),'') AS paciente,
              'crm' AS fuente
       FROM citas c
       WHERE c.lead_id = $2
          OR regexp_replace(coalesce(c.celular, c.telefono, ''),'[^0-9]','','g') LIKE $1
          OR regexp_replace(coalesce(c.telefono,''),'[^0-9]','','g') LIKE $1
       ORDER BY c.fecha_cita ASC, c.hora_inicio ASC
       LIMIT 20`,
      [`%${t}`, leadId]
    );
    return result.rows;
  } catch (e) {
    console.error('❌ [getCitasPorTelefono] Error:', e.message);
    return [];
  }
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
