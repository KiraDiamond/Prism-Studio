@echo off
cd /d "%~dp0"
python scripts\guild_sorter_app.py
if errorlevel 1 (
  echo.
  echo Guild Cape Sorter could not start. Install Python and run:
  echo python -m pip install -r scripts\requirements-catalog.txt
  pause
)
