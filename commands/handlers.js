const { sendMessage, sendButtons, sendList } = require('../services/whatsapp');
const {
  saveContacto, getContactoByTelefono, upsertContactoBasico,
  buscarEnKB, getCategorias, logMensaje,
} = require('../services/mysql');

// Sesiones en memoria (estado por usuario)
const sesiones = {};

// ══════════════════════════════════════════════════════════
// TEXTOS FIJOS
// ══════════════════════════════════════════════════════════
const MENU = (nombre) =>
`👋 ¡Hola ${nombre}! Bienvenido a *${process.env.APP_NAME}*.

¿En qué te podemos ayudar hoy?

1️⃣  Conocer nuestros tratamientos
2️⃣  Hacer una pregunta
3️⃣  Agendar una consulta
4️⃣  Registrar mis datos
5️⃣  Hablar con un asesor

Escribe el número o escribe tu pregunta directamente. 😊`;

const AYUDA =
`🤖 *Comandos disponibles:*

• *menú* — Ver opciones principales
• *1* — Tratamientos disponibles
• *2* — Hacer una pregunta
• *3* — Agendar consulta
• *4* — Registrar mis datos
• *5* — Hablar con un asesor
• *consultar* — Ver mis datos guardados
• *guardar:Nombre, Apellido, email* — Registrarse

O simplemente escribe tu pregunta y te respondo. 💬`;

