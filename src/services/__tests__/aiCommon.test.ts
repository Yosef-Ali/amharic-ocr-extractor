import { describe, it, expect } from 'vitest';
import { buildOcrPrompt, buildLayoutPrompt, verifyLayout } from '../aiCommon';

describe('buildOcrPrompt', () => {
  const prompt = buildOcrPrompt();

  it('includes Amharic fidel preservation rules', () => {
    expect(prompt).toContain('ሀ ≠ ሐ ≠ ኀ');
    expect(prompt).toContain('ሰ ≠ ሠ');
    expect(prompt).toContain('ጸ ≠ ፀ');
    expect(prompt).toContain('አ ≠ ዐ');
  });

  it('forbids character substitution', () => {
    expect(prompt).toMatch(/NEVER\s+(substitute|correct|modernize|fix)/i);
  });

  it('preserves Ethiopic punctuation marks', () => {
    expect(prompt).toContain('።');  // full stop
    expect(prompt).toContain('፣');  // comma
    expect(prompt).toContain('፤');  // semicolon
    expect(prompt).toContain('፡');  // wordspace
  });

  it('includes column break marker instruction', () => {
    expect(prompt).toContain('COLUMN BREAK');
  });

  it('includes image placeholder marker instruction', () => {
    expect(prompt).toContain('[IMAGE:');
  });

  it('instructs to output raw text only', () => {
    expect(prompt).toMatch(/output\s+ONLY\s+(the\s+)?raw\s+text/i);
  });
});

describe('buildLayoutPrompt', () => {
  it('includes the extracted text in the prompt', () => {
    const text = 'ሰላም ዓለም test content';
    const prompt = buildLayoutPrompt(text);
    expect(prompt).toContain(text);
  });

  it('requires all styles be inline', () => {
    const prompt = buildLayoutPrompt('test');
    expect(prompt).toMatch(/styles must be inline/i);
  });

  it('includes layout template examples', () => {
    const prompt = buildLayoutPrompt('test');
    expect(prompt).toContain('grid-template-columns');
    expect(prompt).toContain('text-align:center');
  });

  it('accepts optional previous page HTML for continuity', () => {
    const prompt = buildLayoutPrompt('text', '<p>Previous page content</p>');
    // Should reference previous page for style continuity
    expect(prompt.length).toBeGreaterThan(buildLayoutPrompt('text').length);
  });
});

describe('verifyLayout', () => {
  it('strips markdown code fences from HTML output', () => {
    const input = '```html\n<p>Content</p>\n```';
    const result = verifyLayout(input);
    expect(result).not.toContain('```');
    expect(result).toContain('<p>Content</p>');
  });

  it('passes through clean HTML unchanged', () => {
    const input = '<div><p>Clean HTML</p></div>';
    const result = verifyLayout(input);
    expect(result).toContain('<p>Clean HTML</p>');
  });

  it('handles empty input', () => {
    const result = verifyLayout('');
    expect(typeof result).toBe('string');
  });
});
