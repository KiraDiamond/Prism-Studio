@echo off
cd /d "%~dp0"
if not exist work mkdir work
python scripts\auto_sort_guild_capes.py > work\guild-sort.log 2>&1
if errorlevel 1 (
  echo Automatic sorting stopped with an error. See work\guild-sort.log.
  pause
)