// ══════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════
async function handleIncomingMessage(message, contact) {
  const telefono = contact.wa_id;
  const nombre   = contact.profile?.name || 'Paciente';
  const tipo     = message.type;

  // Extraer texto según tipo de mensaje
  let texto = '';
  if (tipo === 'text') {
    texto = message.text?.body || '';
  } else if (tipo === 'interactive') {
    texto = message.interactive?.button_reply?.title
         || message.interactive?.list_reply?.title
         || '';
  } else {
    await send(telefono, nombre, 'entrada', texto,
      'Solo proceso mensajes de texto por ahora. Escribe *menú* para empezar. 😊');
    return;
  }

  const tl = texto.toLowerCase().trim();
  console.log(`📩 [${telefono}] ${nombre}: "${texto}"`);

  // Registrar contacto básico y log
  await upsertContactoBasico(telefono, nombre).catch(() => {});
  await logMensaje(telefono, nombre, 'entrada', texto);

  try {

    // ── MENÚ ────────────────────────────────────────────────
    if (['menu','menú','inicio','hola','hi','hello','start','0','ayuda','help'].includes(tl)) {
      sesiones[telefono] = { estado: 'menu' };
      await send(telefono, nombre, 'salida', MENU(nombre));
      return;
    }

    // ── OPCIÓN 1: Tratamientos ───────────────────────────────
    if (tl === '1') {
      const cats = await getCategorias();
      if (!cats.length) {
        await send(telefono, nombre, 'salida',
          'Aún estamos cargando nuestra información. Escribe *5* para hablar con un asesor. 😊');
        return;
      }
      const lista = cats.map((c, i) => `${i + 1}. ${c.categoria}`).join('\n');
      sesiones[telefono] = { estado: 'esperando_categoria', cats };
      await send(telefono, nombre, 'salida',
        `📚 *Nuestras áreas de tratamiento:*\n\n${lista}\n\nEscribe el nombre del área que te interesa o haz tu pregunta directamente.`);
      return;
    }

    // ── OPCIÓN 2: Pregunta directa ───────────────────────────
    if (tl === '2') {
      sesiones[telefono] = { estado: 'esperando_pregunta' };
      await send(telefono, nombre, 'salida',
        '💬 *¿Qué quieres saber?*\n\nEscribe tu pregunta sobre nuestros tratamientos, procedimientos, costos, candidatos, etc.');
      return;
    }

    // ── OPCIÓN 3: Agendar consulta ───────────────────────────
    if (tl === '3' || tl.includes('agendar') || tl.includes('cita') || tl.includes('consulta')) {
      const resp =
        `📅 *Agendar Consulta de Evaluación*\n\n` +
        `El primer paso en Stemwell es una evaluación médica para determinar si eres candidato a nuestros tratamientos.\n\n` +
        `📞 *WhatsApp:* Responde aquí mismo\n` +
        `📧 *Email:* ${process.env.BACKOFFICE_EMAIL}\n\n` +
        `Un asesor te confirmará disponibilidad en horario de oficina:\n` +
        `🕘 Lunes–Viernes: 8:00am – 6:00pm\n` +
        `🕘 Sábados: 9:00am – 1:00pm\n\n` +
        `¿Quieres que registremos tus datos para contactarte? Escribe *4*.`;
      await send(telefono, nombre, 'salida', resp);
      return;
    }

    // ── OPCIÓN 4: Registrar datos ────────────────────────────
    if (tl === '4') {
      sesiones[telefono] = { estado: 'esperando_datos' };
      await send(telefono, nombre, 'salida',
        `📝 *Registro de Datos*\n\nEnvía tus datos en este formato:\n\n` +
        `*guardar:Nombre, Apellido, email@correo.com*\n\n` +
        `Ejemplo:\n*guardar:María, García, maria@gmail.com*\n\n` +
        `El email es opcional.`);
      return;
    }

    // ── GUARDAR datos (comando directo) ──────────────────────
    if (tl.startsWith('guardar:') || tl.startsWith('registrar:')) {
      const raw    = texto.slice(texto.indexOf(':') + 1);
      const parts  = raw.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const [nom, ape, email = ''] = parts;
        await saveContacto({ nombre: nom, apellido: ape, email, telefono });
        await send(telefono, nombre, 'salida',
          `✅ *Datos registrados correctamente*\n\n` +
          `👤 ${nom} ${ape}\n` +
          `📧 ${email || 'Sin email'}\n` +
          `📱 ${telefono}\n\n` +
          `Un asesor se pondrá en contacto contigo pronto. 😊`);
      } else {
        await send(telefono, nombre, 'salida',
          `❌ Formato incorrecto. Usa:\n*guardar:Nombre, Apellido, email*`);
      }
      sesiones[telefono] = { estado: 'menu' };
      return;
    }

    // ── OPCIÓN 5: Asesor humano ──────────────────────────────
    if (tl === '5' || tl.includes('asesor') || tl.includes('humano') || tl.includes('persona')) {
      await send(telefono, nombre, 'salida',
        `🧑‍💼 *Conectando con un asesor*\n\n` +
        `Hemos notificado a nuestro equipo. Un asesor te atenderá en breve.\n\n` +
        `⏰ Horario de atención:\n` +
        `Lunes–Viernes: 8:00am – 6:00pm\n` +
        `Sábados: 9:00am – 1:00pm\n\n` +
        `📧 Si es urgente: ${process.env.BACKOFFICE_EMAIL}`);
      return;
    }

    // ── CONSULTAR mis datos ──────────────────────────────────
    if (tl === 'consultar' || tl === 'mis datos') {
      const c = await getContactoByTelefono(telefono);
      if (c && (c.nombre || c.apellido)) {
        await send(telefono, nombre, 'salida',
          `📋 *Tus datos registrados:*\n\n` +
          `👤 ${c.nombre} ${c.apellido}\n` +
          `📧 ${c.email || 'Sin email'}\n` +
          `📱 ${c.telefono}\n` +
          `📅 Desde: ${new Date(c.creado_en).toLocaleDateString('es-CO')}`);
      } else {
        await send(telefono, nombre, 'salida',
          `❌ No tienes datos registrados.\n\nEscribe *4* o usa:\n*guardar:Nombre, Apellido, email*`);
      }
      return;
    }

    // ── BÚSQUEDA EN BASE DE CONOCIMIENTO ─────────────────────
    // Cualquier otro texto va directo a la KB
    const resultados = await buscarEnKB(texto);

    if (resultados.length > 0) {
      const principal = resultados[0];
      let resp = `🔍 *${principal.pregunta}*\n\n${principal.respuesta}`;

      if (resultados.length > 1) {
        resp += `\n\n---\n💡 *También podría interesarte:*\n`;
        resp += resultados.slice(1).map(r => `• ${r.pregunta}`).join('\n');
        resp += `\n\nEscribe el tema para más detalle.`;
      }

      resp += `\n\n¿Tienes otra pregunta? Escríbela o escribe *menú*.`;
      await send(telefono, nombre, 'salida', resp);
    } else {
      // No encontró nada en la KB
      await send(telefono, nombre, 'salida',
        `Hmm, no encontré información específica sobre eso. 🤔\n\n` +
        `Puedes:\n` +
        `• Reformular tu pregunta con otras palabras\n` +
        `• Escribir *1* para ver nuestros tratamientos\n` +
        `• Escribir *5* para hablar con un asesor\n` +
        `• Escribir *menú* para ver todas las opciones`);
    }

  } catch (err) {
    console.error('❌ Error en handler:', err);
    await sendMessage(telefono,
      '❌ Ocurrió un error. Por favor intenta de nuevo o escribe *menú*.'
    ).catch(() => {});
  }
}

// Helper: enviar y loggear salida
async function send(telefono, nombre, direccion, texto, override) {
  const msg = override || texto;
  await sendMessage(telefono, msg);
  if (direccion === 'salida') {
    await logMensaje(telefono, nombre, 'salida', msg).catch(() => {});
  }
}

module.exports = { handleIncomingMessage };