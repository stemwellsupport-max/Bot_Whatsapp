// ============================================================
// Contraseña del módulo principal (/consentimiento/...)
//
// - La clave está en la variable de entorno MODULO_PASSWORD (archivo .env).
// - Al escribirla bien, el navegador recibe una cookie firmada (7 días) y no
//   la vuelve a pedir en ese aparato. Cambiar la clave cierra todas las sesiones.
// - Quedan PÚBLICAS (sin clave): la encuesta de satisfacción, la calificación
//   rápida y la página de la clave. Todo lo demás pide clave.
// - Si alguien falla 5 veces seguidas desde la misma conexión, queda bloqueado
//   15 minutos.
// ============================================================

const crypto = require('crypto');

const COOKIE = 'sw_acceso';
const DURACION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const MAX_FALLOS = 5;
const VENTANA_FALLOS_MS = 15 * 60 * 1000; // 15 minutos

const RUTA_PROTEGIDA = /^\/consentimientos?(\/|$)/;
const RUTAS_PUBLICAS = [
  /^\/consentimiento\/calificacion(\/|$)/, // calificación rápida
  /^\/consentimiento\/login(\/|$)/,        // página de la clave
  /^\/consentimiento\/salir$/,             // cerrar sesión
  /^\/consentimiento\/qr-imagen$/,         // imagen QR que usa la encuesta
  /^\/consentimiento\/encuesta\/?$/,       // encuesta de satisfacción (página)
  /^\/consentimiento\/encuesta\/index\.html$/,
];
const POST_PUBLICOS = [/^\/consentimiento\/encuesta\/guardar$/]; // envío de la encuesta

function clave() { return process.env.MODULO_PASSWORD || ''; }

function firmar(exp) {
  return crypto.createHmac('sha256', clave()).update(`acceso|${exp}`).digest('hex');
}

function crearToken() {
  const exp = Date.now() + DURACION_MS;
  return `${exp}.${firmar(exp)}`;
}

function tokenValido(token) {
  if (!clave() || !token) return false;
  const [exp, firma] = String(token).split('.');
  if (!/^\d+$/.test(exp || '') || Number(exp) < Date.now()) return false;
  const a = Buffer.from(firma || '');
  const b = Buffer.from(firmar(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function claveCorrecta(intento) {
  if (!clave()) return false;
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(hash(intento), hash(clave()));
}

function leerCookie(req, nombre) {
  const par = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${nombre}=`));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : '';
}

// ── Bloqueo por intentos fallidos ───────────────────────────
const fallosPorIp = new Map(); // ip -> [marcas de tiempo]
function fallosRecientes(ip) {
  const ahora = Date.now();
  const lista = (fallosPorIp.get(ip) || []).filter((t) => ahora - t < VENTANA_FALLOS_MS);
  if (lista.length) fallosPorIp.set(ip, lista); else fallosPorIp.delete(ip);
  return lista;
}
const bloqueado = (ip) => fallosRecientes(ip).length >= MAX_FALLOS;
function registrarFallo(ip) { const l = fallosRecientes(ip); l.push(Date.now()); fallosPorIp.set(ip, l); }
const limpiarFallos = (ip) => fallosPorIp.delete(ip);

// Solo se acepta volver a una ruta interna del módulo (evita redirigir a sitios externos).
function destinoSeguro(next) {
  return typeof next === 'string' && /^\/consentimientos?(\/|$)/.test(next) && !next.startsWith('//')
    ? next : '/consentimiento/';
}

function opcionesCookie(req) {
  return { maxAge: DURACION_MS, httpOnly: true, sameSite: 'lax', path: '/', secure: !!req.secure };
}

// Middleware: pide clave en todo el módulo, salvo las rutas públicas.
function protegerModulo(req, res, next) {
  if (!RUTA_PROTEGIDA.test(req.path)) return next();
  if (RUTAS_PUBLICAS.some((r) => r.test(req.path))) return next();
  if (req.method === 'POST' && POST_PUBLICOS.some((r) => r.test(req.path))) return next();
  if (tokenValido(leerCookie(req, COOKIE))) return next();

  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.redirect(`/consentimiento/login/?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(403).json({ mensaje: 'Se requiere la contraseña del módulo.' });
}

// POST /consentimiento/login  { clave }
function iniciarSesion(req, res) {
  if (!clave()) {
    return res.status(503).json({ mensaje: 'La contraseña del módulo no está configurada.' });
  }
  if (bloqueado(req.ip)) {
    console.warn(`🚫 Login bloqueado por demasiados intentos desde ${req.ip}`);
    return res.status(429).json({ mensaje: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' });
  }
  if (!claveCorrecta((req.body || {}).clave)) {
    registrarFallo(req.ip);
    console.warn(`🔒 Contraseña incorrecta del módulo desde ${req.ip}`);
    return res.status(401).json({ mensaje: 'Contraseña incorrecta.' });
  }
  limpiarFallos(req.ip);
  res.cookie(COOKIE, crearToken(), opcionesCookie(req));
  res.json({ ok: true, destino: destinoSeguro((req.body || {}).next) });
}

// GET /consentimiento/salir
function cerrarSesion(req, res) {
  res.clearCookie(COOKIE, { path: '/' });
  res.redirect('/consentimiento/login/');
}

module.exports = { protegerModulo, iniciarSesion, cerrarSesion };
