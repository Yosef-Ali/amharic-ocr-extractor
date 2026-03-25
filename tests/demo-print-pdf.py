#!/usr/bin/env python3
"""
Full Pipeline Demo: Prayer Book PDF → OCR → Print-Ready PDF
Produces a beautiful, layout-faithful output for Aba Temsgen.
"""

import fitz  # PyMuPDF
import base64
import json
import os
import sys
import time
import re
from pathlib import Path

ROOT = Path("/Users/mekdesyared/amharic-ocr-extractor")
OUTPUT_DIR = ROOT / "tests" / "demo-output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Load API key
env_path = ROOT / ".env"
api_key = ""
for line in env_path.read_text().splitlines():
    if line.startswith("VITE_GEMINI_API_KEY="):
        api_key = line.split("=", 1)[1].strip()
if not api_key:
    print("❌ No API key"); sys.exit(1)

import requests
import warnings
warnings.filterwarnings("ignore")

MODEL = "gemini-3.1-flash-image-preview"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={api_key}"

PDF_PATH = "/Users/mekdesyared/Downloads/Amharic_Prayer_Book_Editable_First5.pdf"

# ── Production OCR prompt (Pass 1) ──
OCR_PROMPT = """You are an expert multilingual OCR engine.
TASK: Extract ALL text from this page image with 100% accuracy.
CRITICAL — AMHARIC / ETHIOPIC TEXT RULES:
- NEVER substitute, correct, or modernize any Amharic word.
- Distinguish: ሀ ≠ ሐ ≠ ኀ | ሰ ≠ ሠ | ጸ ≠ ፀ | አ ≠ ዐ
- Preserve ALL Ethiopic punctuation: ። ፣ ፤ ፡ ::
- Output ONLY raw text, no explanations.
- Preserve paragraph breaks. Mark headers with "### ".
- Two columns: separate with "---COLUMN BREAK---".
Extract now:"""

def render_page(pdf_path, page_num, scale=2.0):
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    img_bytes = pix.tobytes("jpeg")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")

def ocr_page(b64_img):
    payload = {"contents": [{"role": "user", "parts": [
        {"inlineData": {"mimeType": "image/jpeg", "data": b64_img}},
        {"text": OCR_PROMPT}
    ]}]}
    resp = requests.post(API_URL, json=payload, timeout=180)
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]

def main():
    doc = fitz.open(PDF_PATH)
    total = len(doc)
    doc.close()
    print(f"📖 Prayer Book: {total} pages\n")
    
    all_pages = []
    for pg in range(1, total + 1):
        print(f"  Page {pg}/{total}...", end=" ", flush=True)
        t0 = time.time()
        b64 = render_page(PDF_PATH, pg)
        text = ocr_page(b64)
        elapsed = time.time() - t0
        print(f"✅ ({elapsed:.1f}s, {len(text)} chars)")
        all_pages.append({"page": pg, "text": text})
        if pg < total:
            print("  ⏳ Rate limit (6s)...")
            time.sleep(6)

    # Save results as JSON for PDF generation
    result_path = OUTPUT_DIR / "prayer_book_ocr.json"
    result_path.write_text(json.dumps(all_pages, ensure_ascii=False, indent=2))
    print(f"\n📄 OCR results saved: {result_path}")
    
    # Also save combined text
    combined = ""
    for p in all_pages:
        combined += f"\n{'═' * 50}\n  Page {p['page']}\n{'═' * 50}\n\n"
        combined += p["text"] + "\n"
    
    txt_path = OUTPUT_DIR / "prayer_book_text.txt"
    txt_path.write_text(combined, encoding="utf-8")
    print(f"📄 Full text saved: {txt_path}")
    print(f"\n✅ Done! {total} pages extracted.")

if __name__ == "__main__":
    main()
