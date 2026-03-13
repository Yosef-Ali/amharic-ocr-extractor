import React from 'react';

/** Inline markdown: **bold**, *italic*, `code` → React nodes */
export function inlineMd(text: string, codeClass: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/);
  return tokens.map((t, i) => {
    if (t.startsWith('**') && t.endsWith('**')) return <strong key={i}>{t.slice(2, -2)}</strong>;
    if (t.startsWith('*')  && t.endsWith('*'))  return <em key={i}>{t.slice(1, -1)}</em>;
    if (t.startsWith('`')  && t.endsWith('`'))  return <code key={i} className={codeClass}>{t.slice(1, -1)}</code>;
    return t;
  });
}

interface MarkdownTextProps {
  text: string;
  /** CSS class prefix — e.g. "fc" → fc-md, fc-md-ul, fc-md-p, fc-md-code */
  prefix: string;
}

/** Renders paragraphs and bullet lists with inline markdown support. */
export function MarkdownText({ text, prefix }: MarkdownTextProps) {
  return (
    <div className={`${prefix}-md`}>
      {text.trim().split(/\n{2,}/).map((para, i) => {
        const lines = para.split('\n');
        const listLines = lines.filter(l => /^[-*•]\s/.test(l.trim()));
        if (listLines.length > 0 && listLines.length === lines.filter(l => l.trim()).length) {
          return (
            <ul key={i} className={`${prefix}-md-ul`}>
              {listLines.map((l, j) => (
                <li key={j}>{inlineMd(l.replace(/^[-*•]\s*/, ''), `${prefix}-md-code`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={`${prefix}-md-p`}>
            {lines.map((line, j) => (
              <span key={j}>{inlineMd(line, `${prefix}-md-code`)}{j < lines.length - 1 && <br />}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
