import { describe, it, expect } from 'vitest';
import { buildCombinedPrompt, htmlToText } from '../../../api/_ocrPrompt';

/**
 * The OCR prompt is the product. CLAUDE.md forbids weakening fidel preservation,
 * and merging the old transcribe + layout passes into one call is exactly the
 * kind of edit that could quietly drop those rules. These assertions pin them.
 */
describe('buildCombinedPrompt — fidel preservation', () => {
  const prompt = buildCombinedPrompt();

  it('keeps every visually-confusable fidel pair', () => {
    // ሀ/ሐ/ቀ, ሰ/ሠ, ጸ/ፀ, አ/ዐ — the substitutions that ruin Amharic OCR.
    for (const ch of ['ሀ', 'ሐ', 'ቀ', 'ሰ', 'ሠ', 'ጸ', 'ፀ', 'አ', 'ዐ']) {
      expect(prompt).toContain(ch);
    }
  });

  it('keeps every Ethiopic punctuation mark', () => {
    for (const p of ['።', '፣', '፤', '፡']) {
      expect(prompt).toContain(p);
    }
  });

  it('forbids substituting or modernising words', () => {
    expect(prompt).toMatch(/NEVER substitute, correct, modernize/i);
    expect(prompt).toMatch(/archaic forms/i);
    expect(prompt).toMatch(/do NOT translate/i);
  });

  it('ranks transcription above layout, so merging cannot trade one for the other', () => {
    const transcription = prompt.search(/Character-exact transcription/i);
    const layout        = prompt.search(/Layout fidelity/i);
    expect(transcription).toBeGreaterThan(-1);
    expect(layout).toBeGreaterThan(transcription);   // stated after, i.e. lower priority
    expect(prompt).toMatch(/transcription wins/i);
  });

  it('asks for raw HTML with no code fences', () => {
    expect(prompt).toMatch(/Raw HTML only/i);
    expect(prompt).toMatch(/zero code fences/i);
  });

  it('specifies the placeholder shape the cropping code looks for', () => {
    // autoFillImagePlaceholders queries .ai-image-placeholder and reads data-bbox.
    expect(prompt).toContain('ai-image-placeholder');
    expect(prompt).toContain('data-bbox');
    expect(prompt).toContain('data-description');
  });

  it('includes the previous page only when one is supplied', () => {
    expect(buildCombinedPrompt()).not.toMatch(/PREVIOUS PAGE HTML/);
    expect(buildCombinedPrompt('<p>ሰላም</p>')).toMatch(/PREVIOUS PAGE HTML/);
  });

  it('truncates a long previous page rather than blowing up the request', () => {
    const huge = '<p>' + 'ሀ'.repeat(5000) + '</p>';
    expect(buildCombinedPrompt(huge).length).toBeLessThan(huge.length);
  });
});

describe('htmlToText', () => {
  it('extracts Amharic text and drops tags', () => {
    const html = '<h2 style="x">ምዕራፍ ፩</h2><p>ሰላም ለዓለም።</p>';
    const out = htmlToText(html);
    expect(out).toContain('ምዕራፍ ፩');
    expect(out).toContain('ሰላም ለዓለም።');
    expect(out).not.toContain('<');
  });

  it('turns block boundaries into line breaks rather than running words together', () => {
    expect(htmlToText('<p>አንድ</p><p>ሁለት</p>')).toBe('አንድ\nሁለት');
    expect(htmlToText('<p>አንድ<br>ሁለት</p>')).toBe('አንድ\nሁለት');
  });

  it('decodes entities and strips script/style content', () => {
    expect(htmlToText('<p>a &amp; b</p>')).toBe('a & b');
    expect(htmlToText('<style>p{color:red}</style><p>ሰላም</p>')).toBe('ሰላም');
    expect(htmlToText('<script>alert(1)</script><p>ሰላም</p>')).toBe('ሰላም');
  });

  it('collapses runaway whitespace', () => {
    expect(htmlToText('<p>a</p>\n\n\n\n<p>b</p>')).toBe('a\n\nb');
  });

  it('handles empty input', () => {
    expect(htmlToText('')).toBe('');
  });
});
