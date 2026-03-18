/**
 * CoverEditor — pure canvas component.
 * Renders the cover background + draggable text blocks.
 * All state is controlled via props — no internal blocks state.
 */
import { useRef, useCallback, useEffect, useState } from 'react';
import { type CoverBlock } from './coverUtils';

const TS   = '0 2px 8px rgba(0,0,0,0.7),0 0 2px rgba(0,0,0,0.5)';
const FONT = "'Noto Serif Ethiopic','Noto Sans Ethiopic',serif";

interface Props {
  bgUrl:        string;
  blocks:       CoverBlock[];
  selId:        string | null;
  onSelect:     (id: string | null) => void;
  onMove:       (id: string, x: number, y: number) => void;
  onTextChange: (id: string, text: string) => void;
}

export default function CoverEditor({ bgUrl, blocks, selId, onSelect, onMove, onTextChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editRefs     = useRef<Record<string, HTMLDivElement | null>>({});

  const [editId,   setEditId]   = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onBlockMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (editId === id) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    const b = blocks.find(x => x.id === id);
    if (!b) return;
    setDragging({ id, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y });
  }, [blocks, editId, onSelect]);

  useEffect(() => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const dx = (e.clientX - dragging.sx) / rect.width  * 100;
      const dy = (e.clientY - dragging.sy) / rect.height * 100;
      const b  = blocks.find(x => x.id === dragging.id);
      if (!b) return;
      const newX = Math.max(0, Math.min(80, dragging.ox + dx));
      const newY = Math.max(0, Math.min(90, dragging.oy + dy));
      onMove(dragging.id, newX, newY);
    };
    const onMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, blocks, onMove]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="ce-canvas"
      style={{ backgroundImage: bgUrl ? `url('${bgUrl}')` : 'linear-gradient(135deg,#1e1b4b,#312e81)' }}
      onClick={() => { onSelect(null); setEditId(null); }}
    >
      {/* Gradient overlay */}
      <div className="ce-canvas-overlay" />

      {/* Text blocks */}
      {blocks.map(b => {
        const isSel  = b.id === selId;
        const isEdit = b.id === editId;
        return (
          <div
            key={b.id}
            onMouseDown={e => onBlockMouseDown(e, b.id)}
            onClick={e => {
              e.stopPropagation();
              if (isSel && !isEdit) {
                setEditId(b.id);
                setTimeout(() => editRefs.current[b.id]?.focus(), 0);
              } else if (!isSel) {
                onSelect(b.id);
                setEditId(null);
              }
            }}
            className={`ce-block${isSel ? ' ce-block--sel' : ''}`}
            style={{
              left:   `${b.x}%`,
              top:    `${b.y}%`,
              width:  `${b.w}%`,
              cursor: isEdit ? 'text' : isSel ? 'move' : 'pointer',
              zIndex: isSel ? 10 : 2,
            }}
          >
            <div
              ref={el => { editRefs.current[b.id] = el; }}
              contentEditable={isEdit}
              suppressContentEditableWarning
              onBlur={e => {
                onTextChange(b.id, e.currentTarget.textContent?.trim() ?? b.text);
                setEditId(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  (e.target as HTMLElement).blur();
                }
              }}
              style={{
                fontFamily:  FONT,
                fontSize:    `${b.size}rem`,
                fontWeight:  b.weight,
                fontStyle:   b.italic ? 'italic' : 'normal',
                color:       b.color,
                textAlign:   b.align,
                textShadow:  b.shadow ? TS : 'none',
                lineHeight:  1.35,
                outline:     'none',
                whiteSpace:  'pre-wrap',
                wordBreak:   'break-word',
                pointerEvents: isEdit ? 'auto' : 'none',
                minHeight:   '1.4em',
              }}
            >
              {b.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
