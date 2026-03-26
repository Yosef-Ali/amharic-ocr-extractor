/**
 * useUndoRedo — Undo/Redo history stack for contentEditable HTML.
 * Extracted from DocumentPage.tsx for reusability and testability.
 */
import { useRef, useCallback } from 'react';

const MAX_HISTORY = 80;

interface UndoStack {
  past: string[];
  future: string[];
}

function pushUndo(stack: UndoStack, html: string): UndoStack {
  const past = [...stack.past, html].slice(-MAX_HISTORY);
  return { past, future: [] };
}

function undoStack(stack: UndoStack, current: string): { stack: UndoStack; html: string | null } {
  if (stack.past.length === 0) return { stack, html: null };
  const past = [...stack.past];
  const prev = past.pop()!;
  return { stack: { past, future: [current, ...stack.future].slice(0, MAX_HISTORY) }, html: prev };
}

function redoStack(stack: UndoStack, current: string): { stack: UndoStack; html: string | null } {
  if (stack.future.length === 0) return { stack, html: null };
  const future = [...stack.future];
  const next = future.shift()!;
  return { stack: { past: [...stack.past, current], future }, html: next };
}

export function useUndoRedo(getCurrentHtml: () => string | null) {
  const stackRef = useRef<UndoStack>({ past: [], future: [] });

  const push = useCallback((html: string) => {
    stackRef.current = pushUndo(stackRef.current, html);
  }, []);

  const undo = useCallback((): string | null => {
    const current = getCurrentHtml();
    if (!current) return null;
    const result = undoStack(stackRef.current, current);
    stackRef.current = result.stack;
    return result.html;
  }, [getCurrentHtml]);

  const redo = useCallback((): string | null => {
    const current = getCurrentHtml();
    if (!current) return null;
    const result = redoStack(stackRef.current, current);
    stackRef.current = result.stack;
    return result.html;
  }, [getCurrentHtml]);

  const canUndo = useCallback(() => stackRef.current.past.length > 0, []);
  const canRedo = useCallback(() => stackRef.current.future.length > 0, []);
  const reset = useCallback(() => { stackRef.current = { past: [], future: [] }; }, []);

  return { push, undo, redo, canUndo, canRedo, reset };
}
