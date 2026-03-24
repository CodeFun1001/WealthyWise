import google.generativeai as genai
import json
import re
import os
from dotenv import load_dotenv

load_dotenv()

def init_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        raise ValueError("❌ GEMINI_API_KEY not found in .env file")

    genai.configure(api_key=api_key)

    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json"
        )
    )

def call_agent(model, prompt: str, system: str = "") -> dict:
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    try:
        response = model.generate_content(full_prompt)
        text = response.text.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)
    except json.JSONDecodeError:
        return {"error": "Could not parse AI response", "raw": response.text}
    except Exception as e:
        return {"error": str(e)}

def format_inr(amount: float) -> str:
    if amount >= 1_00_00_000:
        return f"₹{amount/1_00_00_000:.2f} Cr"
    elif amount >= 1_00_000:
        return f"₹{amount/1_00_000:.2f} L"
    else:
        return f"₹{amount:,.0f}"