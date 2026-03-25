/**
 * OCR Accuracy Test — Amharic OCR Extractor
 * 
 * Tests Gemini OCR on diverse Amharic documents.
 * Sends PDF pages directly to the Gemini API and saves results.
 *
 * Usage:
 *   cd ~/amharic-ocr-extractor
 *   node tests/ocr-accuracy-test.mjs
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(__dirname, 'ocr-results');

// ── Load API key from .env ──
let apiKey = '';
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf-8');
  const m = env.match(/VITE_GEMINI_API_KEY=(.+)/);
  if (m) apiKey = m[1].trim();
}
if (!apiKey) { console.error('❌ No VITE_GEMINI_API_KEY in .env'); process.exit(1); }

const client = new GoogleGenAI({ apiKey });
const MODEL = 'gemini-3.1-flash-image-preview';

// ── Same OCR prompt as the production app (from geminiService.ts) ──
const OCR_PROMPT = `You are an expert multilingual OCR engine that works with any document type.

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
- If the page has two or more columns, extract each column left-to-right, separated by "---COLUMN BREAK---".
- Mark headers and titles with "### " prefix.
- Do NOT translate, interpret, or add commentary.

Extract now:`;

// ── Test samples: diverse Amharic documents ──
const SAMPLES = [
  { path: '/Users/mekdesyared/Spiritual.pdf',
    page: 1, label: '01_spiritual_religious', type: 'Religious/spiritual text' },
  { path: '/Users/mekdesyared/Downloads/Amharic_Prayer_Book_Editable_First5.pdf',
    page: 1, label: '02_prayer_book_p1', type: 'Prayer book (formatted)' },
  { path: '/Users/mekdesyared/Downloads/Amharic_Prayer_Book_Editable_First5.pdf',
    page: 3, label: '03_prayer_book_p3', type: 'Prayer book (inner page)' },
  { path: '/Users/mekdesyared/Downloads/ብልጭታ - ህሊና ማህደር.pdf',
    page: 5, label: '04_novel_bilichta', type: 'Amharic novel (prose)' },
  { path: '/Users/mekdesyared/Downloads/ብልጭታ - ህሊና ማህደር.pdf',
    page: 20, label: '05_novel_bilichta_mid', type: 'Novel (mid-section)' },
  { path: '/Users/mekdesyared/Downloads/ፍካሬ ኢየሱስ ወትንቢተ ሣቤላ.pdf',
    page: 3, label: '06_fikare_iyesus', type: 'Religious/Geez text' },
  { path: '/Users/mekdesyared/Downloads/ማህሌት - አዳም ረታ.pdf',
    page: 10, label: '07_mahlet_adam_reta', type: 'Literature (Adam Reta)' },
  { path: '/Users/mekdesyared/Downloads/ተአምረኛው አእምሮህ - ጆዊ ደስፔንዛ.pdf',
    page: 5, label: '08_translated_book', type: 'Translated book (mixed)' },
  { path: '/Users/mekdesyared/Spiritual.pdf',
    page: 3, label: '09_spiritual_p3', type: 'Religious text (page 3)' },
  { path: '/Users/mekdesyared/Downloads/ፍካሬ ኢየሱስ ወትንቢተ ሣቤላ.pdf',
    page: 15, label: '10_fikare_mid', type: 'Religious (mid-section)' },
];

// ── OCR function: sends a specific PDF page to Gemini ──
async function ocrPage(pdfPath, pageNumber) {
  const pdfData = readFileSync(pdfPath);
  const base64 = pdfData.toString('base64');
  
  // Check file size — Gemini inline limit is ~20MB
  const sizeMB = pdfData.length / (1024 * 1024);
  if (sizeMB > 20) {
    return `[SKIPPED — file too large for inline: ${sizeMB.toFixed(1)}MB. Use file upload API.]`;
  }

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64,
          }
        },
        {
          text: `Focus ONLY on page ${pageNumber} of this PDF.\n\n${OCR_PROMPT}`
        }
      ]
    }]
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.text || '[NO OUTPUT]';
}

// ── Helpers ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main runner ──
async function runTests() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Amharic OCR Accuracy Test Suite                ║');
  console.log('║   Model: ' + MODEL.padEnd(39) + '║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  
  const results = [];
  let passed = 0;
  let skipped = 0;

  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const num = String(i + 1).padStart(2, '0');
    console.log(`\n── Test ${num}/${SAMPLES.length}: ${s.type} ──`);
    console.log(`   File: ${basename(s.path)}, Page: ${s.page}`);

    // Check file exists and size
    try {
      const stat = readFileSync(s.path);
      const sizeMB = stat.length / (1024 * 1024);
      console.log(`   Size: ${sizeMB.toFixed(1)}MB`);

      if (sizeMB > 20) {
        console.log(`   ⏭️  SKIPPED — file exceeds 20MB inline limit`);
        results.push({ ...s, status: 'SKIPPED', reason: 'File too large', output: '' });
        skipped++;
        continue;
      }
    } catch (e) {
      console.log(`   ❌ File not found or unreadable`);
      results.push({ ...s, status: 'ERROR', reason: 'File not found', output: '' });
      skipped++;
      continue;
    }

    try {
      const startTime = Date.now();
      const text = await ocrPage(s.path, s.page);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Basic quality checks
      const hasAmharic = /[\u1200-\u137F]/.test(text);        // Ethiopic Unicode range
      const hasPunctuation = /[።፣፤፡]/.test(text);            // Ethiopic punctuation
      const charCount = text.length;
      const amharicChars = (text.match(/[\u1200-\u137F]/g) || []).length;
      const amharicRatio = charCount > 0 ? (amharicChars / charCount * 100).toFixed(1) : 0;
      const lineCount = text.split('\n').filter(l => l.trim()).length;

      // Check for common OCR failure patterns
      const hasGarbage = /[□■◆◇●○]{3,}/.test(text);          // Repeated symbols = OCR failure
      const hasNoOutput = text.trim() === '' || text === '[NO OUTPUT]';
      const hasMixedUpChars = /[а-яА-Я]{5,}/.test(text);     // Cyrillic = wrong script detected
      
      const quality = hasNoOutput ? 'FAIL' 
        : hasGarbage ? 'POOR' 
        : hasMixedUpChars ? 'POOR'
        : !hasAmharic ? 'FAIL'
        : amharicRatio < 20 ? 'POOR'
        : amharicRatio < 50 ? 'FAIR'
        : 'GOOD';

      console.log(`   ⏱️  ${elapsed}s | ${charCount} chars | ${amharicChars} Amharic (${amharicRatio}%) | ${lineCount} lines`);
      console.log(`   ${quality === 'GOOD' ? '✅' : quality === 'FAIR' ? '🟡' : '❌'} Quality: ${quality}`);
      
      // Preview first 200 chars
      const preview = text.substring(0, 200).replace(/\n/g, ' ↩ ');
      console.log(`   Preview: ${preview}...`);

      // Save full output
      const outFile = join(OUTPUT_DIR, `${s.label}.txt`);
      writeFileSync(outFile, text, 'utf-8');
      console.log(`   📄 Saved: tests/ocr-results/${s.label}.txt`);

      if (quality === 'GOOD' || quality === 'FAIR') passed++;
      results.push({ ...s, status: quality, chars: charCount, amharicChars, amharicRatio, lineCount, elapsed, output: text });

    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}`);
      results.push({ ...s, status: 'ERROR', reason: err.message, output: '' });
    }

    // Rate limit: wait 6 seconds between API calls
    if (i < SAMPLES.length - 1) {
      console.log(`   ⏳ Rate limit pause (6s)...`);
      await sleep(6000);
    }
  }

  // ── Summary Report ──
  console.log('\n\n╔══════════════════════════════════════════════════╗');
  console.log('║              SUMMARY REPORT                      ║');
  console.log('╠══════════════════════════════════════════════════╣');
  
  const tested = results.filter(r => r.status !== 'SKIPPED' && r.status !== 'ERROR');
  const good = results.filter(r => r.status === 'GOOD').length;
  const fair = results.filter(r => r.status === 'FAIR').length;
  const poor = results.filter(r => r.status === 'POOR').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  console.log(`║  Total samples:  ${SAMPLES.length.toString().padEnd(31)}║`);
  console.log(`║  ✅ GOOD:        ${good.toString().padEnd(31)}║`);
  console.log(`║  🟡 FAIR:        ${fair.toString().padEnd(31)}║`);
  console.log(`║  ❌ POOR:        ${poor.toString().padEnd(31)}║`);
  console.log(`║  ❌ FAIL:        ${fail.toString().padEnd(31)}║`);
  console.log(`║  ⏭️  SKIPPED:     ${skipped.toString().padEnd(31)}║`);
  console.log(`║  ⚠️  ERRORS:      ${errors.toString().padEnd(31)}║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  
  const score = tested.length > 0 ? ((good + fair) / tested.length * 100).toFixed(0) : 0;
  console.log(`║  Pass rate:      ${score}% (${good + fair}/${tested.length} samples)`.padEnd(51) + '║');
  console.log('╚══════════════════════════════════════════════════╝');

  // ── Fidel Confusion Check ──
  console.log('\n── Fidel Confusion Spot-Check ──');
  console.log('Looking for common substitution errors in results...');
  
  const confusionPairs = [
    ['ሀ', 'ሐ', 'ኀ'],  // ha variants
    ['ሰ', 'ሠ'],        // sa variants  
    ['ጸ', 'ፀ'],        // tsa variants
    ['አ', 'ዐ'],        // a variants
  ];

  for (const r of results) {
    if (!r.output) continue;
    for (const pair of confusionPairs) {
      const found = pair.filter(c => r.output.includes(c));
      if (found.length > 1) {
        console.log(`  📋 ${r.label}: Contains both ${found.join(' and ')} — verify manually`);
      }
    }
  }

  // Save JSON report
  const report = {
    date: new Date().toISOString(),
    model: MODEL,
    totalSamples: SAMPLES.length,
    tested: tested.length,
    skipped,
    passRate: `${score}%`,
    results: results.map(r => ({
      label: r.label,
      type: r.type,
      status: r.status,
      chars: r.chars || 0,
      amharicChars: r.amharicChars || 0,
      amharicRatio: r.amharicRatio || 0,
      lineCount: r.lineCount || 0,
      elapsed: r.elapsed || 0,
      reason: r.reason || '',
    }))
  };
  
  const reportPath = join(OUTPUT_DIR, '_report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📊 Full report: tests/ocr-results/_report.json`);
  console.log('📄 Individual results: tests/ocr-results/*.txt\n');
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
