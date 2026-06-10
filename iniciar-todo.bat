@echo off
echo ============================================
echo       INICIANDO BOT WHATSAPP STEMWELL
echo ============================================
echo.

REM Iniciar el bot en una ventana
start "Bot WhatsApp Stemwell" cmd /k "cd /d C:\Users\PC\whatsapp-bot && node bot.js"

REM Esperar 3 segundos para que el bot inicie
timeout /t 3 /nobreak >nul

REM Iniciar túnel ngrok con dominio personalizado
start "Tunel Ngrok" cmd /k "ngrok http --domain=stemwell.bot.com.ngrok.dev 3000"

echo.
echo ✅ Bot WhatsApp iniciado
echo ✅ Túnel ngrok activo
echo 🌐 Dominio: https://stemwell.bot.com.ngrok.dev
echo.
echo ⚠️  No cierres las ventanas del bot ni del túnel
echo ============================================
pause