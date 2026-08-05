# Configuración del Bot WhatsApp Stemwell

> :bulb: No puedes poner secretos en `.env` al repositorio. Usa un archivo `.env` local (desde `.gitignore`).

## Variables de entorno que el bot usa

### Servidor
| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor Express | `3000` |
| `VERIFY_TOKEN` | Token de verificación del webhook (configurado en Meta) | — |
| `APP_URL` | URL pública (ngrok) para el QR de consentimiento | `https://stemwell.bot.com.ngrok.dev` |

### WhatsApp / Meta
| Variable | Descripción |
|----------|-------------|
| `META_TOKEN` | Token de acceso permanente de WhatsApp Business API |
| `META_PHONE_NUMBER_ID` | Phone Number ID de WhatsApp |

### PostgreSQL (compartida con el CRM)
| Variable | Descripción | Default |
|----------|-------------|---------|
| `PG_HOST` | Host de la BD | `localhost` |
| `PG_PORT` | Puerto | `5432` |
| `PG_DATABASE` | Base de datos | `stemwell` |
| `PG_USER` | Usuario | `crm_user` |
| `PG_PASSWORD` | Contraseña del usuario PostgreSQL | — |

> ⚠️ En Docker, `PG_HOST` debe ser `host.docker.internal` para acceder al PostgreSQL que corre en el host de Windows.

### IA
| Variable | Descripción |
|----------|-------------|
| `LM_STUDIO_URL` | URL de LM Studio (IA local) |
| `LM_MODEL` | Modelo de LM Studio |
| `DEEPSEEK_API_KEY` | (Opcional) Clave de DeepSeek para IA en la nube |
| `DEEPSEEK_MODEL` | Modelo de DeepSeek |

### Agenda
| Variable | Descripción |
|----------|-------------|
| `AGENDA_URL` | Enlace de agenda de la clínica |
| `HORARIOS` | Horarios de referencia por defecto (separados por coma) |

### API del CRM (para agendar/cancelar - opcional en Fase 1)
| Variable | Descripción |
|----------|-------------|
| `CRM_API_URL` | URL de la API del CRM |
| `CRM_BOT_EMAIL` | Email de un usuario del CRM (para token) |
| `CRM_BOT_PASSWORD` | Contraseña |

## Docker

El `docker-compose.yml` levanta el bot y ngrok, conectándose al PostgreSQL del host
via `host.docker.internal:5432` y uniéndose a la **red externa del CRM**
(`crm_api_default`) para poder hablar con la API del CRM por el nombre de servicio `api:8001`.

| Variable del bot en Docker | Valor |
|----------------------------|-------|
| `PG_HOST` | `host.docker.internal` (PostgreSQL en el host de Windows) |
| `CRM_API_URL` | `http://api:8001` (servicio del CRM dentro de su red Docker) |
| `NGROK_URL` | `stemwell.bot.com.ngrok.dev` (túnel dedicado del bot) |
| `APP_URL` | `https://stemwell.bot.com.ngrok.dev` (QR de consentimiento) |

> El bot levanta su propio ngrok (`bot-ngrok`) apuntando al dominio `stemwell.bot.com.ngrok.dev`,
> independiente del ngrok del CRM (`stemwell-ngrok`).

### Red Docker compartida
Para que el bot acceda a la API del CRM por nombre (`api`), debe estar unido a la red
`crm_api_default` (external) del CRM. Si el CRM se levanta con `docker compose` desde
`C:\Users\PC\crm_api`, esa red ya existe y el bot la reutiliza.

