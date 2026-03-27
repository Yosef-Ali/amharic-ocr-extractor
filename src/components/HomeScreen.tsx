import { useState, useEffect, useRef } from 'react';
import {
  FileText, Upload, FolderOpen, Trash2, Clock,
  Sparkles, ChevronRight, Plus, Search, Loader2, ScanSearch,
  ShieldCheck, Download, Layers, ImageIcon, AlignLeft,
} from 'lucide-react';
import { type Theme } from '../hooks/useTheme';
import ThemeToggleButton from './ThemeToggleButton';
import UserMenu from './UserMenu';
import {
  loadAllDocuments, loadDocumentContent, deleteDocument, type SavedDocument,
} from '../services/storageService';
import { downloadDocumentAsPDF } from '../utils/downloadPDF';
import DeleteConfirmModal from './DeleteConfirmModal';

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
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toThumbSrc(val: string | undefined | null): string | null {
  if (!val) return null;
  if (val.startsWith('http') || val.startsWith('data:')) return val;
  return `data:image/jpeg;base64,${val}`;
}

const FEATURES = [
  { icon: <ScanSearch size={20} />, label: 'Amharic OCR', desc: 'Accurate Ethiopic text extraction from any scan' },
  { icon: <Layers      size={20} />, label: 'Layout Preserve', desc: 'Multi-column, two-page & complex document layouts' },
  { icon: <ImageIcon   size={20} />, label: 'Image Embed', desc: 'Illustrations cropped and placed at exact position' },
  { icon: <AlignLeft   size={20} />, label: 'Live Editor', desc: 'Edit, find-replace & correct homophones in-place' },
];

