#!/usr/bin/env python3
"""
OCR Accuracy Test v2 — Image-based Pipeline (matches production app)

Renders individual PDF pages to JPEG images using PyMuPDF,
then sends each image to Gemini — exactly like the production app.

Usage:
  cd ~/amharic-ocr-extractor
  python3 tests/ocr-accuracy-v2.py
"""

import fitz  # PyMuPDF
import base64
import json
import os
import sys
import time
import re
from pathlib import Path

# ── Config ──
SCRIPT_DIR = Path(__file__).parent
ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = SCRIPT_DIR / "ocr-results-v2"
OUTPUT_DIR.mkdir(exist_ok=True)

# ── Load API key ──
env_path = ROOT / ".env"
api_key = ""
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if line.startswith("VITE_GEMINI_API_KEY="):
            api_key = line.split("=", 1)[1].strip()
if not api_key:
    print("❌ No VITE_GEMINI_API_KEY in .env")
    sys.exit(1)

MODEL = "gemini-3.1-flash-image-preview"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={api_key}"

import requests
import warnings
warnings.filterwarnings("ignore")

# ── Production OCR prompt (from geminiService.ts) ──
OCR_PROMPT = """You are an expert multilingual OCR engine that works with any document type.

TASK: Extract ALL text from this page image with 100% accuracy.

CRITICAL — AMHARIC / ETHIOPIC (ፊደል) TEXT RULES:
- NEVER substitute, correct, modernize, or "fix" any Amharic word. Output EXACTLY what is printed.
- Visually similar Ethiopic characters MUST be distinguished carefully:
  ሀ ≠ ሐ ≠ ኀ  |  ሰ ≠ ሠ  |  ጸ ≠ ፀ  |  አ ≠ ዐ
- Preserve ALL Ethiopic punctuation exactly: ። ፣ ፤ ፡ ::
- Church/religious texts use archaic forms — do NOT replace them with modern equivalents.
- If a word is unclear, output your best character-level reading — NEVER skip or paraphrase it.
- Mixed Amharic + English/numbers: keep both scripts exactly as printed.

GENERAL RULES:
- Output ONLY the raw text — nothing else, no explanations.
- Preserve every character, punctuation mark, and number exactly as it appears.
- Preserve paragraph breaks with blank lines.
- If two or more columns, extract left-to-right, separated by "---COLUMN BREAK---".
- Mark headers with "### " prefix.
- Do NOT translate, interpret, or add commentary.

Extract now:"""

# ── 10 diverse Amharic test samples (all < 20MB) ──
SAMPLES = [
    {"path": "/Users/mekdesyared/Downloads/Amharic_Prayer_Book_Editable_First5.pdf",
     "page": 3, "label": "01_prayer_modern", "type": "Catholic prayer (modern Amharic)"},
    {"path": "/Users/mekdesyared/Downloads/Amharic_Bible_First_20_Pages.pdf",
     "page": 5, "label": "02_bible_page5", "type": "Amharic Bible (typeset)"},
    {"path": "/Users/mekdesyared/Downloads/Amharic_Bible_First_20_Pages.pdf",
     "page": 12, "label": "03_bible_page12", "type": "Amharic Bible (mid)"},
    {"path": "/Users/mekdesyared/Downloads/አጫጭር ወጎች.pdf",
     "page": 3, "label": "04_short_stories", "type": "Short stories (prose)"},
    {"path": "/Users/mekdesyared/Downloads/አቢቹ .pdf",
     "page": 5, "label": "05_abichu_novel", "type": "Novel (አቢቹ)"},
    {"path": "/Users/mekdesyared/Downloads/ፍካሬ ኢየሱስ ወትንቢተ ሣቤላ.pdf",
     "page": 5, "label": "06_geez_religious", "type": "Ge'ez religious text"},
    {"path": "/Users/mekdesyared/Downloads/church_page_80_final.pdf",
     "page": 1, "label": "07_church_page", "type": "Church document"},
    {"path": "/Users/mekdesyared/Downloads/Hune.pdf",
     "page": 1, "label": "08_hune", "type": "Hune document"},
    {"path": "/Users/mekdesyared/Downloads/የካቲት 01፣ ዋና ቢሮ (1).pdf",
     "page": 2, "label": "09_yekatit_office", "type": "Office/formal document"},
    {"path": "/Users/mekdesyared/Mekra-Catholic-Bible/The Amharic Bible Catholic Edition - Emmaus.pdf",
     "page": 10, "label": "10_catholic_bible", "type": "Catholic Bible (Emmaus)"},
]

