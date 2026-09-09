"""One bounded synthetic schema check; no company facts or credentials are printed."""
import os
from pathlib import Path

from google import genai
from google.genai import types

from anthrion_signal.config import load_config
from anthrion_signal.intelligence import provider_schema
from anthrion_signal.models import Analysis

root = Path.cwd()
config = load_config(root)
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
try:
    response = client.models.generate_content(model=config["runtime"]["model"],
        contents="Schema validation test only. No source facts or company facts have been provided. Return all dimensions UNKNOWN and all arrays empty. Summary: No information supplied for assessment.",
        config=types.GenerateContentConfig(response_mime_type="application/json",
            response_schema=provider_schema(), max_output_tokens=16000))
    print("Response received", len(response.text or ""))
    root.joinpath("tmp").mkdir(exist_ok=True)
    (root / "tmp/ai_response.json").write_text(response.text or "", encoding="utf-8")
    analysis = Analysis.model_validate_json(response.text)
    print("Schema validation passed")
except Exception as exc:
    message = str(exc).replace(os.environ["GEMINI_API_KEY"], "[redacted]")
    print(type(exc).__name__, message[:2200])
finally:
    client.close()