export default function HomeScreen({
  onFile, onLoadDoc, isProcessing, processingStatus,
  theme, onToggleTheme, user, onSignOut, isAdmin, onOpenAdmin,
}: Props) {
  const [docs,           setDocs]           = useState<SavedDocument[]>([]);
  const [loadingDocs,    setLoadingDocs]    = useState(true);
  const [search,         setSearch]         = useState('');
  const [isDragging,     setIsDragging]     = useState(false);
  const [loadingDocId,   setLoadingDocId]   = useState<string | null>(null);
  const [downloadingId,  setDownloadingId]  = useState<string | null>(null);
  const [deleteConfirmId,setDeleteConfirmId]= useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAllDocuments().then(d => { setDocs(d); setLoadingDocs(false); });
  }, []);

  const handleDeleteRequest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    await deleteDocument(id);
    setDocs(d => d.filter(x => x.id !== id));
  };

  const handleCancelDelete = () => setDeleteConfirmId(null);

  const handleFilePick = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const name = file.name.toLowerCase();
    if (
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'text/plain' ||
      name.endsWith('.docx') || name.endsWith('.txt') || name.endsWith('.md')
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

  const filtered = docs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
  const recent   = filtered.slice(0, 3);
  const older    = filtered.slice(3);
  const hasAny   = !loadingDocs && docs.length > 0;

  return (
    <div className="home-screen">

      {/* ── Delete confirmation modal ── */}
      {deleteConfirmId && (
        <DeleteConfirmModal onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />
      )}

      {/* ── Navbar ── */}
      <header className="home-nav">
        <div className="home-nav-inner">
          <div className="home-brand">
            <div className="home-brand-icon">
              <ScanSearch size={18} className="text-white" />
              <Sparkles className="home-brand-sparkle" />
            </div>
            <div>
              <p className="home-brand-name">
                Amharic <span className="home-brand-accent">OCR</span>
              </p>
              <p className="home-brand-sub">PDF · Layout · Amharic</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ThemeToggleButton theme={theme} onClick={onToggleTheme} />
            {isAdmin && (
              <button className="home-admin-btn" onClick={onOpenAdmin} title="Admin Panel">
                <ShieldCheck size={15} /><span>Admin</span>
              </button>
            )}
            {user && <UserMenu user={user} onSignOut={onSignOut} />}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-hero-text">
            <h1 className="home-hero-title">
              Extract & Edit<br />
              <span className="home-hero-accent">Amharic Documents</span>
            </h1>
            <p className="home-hero-sub">
              Upload any scanned Amharic page — AI reads the fidel accurately, preserves layout, and gives you editable text you can export.
            </p>
            <div className="home-feat-pills">
              {FEATURES.map(f => (
                <div key={f.label} className="home-feat-pill">
                  {f.icon}<span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upload zone */}
          <label
            className={`home-upload-zone${isDragging ? ' home-upload-zone--drag' : ''}${isProcessing ? ' home-upload-zone--busy' : ''}`}
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
              <div className="home-upload-busy">
                <Loader2 size={28} className="animate-spin" />
                <span>{processingStatus || 'Loading…'}</span>
              </div>
            ) : (
              <>
                <div className="home-upload-ring">
                  <Plus size={24} />
                </div>
                <p className="home-upload-label">New Project</p>
                <p className="home-upload-hint">Drop PDF, image, Word or text</p>
                <p className="home-upload-hint" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                  or click to browse
                </p>
              </>
            )}
          </label>
        </div>
      </section>

      {/* ── Main content ── */}
      <main className="home-main">

        {/* Search */}
        {hasAny && (
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

        {/* Skeleton loading */}
        {loadingDocs && (
          <div className="home-section">
            <div className="home-section-header">
              <Clock size={13} /><span>Recent</span>
            </div>
            <div className="home-card-grid">
              {[1, 2, 3].map(i => (
                <div key={i} className="proj-card-skeleton">
                  <div className="skel skel-thumb" />
                  <div className="skel-body">
                    <div className="skel skel-line skel-line--title" />
                    <div className="skel skel-line skel-line--meta" />
                  </div>
                  <div className="skel-footer">
                    <div className="skel skel-btn" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state — how it works */}
        {!loadingDocs && docs.length === 0 && (
          <div className="home-empty">
            <p className="home-empty-title">How it works</p>
            <div className="home-steps">
              <div className="home-step">
                <div className="home-step-num">1</div>
                <div>
                  <p className="home-step-label">Upload your document</p>
                  <p className="home-step-desc">Drop a scanned PDF, photo, or Word file above</p>
                </div>
              </div>
              <div className="home-step">
                <div className="home-step-num">2</div>
                <div>
                  <p className="home-step-label">AI extracts Amharic text</p>
                  <p className="home-step-desc">Click <strong>Extract All</strong> — the AI reads every fidel character accurately</p>
                </div>
              </div>
              <div className="home-step">
                <div className="home-step-num">3</div>
                <div>
                  <p className="home-step-label">Edit and export</p>
                  <p className="home-step-desc">Fix any errors in-place, then download as PDF, .txt, or .doc</p>
                </div>
              </div>
            </div>
            <div className="home-feat-grid">
              {FEATURES.map(f => (
                <div key={f.label} className="home-feat-card">
                  <div className="home-feat-card-icon">{f.icon}</div>
                  <p className="home-feat-card-label">{f.label}</p>
                  <p className="home-feat-card-desc">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent */}
        {!loadingDocs && recent.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <Clock size={13} /><span>Recent</span>
            </div>
            <div className="home-card-grid">
              {recent.map(doc => (
                <ProjectCard
                  key={doc.id}
                  doc={doc}
                  thumbSrc={toThumbSrc(doc.thumbnailUrl) ?? toThumbSrc(doc.pageImages?.[0])}
                  onOpen={() => handleOpenDoc(doc)}
                  onDeleteRequest={e => handleDeleteRequest(e, doc.id)}
                  onDownload={e => handleDownload(e, doc)}
                  isLoading={loadingDocId === doc.id}
                  isDownloading={downloadingId === doc.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* All projects (list) */}
        {!loadingDocs && older.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <FolderOpen size={13} /><span>All Projects</span>
            </div>
            <div className="home-list">
              {older.map(doc => (
                <ProjectRow
                  key={doc.id}
                  doc={doc}
                  thumbSrc={toThumbSrc(doc.thumbnailUrl) ?? toThumbSrc(doc.pageImages?.[0])}
                  onOpen={() => handleOpenDoc(doc)}
                  onDeleteRequest={e => handleDeleteRequest(e, doc.id)}
                  onDownload={e => handleDownload(e, doc)}
                  isDownloading={downloadingId === doc.id}
                />
              ))}
            </div>
          </section>
        )}

        {/* No search results */}
        {hasAny && filtered.length === 0 && (
          <div className="home-empty">
            <p className="home-empty-title">No results for "{search}"</p>
          </div>
        )}

      </main>
    </div>
  );
}

// ── Project Card (recent, large) ──────────────────────────────────────────
function ProjectCard({ doc, thumbSrc, onOpen, onDeleteRequest, onDownload, isLoading, isDownloading }: {
  doc: SavedDocument; thumbSrc: string | null;
  onOpen: () => void;
  onDeleteRequest: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  isLoading?: boolean; isDownloading?: boolean;
}) {
  const busy = isLoading || isDownloading;
  return (
    <div
      className={`proj-card${busy ? ' proj-card--busy' : ''}`}
      onClick={busy ? undefined : onOpen}
      role="button" tabIndex={0}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); onOpen(); } }}
    >
      <div className="proj-card-thumb">
        {thumbSrc
          ? <img src={thumbSrc} alt="" className="proj-card-thumb-img" />
          : <FileText size={32} className="proj-card-thumb-icon" />
        }
        {isLoading && (
          <div className="proj-card-overlay">
            <Loader2 size={22} className="animate-spin" />
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#fff', marginTop: 4 }}>Opening…</span>
          </div>
        )}
      </div>
      <div className="proj-card-body">
        <p className="proj-card-name">{doc.name}</p>
        <p className="proj-card-meta">
          {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''} · {formatDate(doc.savedAt)}
        </p>
      </div>
      <div className="proj-card-footer">
        <button className="proj-card-icon-btn" onClick={onDeleteRequest} title="Delete">
          <Trash2 size={13} />
        </button>
        <button className="proj-card-icon-btn" onClick={onDownload} title="Download PDF" disabled={!!isDownloading}>
          {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        </button>
        <span className="proj-card-open">Open <ChevronRight size={12} /></span>
      </div>
    </div>
  );
}

// ── Project Row (older, compact) ──────────────────────────────────────────
function ProjectRow({ doc, thumbSrc, onOpen, onDeleteRequest, onDownload, isLoading, isDownloading }: {
  doc: SavedDocument; thumbSrc: string | null;
  onOpen: () => void;
  onDeleteRequest: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  isLoading?: boolean; isDownloading?: boolean;
}) {
  const busy = isLoading || isDownloading;
  return (
    <div
      className={`proj-row${busy ? ' proj-row--busy' : ''}`}
      onClick={busy ? undefined : onOpen}
      role="button" tabIndex={0}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); onOpen(); } }}
    >
      <div className="proj-row-thumb-wrap">
        {thumbSrc
          ? <img src={thumbSrc} alt="" className="proj-row-thumb" />
          : <Upload size={14} className="proj-row-thumb-icon" />
        }
      </div>
      <div className="proj-row-text">
        <span className="proj-row-name">{doc.name}</span>
        <span className="proj-row-meta">{doc.pageCount} pages · {formatDate(doc.savedAt)}</span>
      </div>
      <button className="proj-row-btn" onClick={onDownload} title="Download PDF" disabled={!!isDownloading}>
        {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      </button>
      <button className="proj-row-btn" onClick={onDeleteRequest} title="Delete">
        <Trash2 size={13} />
      </button>
      <ChevronRight size={14} className="proj-row-arrow" />
    </div>
  );
}
