@echo off
setlocal
cd /d "%~dp0"
set "WRANGLER_SEND_METRICS=false"
node scripts\local-web\prepare.mjs %1
if errorlevel 1 goto failed
cd scripts\local-web
call npm exec --yes --prefer-offline --package=wrangler@4.151.3 -- wrangler dev --local --config wrangler.jsonc --persist-to ../../private/local-web/state --show-interactive-dev-session=false
if not errorlevel 1 exit /b 0
:failed
echo Birge local server could not start.
pause
exit /b 1
