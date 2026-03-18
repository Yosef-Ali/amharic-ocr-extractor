import { useState, useEffect, useRef } from 'react';
import {
  FileText, Upload, FolderOpen, Trash2, Clock, BookOpen,
  Sparkles, ChevronRight, Plus, Search, Loader2, ScanSearch, ShieldCheck, Download,
} from 'lucide-react';
import { type Theme } from '../hooks/useTheme';
import ThemeToggleButton from './ThemeToggleButton';
import UserMenu from './UserMenu';
import {
  loadAllDocuments, loadDocumentContent, deleteDocument, type SavedDocument,
} from '../services/storageService';
import { downloadDocumentAsPDF } from '../utils/downloadPDF';

interface Props {
  onFile:           (file: File) => void;
  onLoadDoc:        (doc: SavedDocument) => void;
  isProcessing:     boolean;
  processingStatus: string;
  theme:            Theme;
  onToggleTheme:    () => void;
  user:             { id: string; email?: string; name?: string } | null;
  onSignOut:        () => void;
  isAdmin:          boolean;
  onOpenAdmin:      () => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HomeScreen({ onFile, onLoadDoc, isProcessing, processingStatus, theme, onToggleTheme, user, onSignOut, isAdmin, onOpenAdmin }: Props) {
  const [docs, setDocs] = useState<SavedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [search, setSearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loadingDocId,  setLoadingDocId]  = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAllDocuments().then(d => { setDocs(d); setLoadingDocs(false); });
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteDocument(id);
    setDocs(d => d.filter(x => x.id !== id));
  };

