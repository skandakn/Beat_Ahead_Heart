import sys
from pathlib import Path

# Add backend root to sys.path so modules like src.ml_service and src.inference can be imported
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.ml_service import MLServiceRequestHandler

handler = MLServiceRequestHandler
app = MLServiceRequestHandler
