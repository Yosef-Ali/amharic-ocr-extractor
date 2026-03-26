/**
 * Element style reading/writing for the Inspector panel.
 * Extracted from DocumentPage.tsx.
 */

export interface ElementStyles {
  tag:            string;
  textAlign:      string;
  fontSize:       string;
  fontWeight:     string;
  fontStyle:      string;
  textDecoration: string;
  color:          string;
  lineHeight:     string;
  marginTop:      string;
  marginBottom:   string;
  letterSpacing:  string;
  textTransform:  string;
}

export function rgbToHex(color: string): string {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]]
    .map(n => parseInt(n).toString(16).padStart(2, '0'))
    .join('');
}