  const handleFilePick = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const name = file.name.toLowerCase();
    if (
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'text/plain' ||
      name.endsWith('.docx') ||
      name.endsWith('.txt') ||
      name.endsWith('.md')
    ) onFile(file);
  };

  const handleOpenDoc = async (doc: SavedDocument) => {
    setLoadingDocId(doc.id);
    try {
      const fullDoc = await loadDocumentContent(doc.id);
      onLoadDoc(fullDoc);
    } catch (err) {
      console.error('Failed to load document:', err);
      setLoadingDocId(null);
    }
    // don't reset loadingDocId — component unmounts when editor opens
  };

  const handleDownload = async (e: React.MouseEvent, doc: SavedDocument) => {
    e.stopPropagation();
    setDownloadingId(doc.id);
    try {
      const full = await loadDocumentContent(doc.id);
      if (Object.keys(full.pageResults).length === 0) {
        alert('This document has no extracted content to download.');
        return;
      }
      await downloadDocumentAsPDF(full.name, full.pageResults);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilePick(e.dataTransfer.files);
  };

  const filtered = docs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const recent = filtered.slice(0, 3);
  const older  = filtered.slice(3);

  return (
    <div className="home-screen">

      {/* ── Top navbar ─────────────────────────────────────────────── */}
      <header className="home-nav">
        <div className="home-nav-inner">
          <div className="home-brand">
            <div className="home-brand-icon">
              <ScanSearch size={20} className="text-white" />
              <Sparkles className="home-brand-sparkle" />
            </div>
            <div>
              <p className="home-brand-name">
                Amharic <span className="home-brand-accent">OCR</span> Extractor
              </p>
              <p className="home-brand-sub">PDF · Layout · Amharic</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ThemeToggleButton theme={theme} onClick={onToggleTheme} />
            {isAdmin && (
              <button
                className="home-admin-btn"
                onClick={onOpenAdmin}
                title="Admin Panel"
                aria-label="Open Admin Panel"
              >
                <ShieldCheck size={15} />
                <span>Admin</span>
              </button>
            )}
            {user && <UserMenu user={user} onSignOut={onSignOut} />}
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="home-main">

        {/* ── Hero / New Project strip ─────────────────────────────── */}
        <div className="home-hero">
          <div className="home-hero-text">
            <h1 className="home-hero-title">Your Projects</h1>
            <p className="home-hero-sub">Open an existing project or extract a new document</p>
          </div>

          {/* New project upload button */}
          <label
            className={`home-upload-drop${isDragging ? ' home-upload-drop--drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,.docx,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="sr-only"
              onChange={e => handleFilePick(e.target.files)}
              disabled={isProcessing}
            />
            {isProcessing ? (
              <>
                <Loader2 size={22} className="animate-spin text-red-400" />
                <span>{processingStatus || 'Loading…'}</span>
              </>
            ) : (
              <>
                <div className="home-upload-icon">
                  <Plus size={20} />
                </div>
                <span className="home-upload-label">New Project</span>
                <span className="home-upload-hint">Drop PDF, Word, text, or image</span>
              </>
            )}
          </label>
        </div>

        {/* ── Search ──────────────────────────────────────────────── */}
        {docs.length > 0 && (
          <div className="home-search-row">
            <Search size={14} className="home-search-icon" />
            <input
              type="text"
              className="home-search-input"
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────── */}
        {loadingDocs && (
          <div className="home-loading">
            <Loader2 size={20} className="animate-spin text-red-400" />
            <span>Loading library…</span>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {!loadingDocs && docs.length === 0 && (
          <div className="home-empty">
            <div className="home-empty-icon">
              <BookOpen size={32} />
            </div>
            <p className="home-empty-title">No projects yet</p>
            <p className="home-empty-sub">
              Drop a PDF or image above to extract your first Amharic document.
              Saved projects will appear here for quick access.
            </p>
          </div>
        )}

        {/* ── Recent projects ──────────────────────────────────────── */}
        {!loadingDocs && recent.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <Clock size={13} />
              <span>Recent</span>
            </div>
            <div className="home-card-grid">
              {recent.map(doc => (
                <ProjectCard
                  key={doc.id}
                  doc={doc}
                  thumbSrc={toThumbSrc(doc.thumbnailUrl) ?? toThumbSrc(doc.pageImages?.[0])}
                  onOpen={() => handleOpenDoc(doc)}
                  onDelete={e => handleDelete(e, doc.id)}
                  onDownload={e => handleDownload(e, doc)}
                  isLoading={loadingDocId === doc.id}
                  isDownloading={downloadingId === doc.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Older projects ───────────────────────────────────────── */}
        {!loadingDocs && older.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <FolderOpen size={13} />
              <span>All Projects</span>
            </div>
            <div className="home-list">
              {older.map(doc => (
                <ProjectRow
                  key={doc.id}
                  doc={doc}
                  thumbSrc={toThumbSrc(doc.thumbnailUrl) ?? toThumbSrc(doc.pageImages?.[0])}
                  onOpen={() => handleOpenDoc(doc)}
                  onDelete={e => handleDelete(e, doc.id)}
                  onDownload={e => handleDownload(e, doc)}
                  isDownloading={downloadingId === doc.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* No search results */}
        {!loadingDocs && docs.length > 0 && filtered.length === 0 && (
          <div className="home-empty">
            <p className="home-empty-title">No results for "{search}"</p>
          </div>
        )}

      </main>
    </div>
  );
}

/** Normalize a thumbnail value (Blob URL, data: URL, or raw base64) to an img src. */
function toThumbSrc(val: string | undefined | null): string | null {
  if (!val) return null;
  if (val.startsWith('http') || val.startsWith('data:')) return val;
  return `data:image/jpeg;base64,${val}`;
}

// ── Project Card (recent, large) ───────────────────────────────────────────
function ProjectCard({ doc, thumbSrc, onOpen, onDelete, onDownload, isLoading, isDownloading }: {
  doc: SavedDocument;
  thumbSrc: string | null;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  isLoading?: boolean;
  isDownloading?: boolean;
}) {
  return (
    <button className="proj-card" onClick={onOpen} disabled={isLoading || isDownloading}>
      <div className="proj-card-thumb">
        {thumbSrc
          ? <img src={thumbSrc} alt="" className="proj-card-thumb-img" />
          : <FileText size={28} className="text-gray-300" />
        }
      </div>
      <div className="proj-card-body">
        <p className="proj-card-name">{doc.name}</p>
        <p className="proj-card-meta">
          {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''} · {formatDate(doc.savedAt)}
        </p>
      </div>
      <div className="proj-card-footer">
        <button className="proj-card-del" onClick={onDelete} title="Delete project">
          <Trash2 size={13} />
        </button>
        <button
          className="proj-card-dl"
          onClick={onDownload}
          title="Download PDF"
          disabled={isDownloading}
        >
          {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        </button>
        <span className="proj-card-open">
          Open <ChevronRight size={13} />
        </span>
      </div>
    </button>
  );
}

// ── Project Row (older, compact list) ─────────────────────────────────────
function ProjectRow({ doc, thumbSrc, onOpen, onDelete, onDownload, isLoading, isDownloading }: {
  doc: SavedDocument;
  thumbSrc: string | null;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  isLoading?: boolean;
  isDownloading?: boolean;
}) {
  return (
    <button className="proj-row" onClick={onOpen} disabled={isLoading || isDownloading}>
      <div className="proj-row-icon">
        {thumbSrc
          ? <img src={thumbSrc} alt="" className="proj-row-thumb" />
          : <Upload size={14} />
        }
      </div>
      <div className="proj-row-text">
        <span className="proj-row-name">{doc.name}</span>
        <span className="proj-row-meta">
          {doc.pageCount} pages · {formatDate(doc.savedAt)}
        </span>
      </div>
      <button
        className="proj-row-dl"
        onClick={onDownload}
        title="Download PDF"
        disabled={isDownloading}
      >
        {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      </button>
      <button className="proj-row-del" onClick={onDelete} title="Delete">
        <Trash2 size={13} />
      </button>
      <ChevronRight size={14} className="proj-row-arrow" />
    </button>
  );
}
