import { authFetch } from '../lib/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AdminUser {
  id:        string;
  email:     string;
  name:      string | null;
  createdAt: string;
  docCount:  number;
  docLimit:  number;
  blocked:   boolean;
}

export interface AdminDocument {
  id:        string;
  userId:    string;
  userEmail: string;
  name:      string;
  pageCount: number;
  savedAt:   string;
}

export interface AdminStats {
  totalUsers:     number;
  totalDocuments: number;
  totalPages:     number;
}

// ---------------------------------------------------------------------------
// Ensure users table exists — now handled by /api/schema, called elsewhere
// ---------------------------------------------------------------------------
export async function ensureUsersTable(): Promise<void> {
  // Schema handled by /api/schema, called elsewhere
}

// ---------------------------------------------------------------------------
// Upsert user on login — called from App.tsx after auth
// ---------------------------------------------------------------------------
export async function upsertUser(_id: string, email: string, name?: string): Promise<{ blocked: boolean }> {
  const res = await authFetch('/api/user-sync', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Per-user quota — checked server-side during save
// ---------------------------------------------------------------------------
export async function getUserQuota(_userId: string): Promise<{ used: number; limit: number }> {
  // This is checked server-side during save, no client call needed
  return { used: 0, limit: 999 };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export async function getAdminStats(): Promise<AdminStats> {
  const res = await authFetch('/api/admin?action=stats');
  return res.json();
}

// ---------------------------------------------------------------------------
// Users — with doc counts
// ---------------------------------------------------------------------------
export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await authFetch('/api/admin?action=users');
  return res.json();
}

// ---------------------------------------------------------------------------
// Per-user document limit (admin only)
// ---------------------------------------------------------------------------
export async function setUserDocLimit(userId: string, limit: number): Promise<void> {
  await authFetch('/api/admin?action=setDocLimit', {
    method: 'POST',
    body: JSON.stringify({ userId, limit }),
  });
}

// ---------------------------------------------------------------------------
// All documents — optionally filtered by user
// ---------------------------------------------------------------------------
export async function getAdminDocuments(userId?: string): Promise<AdminDocument[]> {
  const url = userId
    ? `/api/admin?action=documents&userId=${encodeURIComponent(userId)}`
    : '/api/admin?action=documents';
  const res = await authFetch(url);
  return res.json();
}

// ---------------------------------------------------------------------------
// Delete any document (admin — no user_id guard)
// ---------------------------------------------------------------------------
export async function adminDeleteDocument(id: string): Promise<void> {
  await authFetch('/api/admin?action=deleteDocument', {
    method: 'DELETE',
    body: JSON.stringify({ docId: id }),
  });
}

// ---------------------------------------------------------------------------
// Delete user + all their data
// ---------------------------------------------------------------------------
export async function deleteUser(id: string): Promise<void> {
  await authFetch('/api/admin?action=deleteUser', {
    method: 'DELETE',
    body: JSON.stringify({ userId: id }),
  });
}

// ---------------------------------------------------------------------------
// Block / unblock
// ---------------------------------------------------------------------------
export async function blockUser(id: string): Promise<void> {
  await authFetch('/api/admin?action=blockUser', {
    method: 'POST',
    body: JSON.stringify({ userId: id }),
  });
}

export async function unblockUser(id: string): Promise<void> {
  await authFetch('/api/admin?action=unblockUser', {
    method: 'POST',
    body: JSON.stringify({ userId: id }),
  });
}
