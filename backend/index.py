import sys
from pathlib import Path

# Add backend root to sys.path so modules like api.index, src.ml_service and src.inference can be imported
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api.index import app, handler

__all__ = ["app", "handler"]
