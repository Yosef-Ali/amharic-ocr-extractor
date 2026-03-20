import { useEffect, useState } from 'react';
import { X, FolderOpen, Trash2, BookOpen, Loader2 } from 'lucide-react';
import {
  loadAllDocuments,
  loadDocumentContent,
  deleteDocument,
  type SavedDocument,
} from '../services/storageService';

interface Props {
  onLoad: (doc: SavedDocument) => void;
  onClose: () => void;
}

export default function LibraryModal({ onLoad, onClose }: Props) {
  const [docs, setDocs] = useState<SavedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadAllDocuments().then((d) => { setDocs(d); setLoading(false); });
  }, []);

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-slide-up ring-1 ring-gray-900/5">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2.5 font-bold text-gray-900 text-lg tracking-tight">
            <div className="p-1.5 bg-red-100 text-red-600 rounded-lg">
              <BookOpen size={20} />
            </div>
            Document Library
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-3">
          {/* Search */}
          {!loading && docs.length > 0 && (
            <div style={{ padding: '0 0.25rem 0.5rem' }}>
              <input
                type="text"
                placeholder="Search documents…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.75rem',
                  border: '1px solid #e5e7eb',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: '#f9fafb',
                  color: '#1f2937',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 font-medium">
              Loading…
            </div>
          )}
          {!loading && docs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FolderOpen size={32} className="text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">No saved documents yet</p>
              <p className="text-gray-400 text-sm mt-1">Extract a document and click "Save" to add it here.</p>
            </div>
          )}
          {docs.filter(d => d.name.toLowerCase().includes(query.toLowerCase())).map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 border-b border-gray-100 last:border-0 gap-3 hover:bg-gray-50 rounded-xl transition-colors group"
            >
              {/* Thumbnail */}
              {(doc as any).thumbnailUrl && (
                <img
                  src={(doc as any).thumbnailUrl}
                  alt=""
                  style={{ width: '40px', height: '52px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0, border: '1px solid #e5e7eb' }}
                />
              )}
              <div className="min-w-0 flex-1 px-2">
                <p className="font-semibold text-gray-800 truncate">{doc.name}</p>
                <p className="text-xs font-medium text-gray-400 mt-0.5">
                  {new Date(doc.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} &middot;{' '}
                  {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={async () => {
                    setLoadingId(doc.id);
                    try {
                      const fullDoc = await loadDocumentContent(doc.id);
                      onLoad(fullDoc);
                      onClose();
                    } finally {
                      setLoadingId(null);
                    }
                  }}
                  disabled={loadingId !== null}
                  title="Load document"
                  className="flex items-center justify-center p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {loadingId === doc.id
                    ? <Loader2 size={18} className="animate-spin" />
                    : <FolderOpen size={18} />}
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={loadingId !== null}
                  title="Delete document"
                  className="flex items-center justify-center p-2 bg-gray-50 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
