import { useState, useEffect, useCallback } from 'react';
import {
  X, Users, FileText, BarChart3, Trash2, RefreshCw,
  ChevronDown, ChevronRight, ShieldCheck, Loader2, Ban, ShieldOff,
} from 'lucide-react';
import {
  getAdminStats, getAdminUsers, getAdminDocuments, adminDeleteDocument,
  blockUser, unblockUser,
  type AdminUser, type AdminDocument, type AdminStats,
} from '../services/adminService';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-icon">{icon}</div>
      <div>
        <p className="adm-stat-value">{value.toLocaleString()}</p>
        <p className="adm-stat-label">{label}</p>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

type Tab = 'overview' | 'users' | 'documents';

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminPanel({ onClose }: Props) {
  const [tab,       setTab]       = useState<Tab>('overview');
  const [stats,     setStats]     = useState<AdminStats | null>(null);
  const [users,     setUsers]     = useState<AdminUser[]>([]);
  const [docs,      setDocs]      = useState<AdminDocument[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [toggling,  setToggling]  = useState<string | null>(null);
  const [filterUid, setFilterUid] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u, d] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminDocuments(),
      ]);
      setStats(s);
      setUsers(u);
      setDocs(d);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleBlock = async (u: AdminUser) => {
    setToggling(u.id);
    try {
      if (u.blocked) await unblockUser(u.id); else await blockUser(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, blocked: !x.blocked } : x));
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await adminDeleteDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
      if (stats) setStats({ ...stats, totalDocuments: stats.totalDocuments - 1 });
    } finally {
      setDeleting(null);
    }
  };

  const filteredDocs = filterUid ? docs.filter(d => d.userId === filterUid) : docs;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="adm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-panel">

        {/* Header */}
        <div className="adm-header">
          <div className="adm-header-left">
            <ShieldCheck size={18} className="adm-header-icon" />
            <span className="adm-header-title">Admin Panel</span>
          </div>
          <div className="adm-header-right">
            <button className="adm-refresh-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="adm-close-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="adm-tabs">
          {(['overview', 'users', 'documents'] as Tab[]).map(t => (
            <button
              key={t}
              className={`adm-tab${tab === t ? ' adm-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'overview'   && <BarChart3 size={13} />}
              {t === 'users'      && <Users size={13} />}
              {t === 'documents'  && <FileText size={13} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'users'     && !loading && <span className="adm-tab-badge">{users.length}</span>}
              {t === 'documents' && !loading && <span className="adm-tab-badge">{docs.length}</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="adm-body">
          {loading && (
            <div className="adm-loading">
              <Loader2 size={22} className="animate-spin" />
              <span>Loading…</span>
            </div>
          )}

          {error && !loading && (
            <div className="adm-error">⚠️ {error}</div>
          )}

          {!loading && !error && (
            <>
              {/* ── Overview ── */}
              {tab === 'overview' && stats && (
                <div>
                  <div className="adm-stat-grid">
                    <StatCard label="Total Users"     value={stats.totalUsers}     icon={<Users size={18} />} />
                    <StatCard label="Total Documents" value={stats.totalDocuments} icon={<FileText size={18} />} />
                    <StatCard label="Total Pages"     value={stats.totalPages}     icon={<BarChart3 size={18} />} />
                  </div>

                  <h3 className="adm-section-title">Recent Documents</h3>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>User</th>
                        <th>Pages</th>
                        <th>Saved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.slice(0, 8).map(d => (
                        <tr key={d.id}>
                          <td className="adm-td-name">{d.name}</td>
                          <td className="adm-td-email">{d.userEmail}</td>
                          <td>{d.pageCount}</td>
                          <td>{fmt(d.savedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Users ── */}
              {tab === 'users' && (
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Joined</th>
                      <th>Docs</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <>
                        <tr
                          key={u.id}
                          className={`adm-user-row${expandedUser === u.id ? ' adm-user-row--expanded' : ''}`}
                          onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                        >
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-avatar">
                                {(u.email[0] ?? '?').toUpperCase()}
                              </span>
                              <div>
                                <p className="adm-user-email">{u.email}</p>
                                {u.name && <p className="adm-user-name">{u.name}</p>}
                              </div>
                            </div>
                          </td>
                          <td>{fmt(u.createdAt)}</td>
                          <td><span className="adm-doc-badge">{u.docCount}</span></td>
                          <td>
                            {u.blocked
                              ? <span className="adm-status-blocked">Blocked</span>
                              : <span className="adm-status-active">Active</span>}
                          </td>
                          <td style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                            <button
                              className={`adm-block-btn${u.blocked ? ' adm-block-btn--unblock' : ''}`}
                              onClick={e => { e.stopPropagation(); handleToggleBlock(u); }}
                              disabled={toggling === u.id}
                              title={u.blocked ? 'Unblock user' : 'Block user'}
                            >
                              {toggling === u.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : u.blocked ? <ShieldOff size={11} /> : <Ban size={11} />}
                              {u.blocked ? 'Unblock' : 'Block'}
                            </button>
                            {expandedUser === u.id
                              ? <ChevronDown size={13} />
                              : <ChevronRight size={13} />}
                          </td>
                        </tr>

                        {/* Expanded: show user's documents */}
                        {expandedUser === u.id && (
                          <tr key={`${u.id}-docs`} className="adm-user-docs-row">
                            <td colSpan={4}>
                              {docs.filter(d => d.userId === u.id).length === 0 ? (
                                <p className="adm-empty-sub">No documents yet.</p>
                              ) : (
                                <table className="adm-subtable">
                                  <tbody>
                                    {docs.filter(d => d.userId === u.id).map(d => (
                                      <tr key={d.id}>
                                        <td>{d.name}</td>
                                        <td>{d.pageCount}p</td>
                                        <td>{fmt(d.savedAt)}</td>
                                        <td>
                                          <button
                                            className="adm-del-btn"
                                            onClick={e => { e.stopPropagation(); handleDelete(d.id); }}
                                            disabled={deleting === d.id}
                                          >
                                            {deleting === d.id
                                              ? <Loader2 size={11} className="animate-spin" />
                                              : <Trash2 size={11} />}
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ── Documents ── */}
              {tab === 'documents' && (
                <div>
                  {/* User filter pills */}
                  <div className="adm-filter-row">
                    <button
                      className={`adm-filter-pill${filterUid === null ? ' adm-filter-pill--active' : ''}`}
                      onClick={() => setFilterUid(null)}
                    >
                      All
                    </button>
                    {users.map(u => (
                      <button
                        key={u.id}
                        className={`adm-filter-pill${filterUid === u.id ? ' adm-filter-pill--active' : ''}`}
                        onClick={() => setFilterUid(filterUid === u.id ? null : u.id)}
                      >
                        {u.email}
                      </button>
                    ))}
                  </div>

                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>User</th>
                        <th>Pages</th>
                        <th>Saved</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocs.length === 0 && (
                        <tr><td colSpan={5} className="adm-empty">No documents.</td></tr>
                      )}
                      {filteredDocs.map(d => (
                        <tr key={d.id}>
                          <td className="adm-td-name">{d.name}</td>
                          <td className="adm-td-email">{d.userEmail}</td>
                          <td>{d.pageCount}</td>
                          <td>{fmt(d.savedAt)}</td>
                          <td>
                            <button
                              className="adm-del-btn"
                              onClick={() => handleDelete(d.id)}
                              disabled={deleting === d.id}
                              title="Delete document"
                            >
                              {deleting === d.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Trash2 size={12} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
