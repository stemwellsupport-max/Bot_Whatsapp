# ============================================================
# Dockerfile del Bot WhatsApp Stemwell
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos y resolver dependencias
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# ------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Solo copiamos runtime deps instaladas y el código
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Crear dirs que el bot usa en runtime
RUN mkdir -p public/consentimientos pdfs documents

EXPOSE 3000

CMD ["node", "bot.js"]
