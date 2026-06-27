@echo off
REM Rafraîchit la session FFTT (résout le CAPTCHA + upload vers Supabase).
REM Lancé automatiquement par la tâche planifiée "PingPangFFTTRefresh".
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run fftt -- refresh-session >> "%~dp0refresh.log" 2>&1
