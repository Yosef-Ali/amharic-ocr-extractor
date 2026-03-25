// ─────────────────────────────────────────────────────────────────────────────
// Shared editor defaults — single source of truth for ALL editing surfaces:
//   • InspectorPanel (PageLayout defaults)
//   • DocumentPage   (inline style fallbacks)
//   • geminiService  (OCR layout prompt values)
//   • FloatingToolbar / verifyLayout fallback
//
// Values are split into two categories:
//   FIXED   — constants that never change at runtime (colors, font family)
//   DYNAMIC — user-adjustable at runtime via the Inspector or page props
// ─────────────────────────────────────────────────────────────────────────────

// ── DYNAMIC values — can be changed per-page via Inspector ──────────────────

export interface DynamicDefaults {
  /** Page width in mm */
  pageWidth:    number;
  /** Page height in mm */
  pageHeight:   number;
  /** Top margin in mm */
  marginT:      number;
  /** Right margin in mm */
  marginR:      number;
  /** Bottom margin in mm */
  marginB:      number;
  /** Left margin in mm */
  marginL:      number;
  /** Number of columns (1–4) */
  columns:      1 | 2 | 3 | 4;
  /** Column gap in rem */
  colGap:       number;
  /** Base font size in rem */
  fontSize:     number;
  /** Base line-height (unitless) */
  lineHeight:   number;
  /** H2 font size in rem */
  h2FontSize:   number;
  /** H3 font size in rem */
  h3FontSize:   number;
  /** Body paragraph bottom margin in rem */
  paragraphGap: number;
  /** Two-column grid gap in rem */
  gridGap:      number;
}

export const DYNAMIC: DynamicDefaults = {
  pageWidth:    210,
  pageHeight:   297,
  marginT:      12,
  marginR:      16,
  marginB:      12,
  marginL:      16,
  columns:      1,
  colGap:       1.5,
  fontSize:     1.0,
  lineHeight:   1.75,
  h2FontSize:   1.2,
  h3FontSize:   0.95,
  paragraphGap: 0.85,
  gridGap:      2,
};

// ── FIXED values — constants across the app ─────────────────────────────────

export const FIXED = {
  /** Primary body text color */
  textColor:      '#1c1917',
  /** Primary heading color (dark navy) */
  headingColor:   '#0f172a',
  /** Accent / subheading color (red) */
  accentColor:    '#b91c1c',
  /** Default text alignment */
  textAlign:      'justify' as const,
  /** Default font weight for body */
  fontWeight:     400 as const,
  /** Default font weight for h2 */
  h2FontWeight:   900 as const,
  /** Default font weight for h3 */
  h3FontWeight:   700 as const,
  /** Font family stack */
  fontFamily:     "'Noto Serif Ethiopic', 'Noto Sans Ethiopic', serif",
  /** Bordered box defaults */
  boxBorderWidth: 2,
  boxBorderRadius: 4,
  boxPaddingV:    0.55,
  boxPaddingH:    0.85,
  boxMarginV:     0.6,
} as const;

// ── Derived helpers ─────────────────────────────────────────────────────────

/** Build inline-style strings for the OCR layout prompt using current dynamic values */
export function promptStyles(d: DynamicDefaults = DYNAMIC) {
  return {
    h2: `text-align:center;font-weight:${FIXED.h2FontWeight};color:${FIXED.headingColor};font-size:${d.h2FontSize}rem;margin:0 0 0.75rem;`,
    h3: `text-align:center;font-weight:${FIXED.h3FontWeight};color:[HEADING_COLOR];font-size:${d.h3FontSize}rem;margin:0 0 0.5rem;`,
    p:  `line-height:${d.lineHeight};color:${FIXED.textColor};margin:0 0 ${d.paragraphGap}rem;text-align:${FIXED.textAlign};font-size:${d.fontSize}rem;`,
    grid: `display:grid;grid-template-columns:repeat(${d.columns}, 1fr);gap:${d.gridGap}rem;width:100%;`,
    box: `border:${FIXED.boxBorderWidth}px solid [BORDER_COLOR];border-radius:${FIXED.boxBorderRadius}px;padding:${FIXED.boxPaddingV}rem ${FIXED.boxPaddingH}rem;margin:${FIXED.boxMarginV}rem 0;text-align:center;`,
  };
}

/** Fallback <p> wrap for verifyLayout — uses dynamic values */
export function fallbackParagraphStyle(d: DynamicDefaults = DYNAMIC): string {
  return `line-height: ${d.lineHeight}; color: ${FIXED.textColor}; margin-bottom: ${d.paragraphGap}rem; text-align: ${FIXED.textAlign}; font-size: ${d.fontSize}rem;`;
}
