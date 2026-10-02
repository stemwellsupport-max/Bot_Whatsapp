// ============================================================
// Frenos contra envíos repetidos o masivos en las encuestas públicas
// (encuesta completa y calificación rápida).
//
// Como las encuestas son anónimas y públicas, no se puede saber con
// certeza "quién es quién". Por eso se usan varias capas suaves que no
// bloquean a pacientes reales (en la clínica varios comparten la misma
// conexión de internet o el mismo aparato):
//   1. Límite de envíos por conexión (IP) por hora.
//   2. Trampa para robots (campo invisible + tiempo mínimo de llenado).
// El mismo límite se aplica a las dos encuestas en conjunto.
// ============================================================

const VENTANA_MS = 60 * 60 * 1000; // 1 hora
const MAX_ENVIOS_POR_VENTANA = 12; // por IP, entre encuesta completa y calificación rápida

const enviosPorIp = new Map(); // ip -> [marcas de tiempo de envíos aceptados]

function limpiar(ip, ahora) {
  const recientes = (enviosPorIp.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length) enviosPorIp.set(ip, recientes);
  else enviosPorIp.delete(ip);
  return recientes;
}

// Devuelve true (y lo anota) si esta conexión todavía puede enviar; false si ya
// llegó al máximo de la última hora.
function permitirEnvio(ip) {
  const ahora = Date.now();
  const recientes = limpiar(ip, ahora);
  if (recientes.length >= MAX_ENVIOS_POR_VENTANA) return false;
  recientes.push(ahora);
  enviosPorIp.set(ip, recientes);
  return true;
}

// Barrido periódico para que el mapa no crezca sin fin.
const barrido = setInterval(() => {
  const ahora = Date.now();
  for (const ip of Array.from(enviosPorIp.keys())) limpiar(ip, ahora);
}, VENTANA_MS);
if (typeof barrido.unref === 'function') barrido.unref();

// Un robot rellena el campo invisible `campo_extra_x` (una persona no lo ve) o
// envía el formulario en menos tiempo del que una persona tarda en leerlo.
function pareceRobot({ campo_extra_x, tiempo_ms }, minimoMs) {
  if (campo_extra_x) return true;
  if (Number.isFinite(tiempo_ms) && tiempo_ms < minimoMs) return true;
  return false;
}

module.exports = { permitirEnvio, pareceRobot, MAX_ENVIOS_POR_VENTANA };
