# backend/routers/__init__.py
# 각 라우터 모듈을 패키지로 노출
# Python으로 치면: __all__ = ['pages', 'categories', ...]

from backend.routers import categories, export_import, pages, search, system, templates

__all__ = ["pages", "categories", "export_import", "search", "system", "templates"]
