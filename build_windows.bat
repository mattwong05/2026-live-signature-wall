@echo off
setlocal

py -m pip install --upgrade pip
py -m pip install .[build]
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

pyinstaller --onedir --windowed --name signature-wall ^
  --hidden-import=uvicorn.logging ^
  --hidden-import=uvicorn.loops.auto ^
  --hidden-import=uvicorn.protocols.http.auto ^
  --hidden-import=uvicorn.protocols.websockets.auto ^
  --hidden-import=uvicorn.lifespan.on ^
  --add-data "signature_wall\static;signature_wall\static" ^
  --add-data "signature_wall\templates;signature_wall\templates" ^
  app.py

echo.
echo Build completed. Output folder: dist\signature-wall\
echo Main executable: dist\signature-wall\signature-wall.exe
endlocal
