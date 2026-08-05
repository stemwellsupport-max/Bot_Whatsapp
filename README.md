# 🤖 Whatsapp Bot Stemwell

Bot de WhatsApp para **Stemwell Medicina Regenerativa**. Su objetivo es que las personas:

- Consulten información (servicios, doctores, precios, horarios).
- **Agenden citas.**
- **Cancelen citas.**
- **Reagenden citas.**
- **Consulten disponibilidad** de citas.
- **Hablen con un asesor** humano directamente.

Usa la **WhatsApp Business Cloud API** y responde con IA local (**LM Studio**) y/o **DeepSeek** (API key).

---

## 🏗️ Arquitectura (contexto)

```
┌──────────────┐    ngrok      ┌──────────────────────────────┐
│   WhatsApp   │◄────────────►│   Bot (Docker) puerto 3000    │
└──────────────┘              │  - Express / webhook          │
                              │  - services/whatsapp.js       │
                              │  - services/ia-local.js       │
                              │  - services/agenda.js         │
                              │  - services/intents.js        │
                              │  - services/deepseek.js       │
                              └──────────┬────────────────────┘
                                         │ PostgreSQL compartido
                                         ▼
                              ┌──────────────────────────────┐
                              │   PostgreSQL (host o Docker) │
                              │  Tablas bot: wa_*, ia_*, ... │
                              │  Tablas CRM: citas, leads,...│
                              └──────────────────────────────┘
```

> ⚠️ **Regla importante:** el bot **comparte la base de datos con el CRM**, pero cada uno usa
> sus **propias tablas**. El bot **NO modifica la lógica del CRM**. Para agendar/cancelar usa la
> **API HTTP del CRM** (si se configuran credenciales) o deriva al asesor. Para consultar
> disponibilidad solo hace **lecturas (SELECT)** a tablas de solo lectura (`citas`).

---

## 📦 Estructura del proyecto

```
commands/
  handlers.js                 # Orquesta mensajes: IA + intenciones + agenda
services/
  whatsapp.js                 # Envío de mensajes (texto, botones, listas)
  ia-local.js                 # IA local (LM Studio) + gestión de encuesta
  deepseek.js                 # Cliente DeepSeek (API key) - opcional
  intents.js                  # Detección de intención (agenda, cancelar, asesor, info)
  agenda.js                   # Disponibilidad (lectura) + llamadas agendamiento al CRM
  postgres.js                 # Conexión y acceso a BD compartida (tablas propias)
  sesiones.js                 # Sesiones conversacionales (en memoria)
  aprendizaje.js              # Lógica de "aprendizaje" para el panel admin
admin/
  router.js                   # Panel admin (base de conocimiento, contactos, conversaciones)
  public/                     # HTML del panel
routes/
  consentimiento.js           # (base de conocimiento - datos verificados de la clínica)
public/
  consentimiento/             # Formulario HTML de consentimiento
  images/                     # Logos / QR
bot.js                        # Servidor Express + webhook + consentimiento + PDF
Dockerfile                    # Imagen del bot
docker-compose.yml            # Levanta bot + ngrok
```

---

## 🚀 Puesta en marcha

### Modo local (sin Docker)

```bash
npm install
# configura tu .env (ver ENV_CONFIG.md)
npm run dev        # o npm start
```

### Con Docker

```bash
# 1. Configura tu .env (ver ENV_CONFIG.md)
# 2. Levanta el bot y ngrok
docker compose up --build -d
```

El bot expone:
- Webhook: `http://localhost:3000/webhook`
- Consentimiento: `http://localhost:3000/consentimiento`
- QR: `http://localhost:3000/consentimiento/qr`

---

## 📝 Configuración

Ve a **ENV_CONFIG.md** para la lista completa de variables de entorno.

Las claves mínimas para que funcione:
- `VERIFY_TOKEN` y `META_TOKEN` + `META_PHONE_NUMBER_ID` (WhatsApp).
- `PG_*` (PostgreSQL compartido).
- `AGENDA_URL` (enlace de la agenda de la clínica).
- `APP_URL=https://stemwell.bot.com.ngrok.dev` (túnel ngrok dedicado del bot; usado en el QR de consentimiento).

> 📡 El bot levanta **su propio ngrok** (`bot-ngrok`) con el dominio
> **`https://stemwell.bot.com.ngrok.dev`**, independiente del ngrok del CRM (`stemwell-ngrok`).
> En Docker se une a la red externa `crm_api_default` del CRM para poder llamar a la API
> del CRM por el nombre de servicio `http://api:8001` cuando se requiera agendamiento por HTTP.
---

## 🗓️ Funcionalidades de agenda (Fase 1)

Consiste en un mini-flujo conversacional en `services/agenda.js` + `commands/handlers.js`:

1. El usuario pide agendar / consultar disponibilidad.
2. El bot pregunta el día.
3. Consulta disponibilidad (lectura de `citas` para esa fecha).
4. El usuario elige la hora.
5. (Pendiente) confirmar el agendamiento real en el CRM — actualmente deriva al asesor / enlace.

**Para escribir citas directamente en el CRM** en una fase futura, configura
`CRM_API_URL`, `CRM_BOT_EMAIL` y `CRM_BOT_PASSWORD` y completa `apiAgendar()` en
`services/agenda.js` con el endpoint correcto `PUT /leads/estado` del CRM.

---

## 🔒 Seguridad

- Las credenciales de base de datos **no deben** quedar como defaults. Configura `PG_*` por entorno.
- El webhook valida el `VERIFY_TOKEN` en el GET (handshake). Se recomienda añadir validación de la
  firma `X-Hub-Signature-256` en el POST para mayor seguridad.
- No exponer el `.env` ni los tokens de Meta.
