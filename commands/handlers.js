// ============================================================
// commands/handlers.js - VERSIÓN SIMPLIFICADA
// SOLO IA - SIN FLUJOS, SIN BOTONES, SIN MENÚS
// ============================================================

const { sendMessage } = require('../services/whatsapp');
const {
  getContactoByTelefono, upsertContactoBasico, logMensaje,
} = require('../services/postgres');
const { getSesion, setSesion, resetSesion } = require('../services/sesiones');
const { responderConIA, detectarIdioma } = require('../services/ia-local');

function pausaNatural() {
  const ms = Math.floor(Math.random() * 800) + 400;
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleIncomingMessage(message, contact) {
  const telefono = contact.wa_id;
  const nombre = contact.profile?.name || '';
  const tipo = message.type;
  let texto = '';
  
  if (tipo === 'text') texto = message.text?.body || '';
  else if (tipo === 'interactive') texto = message.interactive?.button_reply?.title || '';
  
  if (!texto || texto.length < 2) return;
  
  let sesion = getSesion(telefono);
  let idioma = sesion.idioma || detectarIdioma(texto);
  
  console.log(`📩 [${telefono}] ${nombre}: "${texto}" (${idioma === 'en' ? '🇺🇸' : '🇪🇸'})`);

  await upsertContactoBasico(telefono, nombre).catch(() => {});
  await logMensaje(telefono, nombre, 'entrada', texto);

  setSesion(telefono, { mensajes: (sesion.mensajes || 0) + 1, idioma: idioma });

  try {
    const respuestaIA = await responderConIA(texto, nombre, telefono, idioma);
    
    if (respuestaIA) {
      await pausaNatural();
      await sendMessage(telefono, respuestaIA);
      await logMensaje(telefono, nombre, 'salida', respuestaIA);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    await sendMessage(telefono, `Lo siento, tuve un error. 🙏`);
  }
}

module.exports = { handleIncomingMessage };