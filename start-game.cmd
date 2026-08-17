@echo off
rem 豊島ダウンヒル ローカル起動用
rem このファイルをダブルクリックすると、ゲームがブラウザで開きます。
setlocal
set "GAME_DIR=%~dp0"
set "GAME_PORT=8940"

rem Python を探す（py ランチャー → python の順）
set "PY_CMD="
where py >nul 2>&1 && set "PY_CMD=py -3"
if not defined PY_CMD (
  where python >nul 2>&1 && set "PY_CMD=python"
)

if not defined PY_CMD (
  echo Python が見つかりませんでした。
  echo https://www.python.org/downloads/ からインストールしてください。
  echo （インストール時に "Add Python to PATH" にチェックを入れてください）
  pause
  exit /b 1
)

echo サーバーを起動しています... ポート %GAME_PORT%
start "Teshima Downhill Server" /min %PY_CMD% -m http.server %GAME_PORT% --bind 127.0.0.1 --directory "%GAME_DIR%"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%GAME_PORT%/index.html"
endlocal
