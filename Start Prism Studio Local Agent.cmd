@echo off
setlocal
set "PROJECT=C:\Users\Jayden\Documents\Codex\2026-09-08\i-ha\outputs\Prism Studio"
set "OLLAMA=C:\Users\Jayden\AppData\Local\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA%" (
  echo Ollama is not installed yet. Install it from https://ollama.com/download/windows
  pause
  exit /b 1
)
cd /d "%PROJECT%"
echo Local agent: qwen2.5-coder:7b
echo Project: %PROJECT%
echo Keep tasks small and review changes before building.
"%OLLAMA%" launch opencode --model qwen2.5-coder:7b
pause
