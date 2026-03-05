import { useState } from 'react';
import { X, Wand2, Loader2, RotateCcw, Check } from 'lucide-react';
import type { ImageAspectRatio, ImageSize } from '../services/geminiService';

export interface ImageEditTarget {
  /** Current data URL of the image being edited */
  src: string;
  /** Original description / alt text for context */
  description: string;
}

interface Props {
  target: ImageEditTarget;
  onConfirm: (
    prompt: string,
    options: { aspectRatio: ImageAspectRatio; imageSize: ImageSize }
  ) => Promise<void>;
  onClose: () => void;
}

const ASPECT_OPTIONS: { value: ImageAspectRatio; label: string }[] = [
  { value: '1:1',  label: 'Square 1:1'   },
  { value: '4:3',  label: 'Landscape 4:3' },
  { value: '3:4',  label: 'Portrait 3:4'  },
  { value: '16:9', label: 'Wide 16:9'     },
  { value: '9:16', label: 'Tall 9:16'     },
];

const SIZE_OPTIONS: { value: ImageSize; label: string }[] = [
  { value: '512px', label: '512 px — fastest' },
  { value: '1K',    label: '1 K — balanced'   },
  { value: '2K',    label: '2 K — sharpest'   },
];

export default function ImageEditModal({ target, onConfirm, onClose }: Props) {
  const [prompt, setPrompt]         = useState('');
  const [aspect, setAspect]         = useState<ImageAspectRatio>('1:1');
  const [size, setSize]             = useState<ImageSize>('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]           = useState('');

  const handleConfirm = async () => {
    if (!prompt.trim()) { setError('Please describe what you want to change.'); return; }
    setError('');
    setIsGenerating(true);
    try {
      await onConfirm(prompt.trim(), { aspectRatio: aspect, imageSize: size });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed. Try again.');
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-gray-900/5 w-full max-w-xl overflow-hidden animate-slide-up">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-2.5 font-bold text-gray-900">
            <div className="p-1.5 bg-violet-100 text-violet-600 rounded-lg">
              <Wand2 size={18} />
            </div>
            Edit Image with AI
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Current image preview ── */}
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center" style={{ maxHeight: 220 }}>
            <img
              src={target.src}
              alt={target.description}
              className="object-contain max-h-52 w-full"
            />
          </div>

          {/* ── Edit prompt ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              What should change?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setError(''); }}
              placeholder="e.g. Make the background gold, add a cross symbol, change to night scene…"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent resize-none transition-all"
            />
            {error && (
              <p className="text-xs font-semibold text-red-600 mt-0.5">{error}</p>
            )}
          </div>

          {/* ── Options row ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Aspect Ratio</label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as ImageAspectRatio)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all"
              >
                {ASPECT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resolution</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as ImageSize)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all"
              >
                {SIZE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Context hint ── */}
          {target.description && (
            <p className="text-xs text-gray-400 font-medium px-1">
              <span className="font-bold text-gray-500">Context:</span> {target.description}
            </p>
          )}

          {/* ── Actions ── */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 shadow-md shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98]"
            >
              {isGenerating
                ? <><Loader2 size={14} className="animate-spin" /> Editing…</>
                : <><Check size={14} /> Apply Edit</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
