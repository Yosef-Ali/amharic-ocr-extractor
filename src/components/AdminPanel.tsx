import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Users, BarChart3, Trash2, RefreshCw,
  ShieldCheck, Loader2, Ban, ShieldOff,
  Download, Database, Gauge,
} from 'lucide-react';
import {
  getAdminStats, getAdminUsers, blockUser, unblockUser, deleteUser,
  setUserDocLimit,
  type AdminUser, type AdminStats,
} from '../services/adminService';
import {
  listExports, getExportJson, deleteExport, getExportStats, downloadExportJson,
  type ExportMeta,
} from '../services/exportService';
import DeleteConfirmModal from './DeleteConfirmModal';

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatCard({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-icon" style={accent ? { background: accent + '22', color: accent } : undefined}>{icon}</div>
      <div>
        <p className="adm-stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="adm-stat-label">{label}</p>
      </div>
    </div>
  );
}

/** Anonymous display: first 8 chars of user ID, no PII */
function anonId(userId: string) {
  return `#${userId.slice(0, 8)}`;
}

/** Usage bar: filled / limit */
function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit === 0 ? 100 : Math.min(100, (used / limit) * 100);
  const color = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f97316' : '#22c55e';
  return (
    <div className="adm-usage-wrap">
      <div className="adm-usage-bar">
        <div className="adm-usage-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="adm-usage-label" style={{ color }}>{used} / {limit === 9999 ? '∞' : limit}</span>
    </div>
  );
}

/** Preset limit buttons */
const LIMIT_PRESETS = [3, 5, 10, 20, 9999];

interface Props { onClose: () => void; }
type Tab = 'overview' | 'users' | 'aidata';

const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3  },
  { id: 'users',    label: 'Users',    icon: Users      },
  { id: 'aidata',   label: 'AI Data',  icon: Database   },
];

