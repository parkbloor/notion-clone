@echo off
echo FastAPI 백엔드 시작 중...
cd /d "%~dp0"
python -m uvicorn backend.main:app --reload --port 8000
pause
