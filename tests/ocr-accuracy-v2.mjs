/**
 * OCR Accuracy Test v2 — Image-Based Pipeline
 * 
 * Matches the ACTUAL app pipeline:
 *   PDF page → render to JPEG image → send image to Gemini → OCR text
 * 
 * Uses pdf.js (same as the app) to render pages, then Gemini for OCR.
 * 
 * Usage:
 *   cd ~/amharic-ocr-extractor
 *   node tests/ocr-accuracy-v2.mjs
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createCanvas } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(__dirname, 'ocr-results-v2');