def render_page_to_jpeg(pdf_path, page_num, scale=2.0):
    """Render a single PDF page to JPEG base64 — matches app's pdfjs pipeline."""
    doc = fitz.open(pdf_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        return None, f"Page {page_num} out of range (doc has {len(doc)} pages)"
    page = doc[page_num - 1]  # 0-indexed
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("jpeg")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8"), None


def ocr_image(base64_jpeg):
    """Send a JPEG image to Gemini and get OCR text back."""
    payload = {
        "contents": [{
            "role": "user",
            "parts": [
                {"inlineData": {"mimeType": "image/jpeg", "data": base64_jpeg}},
                {"text": OCR_PROMPT}
            ]
        }]
    }
    resp = requests.post(API_URL, json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    text = data.get("candidates", [{}])[0] \
               .get("content", {}).get("parts", [{}])[0] \
               .get("text", "[NO OUTPUT]")
    return text

def assess_quality(text):
    """Automated quality assessment of OCR output."""
    if not text.strip() or text == "[NO OUTPUT]":
        return "FAIL", {"reason": "empty output"}
    
    has_amharic = bool(re.search(r'[\u1200-\u137F]', text))
    amharic_chars = len(re.findall(r'[\u1200-\u137F]', text))
    total_chars = len(text)
    ratio = (amharic_chars / total_chars * 100) if total_chars > 0 else 0
    has_punctuation = bool(re.search(r'[።፣፤፡]', text))
    has_garbage = bool(re.search(r'[□■◆◇●○]{3,}', text))
    has_cyrillic = bool(re.search(r'[а-яА-Я]{5,}', text))
    has_devanagari = bool(re.search(r'[\u0900-\u097F]{3,}', text))
    lines = [l for l in text.split('\n') if l.strip()]
    
    info = {
        "chars": total_chars, "amharic": amharic_chars,
        "ratio": f"{ratio:.1f}%", "lines": len(lines),
        "has_punctuation": has_punctuation,
    }
    
    if not has_amharic:
        return "FAIL", {**info, "reason": "no Amharic chars"}
    if has_garbage:
        return "POOR", {**info, "reason": "garbage symbols"}
    if has_cyrillic or has_devanagari:
        return "POOR", {**info, "reason": "wrong script mixed in"}
    if ratio < 20:
        return "POOR", {**info, "reason": f"low Amharic ratio ({ratio:.0f}%)"}
    if ratio < 40:
        return "FAIR", info
    return "GOOD", info

def run_tests():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Amharic OCR Test v2 — Image Pipeline (Production)  ║")
    print(f"║  Model: {MODEL:<43}║")
    print("╚══════════════════════════════════════════════════════╝\n")
    
    results = []
    for i, s in enumerate(SAMPLES):
        num = f"{i+1:02d}"
        print(f"\n── Test {num}/{len(SAMPLES)}: {s['type']} ──")
        print(f"   File: {Path(s['path']).name}, Page: {s['page']}")
        
        # Step 1: Render page to JPEG image
        if not Path(s["path"]).exists():
            print("   ❌ File not found")
            results.append({**s, "status": "ERROR", "reason": "File not found"})
            continue

        try:
            b64_img, err = render_page_to_jpeg(s["path"], s["page"])
            if err:
                print(f"   ❌ Render error: {err}")
                results.append({**s, "status": "ERROR", "reason": err})
                continue
            
            img_size_kb = len(b64_img) * 3 / 4 / 1024
            print(f"   📸 Page rendered to JPEG ({img_size_kb:.0f}KB)")
            
            # Save the rendered image for manual review
            img_path = OUTPUT_DIR / f"{s['label']}.jpg"
            img_path.write_bytes(base64.b64decode(b64_img))
            
            # Step 2: Send image to Gemini OCR
            t0 = time.time()
            text = ocr_image(b64_img)
            elapsed = time.time() - t0

            # Step 3: Assess quality
            quality, info = assess_quality(text)
            icon = {"GOOD": "✅", "FAIR": "🟡", "POOR": "❌", "FAIL": "❌"}[quality]
            
            print(f"   ⏱️  {elapsed:.1f}s | {info.get('chars',0)} chars | "
                  f"{info.get('amharic',0)} Amharic ({info.get('ratio','?')}) | "
                  f"{info.get('lines',0)} lines")
            print(f"   {icon} Quality: {quality}")
            if "reason" in info:
                print(f"   ⚠️  {info['reason']}")
            
            preview = text[:200].replace('\n', ' ↩ ')
            print(f"   Preview: {preview}...")
            
            # Save OCR text
            txt_path = OUTPUT_DIR / f"{s['label']}.txt"
            txt_path.write_text(text, encoding="utf-8")
            print(f"   📄 Saved: tests/ocr-results-v2/{s['label']}.txt")
            
            results.append({**s, "status": quality, "elapsed": f"{elapsed:.1f}",
                           **info, "output": text})

        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            results.append({**s, "status": "ERROR", "reason": str(e)})
        
        # Rate limit pause
        if i < len(SAMPLES) - 1:
            print("   ⏳ Rate limit pause (6s)...")
            time.sleep(6)
    
    # ── Summary ──
    print("\n\n╔══════════════════════════════════════════════════════╗")
    print("║              SUMMARY REPORT (v2 — Image Pipeline)   ║")
    print("╠══════════════════════════════════════════════════════╣")
    
    tested = [r for r in results if r["status"] not in ("ERROR",)]
    good = sum(1 for r in results if r["status"] == "GOOD")
    fair = sum(1 for r in results if r["status"] == "FAIR")
    poor = sum(1 for r in results if r["status"] == "POOR")
    fail = sum(1 for r in results if r["status"] == "FAIL")
    errs = sum(1 for r in results if r["status"] == "ERROR")

    score = f"{(good + fair) / len(tested) * 100:.0f}" if tested else "0"
    
    print(f"║  Total samples:  {len(SAMPLES):<34}║")
    print(f"║  ✅ GOOD:        {good:<34}║")
    print(f"║  🟡 FAIR:        {fair:<34}║")
    print(f"║  ❌ POOR:        {poor:<34}║")
    print(f"║  ❌ FAIL:        {fail:<34}║")
    print(f"║  ⚠️  ERRORS:      {errs:<34}║")
    print(f"╠══════════════════════════════════════════════════════╣")
    print(f"║  Pass rate:      {score}% ({good+fair}/{len(tested)} tested)".ljust(52) + "║")
    print("╚══════════════════════════════════════════════════════╝")
    
    # ── Per-sample detail table ──
    print("\n── Detail Table ──")
    print(f"{'#':<4} {'Type':<35} {'Status':<7} {'Chars':<7} {'Amharic':<10} {'Time'}")
    print("─" * 80)
    for i, r in enumerate(results):
        st = r.get("status", "?")
        ch = r.get("chars", "-")
        am = r.get("ratio", "-")
        el = r.get("elapsed", "-")
        print(f"{i+1:<4} {r['type']:<35} {st:<7} {ch:<7} {am:<10} {el}s")

    # ── Fidel confusion check ──
    print("\n── Fidel Confusion Spot-Check ──")
    pairs = [("ሀ", "ሐ", "ኀ"), ("ሰ", "ሠ"), ("ጸ", "ፀ"), ("አ", "ዐ")]
    for r in results:
        out = r.get("output", "")
        if not out: continue
        for pair in pairs:
            found = [c for c in pair if c in out]
            if len(found) > 1:
                print(f"  📋 {r['label']}: Contains {' & '.join(found)} — needs manual verify")
    
    # ── Save JSON report ──
    report = {
        "date": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": MODEL,
        "pipeline": "image-based (PyMuPDF render → JPEG → Gemini)",
        "total": len(SAMPLES),
        "tested": len(tested),
        "pass_rate": f"{score}%",
        "results": [{
            "label": r["label"], "type": r["type"], "status": r["status"],
            "chars": r.get("chars", 0), "ratio": r.get("ratio", ""),
            "elapsed": r.get("elapsed", ""), "reason": r.get("reason", ""),
        } for r in results]
    }
    report_path = OUTPUT_DIR / "_report_v2.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\n📊 Report: tests/ocr-results-v2/_report_v2.json")
    print(f"📸 Page images: tests/ocr-results-v2/*.jpg")
    print(f"📄 OCR results: tests/ocr-results-v2/*.txt\n")


if __name__ == "__main__":
    run_tests()
