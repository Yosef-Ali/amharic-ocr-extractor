import type React from 'react';

/**
 * Page layout model shared by InspectorPanel (which edits it) and EditorShell
 * (which applies it to the rendered pages).
 *
 * Kept out of InspectorPanel.tsx so that file only exports its component —
 * mixing component and non-component exports breaks Vite's Fast Refresh.
 */
export interface PageLayout {
  marginT:    number;
  marginR:    number;
  marginB:    number;
  marginL:    number;
  columns:    1 | 2 | 3 | 4;
  colGap:     number;
  fontSize:   number;
  lineHeight: number;
}

export const DEFAULT_LAYOUT: PageLayout = {
  marginT: 12, marginR: 16, marginB: 12, marginL: 16,
  columns: 1,  colGap: 1.5,
  fontSize: 1.0, lineHeight: 1.6,
};

export function layoutToStyle(layout: PageLayout): React.CSSProperties {
  return {
    padding:     `${layout.marginT}mm ${layout.marginR}mm ${layout.marginB}mm ${layout.marginL}mm`,
    columnCount: layout.columns > 1 ? layout.columns : undefined,
    columnGap:   layout.columns > 1 ? `${layout.colGap}rem` : undefined,
    fontSize:    `${layout.fontSize}rem`,
    lineHeight:  `${layout.lineHeight}`,
  };
}
