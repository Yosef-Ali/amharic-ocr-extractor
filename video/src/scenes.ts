export interface Scene {
  id:          string;
  caption:     string;
  sub?:        string;
  screenshot?: string;   // filename inside public/screens/
  accent:      string;   // hex colour for the step badge / highlight
  durationSec: number;
}

export const SCENES: Scene[] = [
  {
    id:          'upload',
    caption:     'Upload a PDF or image',
    sub:         'Drag & drop onto the home screen — or click New Project',
    screenshot:  'home.png',
    accent:      '#6366f1',
    durationSec: 5,
  },
  {
    id:          'extract',
    caption:     'Gemini AI extracts Amharic text',
    sub:         'Page-by-page OCR with layout preservation',
    accent:      '#f59e0b',
    durationSec: 5,
  },
  {
    id:          'navigate',
    caption:     'Navigate to page 4',
    sub:         'Use the page arrows in the top bar to jump to any page',
    accent:      '#22d3ee',
    durationSec: 4,
  },
  {
    id:          'draw-crop',
    caption:     'Draw a selection on the original scan',
    sub:         'Click and drag on the left panel to select any image region',
    accent:      '#22d3ee',
    durationSec: 5,
  },
  {
    id:          'crop-border',
    caption:     'Cyan border confirms your crop',
    sub:         'Corner handles and dimension badge show exact selection size',
    accent:      '#22d3ee',
    durationSec: 4,
  },
  {
    id:          'enhance',
    caption:     'Enhance & Insert — AI restores scan quality',
    sub:         'Removes noise · sharpens text · corrects contrast · no changes to content',
    accent:      '#34d399',
    durationSec: 5,
  },
  {
    id:          'inserted',
    caption:     'Image placed in the extracted document',
    sub:         'Positioned automatically or click anywhere to place manually',
    accent:      '#34d399',
    durationSec: 4,
  },
  {
    id:          'ai-chat',
    caption:     'AI Chat — ask questions or edit the page',
    sub:         'Canvas-aware: the assistant sees the current page as context',
    accent:      '#818cf8',
    durationSec: 5,
  },
  {
    id:          'export',
    caption:     'Save & download as a searchable PDF',
    sub:         'One click from the floating dock — all pages included',
    accent:      '#6366f1',
    durationSec: 5,
  },
];

export const FPS        = 30;
export const WIDTH      = 1920;
export const HEIGHT     = 1080;
export const FADE_FRAMES = 18;
