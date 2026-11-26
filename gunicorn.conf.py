"""Allow the existing bounded budget HTTP + gRPC fallback to finish."""
import math
from pathlib import Path
from dotenv import load_dotenv
from server.projects.settings import timeout_seconds

load_dotenv(Path(__file__).resolve().parent / ".env")
# Two sequential Projects transport budgets plus authentication/response margin.
timeout = math.ceil(2 * timeout_seconds() + 30)