export default function AdminPanel({ onClose }: Props) {
  const [tab,          setTab]          = useState<Tab>('overview');
  const [stats,        setStats]        = useState<AdminStats | null>(null);
  const [users,        setUsers]        = useState<AdminUser[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [toggling,     setToggling]     = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [settingLimit, setSettingLimit] = useState<string | null>(null);

  const [exports,     setExports]     = useState<ExportMeta[]>([]);
  const [exportStats, setExportStats] = useState<{ totalExports: number; totalChunks: number; totalPages: number } | null>(null);
  const [deletingExp, setDeletingExp] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Delete confirmation
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, u, exps, expStats] = await Promise.all([
        getAdminStats(), getAdminUsers(), listExports(), getExportStats(),
      ]);
      setStats(s); setUsers(u); setExports(exps); setExportStats(expStats);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteUser = (u: AdminUser) => {
    pendingAction.current = async () => {
      setDeletingUser(u.id);
      try {
        await deleteUser(u.id);
        setUsers(prev => prev.filter(x => x.id !== u.id));
        if (stats) setStats({ ...stats, totalUsers: stats.totalUsers - 1 });
      } finally { setDeletingUser(null); }
    };
    setConfirmAction(() => pendingAction.current);
  };

  const handleToggleBlock = async (u: AdminUser) => {
    setToggling(u.id);
    try {
      if (u.blocked) await unblockUser(u.id); else await blockUser(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, blocked: !x.blocked } : x));
    } finally { setToggling(null); }
  };

  const handleSetLimit = async (u: AdminUser, limit: number) => {
    setSettingLimit(u.id);
    try {
      await setUserDocLimit(u.id, limit);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, docLimit: limit } : x));
    } finally { setSettingLimit(null); }
  };

  const handleDeleteExport = (id: string) => {
    pendingAction.current = async () => {
      setDeletingExp(id);
      try {
        await deleteExport(id);
        setExports(prev => prev.filter(e => e.id !== id));
        if (exportStats) setExportStats({ ...exportStats, totalExports: exportStats.totalExports - 1 });
      } finally { setDeletingExp(null); }
    };
    setConfirmAction(() => pendingAction.current);
  };

  const handleDownloadExport = async (exp: ExportMeta) => {
    setDownloading(exp.id);
    try {
      const full = await getExportJson(exp.id);
      if (full) downloadExportJson(full, exp.documentName);
    } finally { setDownloading(null); }
  };

  // Derived stats
  const atLimit  = users.filter(u => u.docCount >= u.docLimit).length;
  const blocked  = users.filter(u => u.blocked).length;

  return (
    <div className="adm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {confirmAction && (
        <DeleteConfirmModal
          onConfirm={() => { confirmAction(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      <div className="adm-panel">

        {/* Header */}
        <div className="adm-header">
          <div className="adm-header-left">
            <ShieldCheck size={17} className="adm-header-icon" />
            <span className="adm-header-title">Admin</span>
            <span className="adm-header-badge">System Management</span>
          </div>
          <div className="adm-header-right">
            <button className="adm-refresh-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="adm-close-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="adm-privacy-notice">
          🔒 User document content is private and not accessible from this panel.
        </div>

        {/* Tabs */}
        <div className="adm-tabs">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
            const badge = id === 'users' ? users.length : id === 'aidata' ? exports.length : null;
            return (
              <button key={id} className={`adm-tab${tab === id ? ' adm-tab--active' : ''}`} onClick={() => setTab(id)}>
                <Icon size={13} />{label}
                {badge !== null && !loading && <span className="adm-tab-badge">{badge}</span>}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="adm-body">
          {loading && <div className="adm-loading"><Loader2 size={22} className="animate-spin" /><span>Loading…</span></div>}
          {error && !loading && <div className="adm-error">⚠️ {error}</div>}

          {!loading && !error && (
            <>
              {/* ── Overview ── */}
              {tab === 'overview' && stats && (
                <div>
                  <div className="adm-stat-grid">
                    <StatCard label="Total Users"     value={stats.totalUsers}     icon={<Users size={18} />} />
                    <StatCard label="Total Documents" value={stats.totalDocuments} icon={<Database size={18} />} />
                    <StatCard label="Total Pages"     value={stats.totalPages}     icon={<BarChart3 size={18} />} />
                    <StatCard label="AI Exports"      value={exportStats?.totalExports ?? 0} icon={<Download size={18} />} />
                    <StatCard label="At Quota Limit"  value={atLimit} icon={<Gauge size={18} />} accent="#f97316" />
                    <StatCard label="Blocked"         value={blocked} icon={<Ban size={18} />}  accent="#ef4444" />
                  </div>
                  <p className="adm-overview-note">
                    Document names and content are not shown here to protect user privacy.
                    Use the Users tab to manage quotas and access.
                  </p>
                </div>
              )}

              {/* ── Users + Quota Management ── */}
              {tab === 'users' && (
                <div>
                  <p className="adm-section-desc">
                    Emails shown for account management only. Document titles and content are not accessible.
                  </p>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Joined</th>
                        <th>Usage</th>
                        <th>Set Limit</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 && (
                        <tr><td colSpan={6} className="adm-empty">No users yet.</td></tr>
                      )}
                      {users.map(u => (
                        <tr key={u.id} className={u.blocked ? 'adm-row--blocked' : ''}>
                          <td>
                            <div className="adm-user-cell">
                              <span className="adm-avatar">{(u.email[0] ?? '?').toUpperCase()}</span>
                              <div>
                                <p className="adm-user-email">{u.email}</p>
                                <p className="adm-user-anon">{anonId(u.id)}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmt(u.createdAt)}</td>
                          <td><UsageBar used={u.docCount} limit={u.docLimit} /></td>
                          <td>
                            <div className="adm-limit-presets">
                              {LIMIT_PRESETS.map(p => (
                                <button
                                  key={p}
                                  className={`adm-limit-btn${u.docLimit === p ? ' adm-limit-btn--active' : ''}`}
                                  onClick={() => handleSetLimit(u, p)}
                                  disabled={settingLimit === u.id}
                                  title={`Set limit to ${p === 9999 ? 'unlimited' : p}`}
                                >
                                  {settingLimit === u.id && u.docLimit !== p
                                    ? <Loader2 size={9} className="animate-spin" />
                                    : p === 9999 ? '∞' : p}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td>
                            {u.blocked
                              ? <span className="adm-status-blocked">Blocked</span>
                              : u.docCount >= u.docLimit
                                ? <span className="adm-status-limit">At limit</span>
                                : <span className="adm-status-active">Active</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                className={`adm-block-btn${u.blocked ? ' adm-block-btn--unblock' : ''}`}
                                onClick={() => handleToggleBlock(u)}
                                disabled={toggling === u.id}
                                title={u.blocked ? 'Unblock' : 'Block'}
                              >
                                {toggling === u.id
                                  ? <Loader2 size={10} className="animate-spin" />
                                  : u.blocked ? <ShieldOff size={10} /> : <Ban size={10} />}
                              </button>
                              <button
                                className="adm-del-btn"
                                onClick={() => handleDeleteUser(u)}
                                disabled={deletingUser === u.id}
                                title="Delete account and all data"
                              >
                                {deletingUser === u.id
                                  ? <Loader2 size={10} className="animate-spin" />
                                  : <Trash2 size={10} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── AI Data — anonymized ── */}
              {tab === 'aidata' && (
                <div>
                  <p className="adm-section-desc">
                    User references are anonymized. Export content is for AI training only.
                  </p>
                  {exportStats && (
                    <div className="adm-stat-grid" style={{ marginBottom: '1.25rem' }}>
                      <StatCard label="Exports"      value={exportStats.totalExports} icon={<Database size={18} />} />
                      <StatCard label="Total Chunks" value={exportStats.totalChunks}  icon={<BarChart3 size={18} />} />
                      <StatCard label="Total Pages"  value={exportStats.totalPages}   icon={<Database size={18} />} />
                    </div>
                  )}
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>User</th>
                        <th>Pages</th>
                        <th>Chunks</th>
                        <th>Languages</th>
                        <th>Updated</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {exports.length === 0 && (
                        <tr><td colSpan={7} className="adm-empty">No AI data exports yet.</td></tr>
                      )}
                      {exports.map(e => (
                        <tr key={e.id}>
                          <td className="adm-td-name">{e.documentName}</td>
                          {/* Show anonymized user ID — no email */}
                          <td className="adm-td-anon">{anonId(e.userId)}</td>
                          <td>{e.pageCount}</td>
                          <td>{e.chunkCount}</td>
                          <td>{e.languages.join(', ') || '—'}</td>
                          <td>{fmt(e.updatedAt)}</td>
                          <td style={{ display: 'flex', gap: '0.3rem' }}>
                            <button className="adm-del-btn adm-download-btn" onClick={() => handleDownloadExport(e)} disabled={downloading === e.id} title="Download">
                              {downloading === e.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                            </button>
                            <button className="adm-del-btn" onClick={() => handleDeleteExport(e.id)} disabled={deletingExp === e.id} title="Delete">
                              {deletingExp === e.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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
