@echo off
setlocal

py -m pip install --upgrade pip
py -m pip install .[build]
pyinstaller --onefile --name signature-wall ^
  --hidden-import=uvicorn.logging ^
  --hidden-import=uvicorn.loops.auto ^
  --hidden-import=uvicorn.protocols.http.auto ^
  --hidden-import=uvicorn.protocols.websockets.auto ^
  --hidden-import=uvicorn.lifespan.on ^
  --add-data "signature_wall\static;signature_wall\static" ^
  --add-data "signature_wall\templates;signature_wall\templates" ^
  app.py

echo.
echo Build completed. Output: dist\signature-wall.exe
endlocal
