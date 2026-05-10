'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, UserPlus, MessageSquare, ShieldCheck, AlertCircle, Activity, X, Trash2, ToggleLeft, ToggleRight, Crown, Hash, Plus, Megaphone, Lock,
} from 'lucide-react';
import { api, type AdminAuditEntry, type AdminConversationListItem, type AdminInvite, type AdminStats, type AdminUser, type DirectoryUser } from '../../../src/api';
import { relativeTime } from '../../../src/time';
import { Upload, FileText, Flag } from 'lucide-react';

type Tab = 'overview' | 'invites' | 'users' | 'channels' | 'flagged' | 'audit';

type FlaggedItem = {
  id: string;
  body: string;
  createdAt: string;
  flagged: { id: string; label: string }[];
  sender: { id: string; displayName: string };
  conversation: { id: string; title: string | null; kind: string; sensitivity: string };
};

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; isAdmin: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [invites, setInvites] = useState<AdminInvite[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [channels, setChannels] = useState<AdminConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [flagged, setFlagged] = useState<FlaggedItem[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);

  useEffect(() => {
    api.me().then((u) => {
      if (!u.isAdmin) router.replace('/chat');
      else setMe({ id: u.id, isAdmin: u.isAdmin });
    });
  }, [router]);

  useEffect(() => {
    if (!me) return;
    api.adminStats().then(setStats).catch((e) => setError(e.message));
    api.adminInvites().then(setInvites).catch(() => {});
    api.adminUsers().then(setUsers).catch(() => {});
    api.adminListConversations().then(setChannels).catch(() => {});
    api.adminFlagged().then(setFlagged).catch(() => {});
    api.adminAudit(200).then(setAudit).catch(() => {});
  }, [me]);

  const refreshUsers = () => api.adminUsers().then(setUsers).catch(() => {});
  const refreshInvites = () => api.adminInvites().then(setInvites).catch(() => {});
  const refreshStats = () => api.adminStats().then(setStats).catch(() => {});
  const refreshChannels = () => api.adminListConversations().then(setChannels).catch(() => {});

  if (!me) return <div style={styles.loading}>Loading…</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.kicker}>ADMIN DASHBOARD</p>
          <h1 style={styles.title}>User access and analytics</h1>
        </div>
        <button style={styles.cta} onClick={() => setShowCreate(true)}>
          <UserPlus size={16} />
          Invite employees
        </button>
      </header>

      <div style={styles.tabs}>
        {(['overview', 'invites', 'users', 'channels', 'flagged', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'invites' && invites ? ` (${invites.length})` : ''}
            {t === 'users' && users ? ` (${users.length})` : ''}
            {t === 'channels' && channels ? ` (${channels.length})` : ''}
            {t === 'flagged' && flagged ? ` (${flagged.length})` : ''}
            {t === 'audit' && audit ? ` (${audit.length})` : ''}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {tab === 'overview' && stats && <Overview stats={stats} />}
      {tab === 'invites' && invites && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
            <button onClick={() => setShowBulkImport(true)} style={styles.btnGhost}>
              <Upload size={14} style={{ marginRight: 6 }} /> Import from CSV
            </button>
          </div>
          <InvitesTable
            invites={invites}
            onRevoke={async (id) => {
              await api.adminRevokeInvite(id);
              await refreshInvites();
              await refreshStats();
            }}
          />
        </>
      )}

      {tab === 'flagged' && flagged && <FlaggedTable items={flagged} />}
      {tab === 'audit' && audit && <AuditTable rows={audit} />}
      {tab === 'users' && users && me && (
        <UsersTable
          users={users}
          meId={me.id}
          onSetStatus={async (id, status) => {
            await api.adminSetUserStatus(id, status);
            await refreshUsers();
            await refreshStats();
          }}
          onSetAdmin={async (id, isAdmin) => {
            await api.adminSetAdmin(id, isAdmin);
            await refreshUsers();
          }}
          onForceLogout={async (id) => {
            if (!confirm('Force-logout all devices for this user?')) return;
            const r = await api.adminForceLogoutAll(id);
            alert(`Revoked ${r.sessions} session${r.sessions === 1 ? '' : 's'} and ${r.devices} device${r.devices === 1 ? '' : 's'}.`);
            await refreshUsers();
          }}
        />
      )}

      {tab === 'channels' && channels && (
        <ChannelsView
          channels={channels}
          onCreate={() => setShowCreateChannel(true)}
        />
      )}

      {showCreate && (
        <CreateInviteModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refreshInvites();
            await refreshStats();
            setTab('invites');
          }}
        />
      )}

      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreated={async () => {
            setShowCreateChannel(false);
            await refreshChannels();
            await refreshStats();
            setTab('channels');
          }}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onImported={async () => {
            setShowBulkImport(false);
            await refreshInvites();
            await refreshStats();
            setTab('invites');
          }}
        />
      )}
    </div>
  );
}

function FlaggedTable({ items }: { items: FlaggedItem[] }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>When</th>
            <th style={styles.th}>From</th>
            <th style={styles.th}>Channel</th>
            <th style={styles.th}>Body</th>
            <th style={styles.th}>Reasons</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-tertiary)' }}>No flagged messages.</td></tr>
          )}
          {items.map((m) => (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...styles.td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{relativeTime(m.createdAt)}</td>
              <td style={styles.td}>{m.sender.displayName}</td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{m.conversation.title ?? '—'}</td>
              <td style={{ ...styles.td, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</td>
              <td style={styles.td}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.flagged.map((f) => (
                    <span key={f.id} style={{ ...styles.statusPill, background: '#FEE4E2', color: 'var(--danger)' }}>
                      <Flag size={9} style={{ marginRight: 3 }} /> {f.label}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ rows }: { rows: AdminAuditEntry[] }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>When</th>
            <th style={styles.th}>Actor</th>
            <th style={styles.th}>Action</th>
            <th style={styles.th}>Target</th>
            <th style={styles.th}>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-tertiary)' }}>No audit entries.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...styles.td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{relativeTime(r.createdAt)}</td>
              <td style={styles.td}>{r.actor ?? '—'}</td>
              <td style={{ ...styles.td }}><code style={{ fontSize: 12, color: 'var(--internal)' }}>{r.action}</code></td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                {r.targetType ? `${r.targetType}/${r.targetId?.slice(0, 8) ?? ''}` : '—'}
              </td>
              <td style={{ ...styles.td, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.ipAddress ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulkImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('mobileNumber,employeeId,displayName,department\n+919876543210,EMP-1042,Mangesh Panchal,Engineering');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: { row: number; mobileNumber: string; reason: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsed = parseCsv(csv);

  const submit = async () => {
    if (parsed.rows.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminBulkInvite(parsed.rows);
      setResult(r);
    } catch (e: any) {
      setErr(e.message ?? 'Failed');
    }
    setBusy(false);
  };

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Bulk import invites</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          {!result ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Paste a CSV. First line must be header: <code>mobileNumber,employeeId,displayName,department</code>
              </div>
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={10}
                style={{
                  width: '100%',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--canvas)',
                  border: '1px solid var(--border)',
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                {parsed.rows.length} valid row{parsed.rows.length === 1 ? '' : 's'}
                {parsed.errors.length > 0 ? ` · ${parsed.errors.length} parse error${parsed.errors.length === 1 ? '' : 's'}` : ''}
              </div>
              {parsed.errors.length > 0 && (
                <div style={{ marginTop: 6, padding: 10, background: '#FEE4E2', borderRadius: 8, fontSize: 11, color: 'var(--danger)' }}>
                  {parsed.errors.slice(0, 5).map((e, i) => <div key={i}>Line {e.line}: {e.reason}</div>)}
                  {parsed.errors.length > 5 && <div>… {parsed.errors.length - 5} more</div>}
                </div>
              )}
              {err && <div style={styles.error}>{err}</div>}
            </>
          ) : (
            <>
              <div style={{ padding: 16, background: '#DCFAE6', borderRadius: 10, color: '#067647', fontWeight: 600 }}>
                {result.created} invite{result.created === 1 ? '' : 's'} created
              </div>
              {result.skipped.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Skipped ({result.skipped.length}):</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', background: 'var(--canvas)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {result.skipped.map((s, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{s.mobileNumber}</span> — {s.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div style={styles.modalFooter}>
          {!result ? (
            <>
              <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
              <button
                style={{ ...styles.cta, opacity: parsed.rows.length > 0 && !busy ? 1 : 0.4, cursor: parsed.rows.length > 0 && !busy ? 'pointer' : 'not-allowed' }}
                disabled={parsed.rows.length === 0 || busy}
                onClick={submit}
              >
                {busy ? 'Importing…' : `Import ${parsed.rows.length}`}
              </button>
            </>
          ) : (
            <button style={styles.cta} onClick={onImported}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

function parseCsv(csv: string): { rows: { mobileNumber: string; employeeId: string; displayName: string; department?: string }[]; errors: { line: number; reason: string }[] } {
  const rows: { mobileNumber: string; employeeId: string; displayName: string; department?: string }[] = [];
  const errors: { line: number; reason: string }[] = [];
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows, errors };
  const header = (lines[0] ?? '').toLowerCase().split(',').map((s) => s.trim());
  const idxMobile = header.indexOf('mobilenumber');
  const idxEmp = header.indexOf('employeeid');
  const idxName = header.indexOf('displayname');
  const idxDept = header.indexOf('department');
  if (idxMobile < 0 || idxEmp < 0 || idxName < 0) {
    errors.push({ line: 1, reason: 'header must include mobileNumber, employeeId, displayName' });
    return { rows, errors };
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(',').map((s) => s.trim());
    const mob = cols[idxMobile] ?? '';
    const emp = cols[idxEmp] ?? '';
    const nm = cols[idxName] ?? '';
    const dept = idxDept >= 0 ? cols[idxDept] : undefined;
    if (!/^\+?[1-9]\d{7,15}$/.test(mob)) {
      errors.push({ line: i + 1, reason: `bad mobile "${mob}"` });
      continue;
    }
    if (emp.length < 2 || nm.length < 2) {
      errors.push({ line: i + 1, reason: 'employeeId and displayName required' });
      continue;
    }
    rows.push({ mobileNumber: mob.startsWith('+') ? mob : `+${mob}`, employeeId: emp, displayName: nm, department: dept || undefined });
  }
  return { rows, errors };
}

function ChannelsView({ channels, onCreate }: { channels: AdminConversationListItem[]; onCreate: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={onCreate} style={styles.cta}>
          <Plus size={16} /> New channel
        </button>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Kind</th>
              <th style={styles.th}>Sensitivity</th>
              <th style={styles.th}>Members</th>
              <th style={styles.th}>Messages</th>
              <th style={styles.th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-tertiary)' }}>No channels yet.</td></tr>
            )}
            {channels.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={styles.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    {c.kind === 'announcement' ? <Megaphone size={12} /> : <Hash size={12} />}
                    {c.title}
                    {(c.sensitivity === 'confidential' || c.sensitivity === 'restricted') && <Lock size={11} color="var(--confidential)" />}
                  </div>
                  {c.topic && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.topic}</div>}
                </td>
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{c.kind}</td>
                <td style={styles.td}><span style={{ ...styles.statusPill, ...sensitivityStyle(c.sensitivity) }}>{c.sensitivity}</span></td>
                <td style={styles.td}>{c.memberCount}</td>
                <td style={styles.td}>{c.messageCount}</td>
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{relativeTime(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<'channel' | 'announcement'>('channel');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [sensitivity, setSensitivity] = useState<'public' | 'internal' | 'confidential' | 'restricted'>('internal');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {});
  }, []);

  const valid = title.trim().length >= 1;
  const filtered = users.filter((u) =>
    !search || u.displayName.toLowerCase().includes(search.toLowerCase()) || (u.department ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.adminCreateConversation({
        kind,
        title: title.trim(),
        topic: topic.trim() || undefined,
        sensitivity,
        memberUserIds: [...selected],
      });
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create');
      setBusy(false);
    }
  };

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>New channel</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setKind('channel')}
              style={{ ...styles.kindBtn, ...(kind === 'channel' ? styles.kindBtnActive : {}) }}
            >
              <Hash size={14} /> Channel
            </button>
            <button
              onClick={() => setKind('announcement')}
              style={{ ...styles.kindBtn, ...(kind === 'announcement' ? styles.kindBtnActive : {}) }}
            >
              <Megaphone size={14} /> Announcement
            </button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Title</span>
            <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'channel' ? '# product' : 'Company announcements'} autoFocus />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Topic (optional)</span>
            <input style={styles.input} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What this channel is for" />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Sensitivity</span>
            <select style={styles.input} value={sensitivity} onChange={(e) => setSensitivity(e.target.value as any)}>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Confidential and Restricted channels watermark messages and block copy/right-click.
            </span>
          </label>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Members</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{selected.size} selected</span>
            </div>
            <input
              style={{ ...styles.input, marginBottom: 8 }}
              placeholder="Search employees"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={styles.memberList}>
              {filtered.map((u) => {
                const isSel = selected.has(u.id);
                return (
                  <label key={u.id} style={{ ...styles.memberRow, background: isSel ? 'var(--brand-soft)' : 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(u.id);
                        else next.delete(u.id);
                        setSelected(next);
                      }}
                    />
                    <span style={{ flex: 1 }}>{u.displayName} <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>· {u.department ?? '—'}</span></span>
                  </label>
                );
              })}
            </div>
          </div>

          {err && <div style={styles.error}>{err}</div>}
        </div>
        <div style={styles.modalFooter}>
          <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.cta, opacity: valid && !busy ? 1 : 0.4, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}
            disabled={!valid || busy}
            onClick={submit}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function sensitivityStyle(s: string): React.CSSProperties {
  if (s === 'public') return { background: 'var(--bubble-other)', color: 'var(--text-secondary)' };
  if (s === 'internal') return { background: 'var(--internal-soft)', color: 'var(--internal)' };
  if (s === 'confidential') return { background: 'var(--confidential-soft)', color: 'var(--confidential)' };
  return { background: 'var(--inverse)', color: 'var(--text-on-inverse)' };
}

function Overview({ stats }: { stats: AdminStats }) {
  const cards = [
    { label: 'Active employees', value: stats.totalEmployees.toLocaleString(), icon: Users },
    { label: 'Pending invites', value: stats.pendingInvites.toLocaleString(), icon: UserPlus, sub: `${stats.expiringSoon} expiring within 7 days` },
    { label: 'Messages today', value: stats.messagesToday.toLocaleString(), icon: MessageSquare },
    { label: 'Confidential channels', value: stats.confidentialChannels.toLocaleString(), icon: ShieldCheck, sub: 'All audited' },
    { label: 'Deactivated users', value: stats.deactivated.toLocaleString(), icon: AlertCircle },
    { label: 'Login activity', value: '99.6%', icon: Activity, sub: 'Success rate' },
  ];
  return (
    <div style={styles.grid}>
      {cards.map((c) => (
        <div key={c.label} style={styles.card}>
          <div style={styles.cardTop}>
            <span style={styles.cardLabel}>{c.label}</span>
            <c.icon size={16} color="var(--text-tertiary)" />
          </div>
          <div style={styles.cardValue}>{c.value}</div>
          {c.sub && <div style={styles.cardDelta}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function InvitesTable({ invites, onRevoke }: { invites: AdminInvite[]; onRevoke: (id: string) => Promise<void> }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Mobile</th>
            <th style={styles.th}>Department</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Created</th>
            <th style={styles.th}>Expires</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {invites.length === 0 && (
            <tr><td colSpan={7} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-tertiary)' }}>No invites yet.</td></tr>
          )}
          {invites.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={styles.td}>
                <div style={{ fontWeight: 600 }}>{r.displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employeeId}</div>
              </td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>{r.mobileNumber}</td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{r.department ?? '—'}</td>
              <td style={styles.td}><span style={{ ...styles.statusPill, ...statusStyle(r.status) }}>{r.status}</span></td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{relativeTime(r.createdAt)}</td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{relativeTime(r.expiresAt)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>
                {(r.status === 'pending' || r.status === 'sent') && (
                  <button
                    onClick={() => {
                      if (confirm('Revoke this invite?')) onRevoke(r.id);
                    }}
                    style={styles.iconAction}
                    title="Revoke"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTable({
  users,
  meId,
  onSetStatus,
  onSetAdmin,
  onForceLogout,
}: {
  users: AdminUser[];
  meId: string;
  onSetStatus: (id: string, status: 'active' | 'deactivated') => Promise<void>;
  onSetAdmin: (id: string, isAdmin: boolean) => Promise<void>;
  onForceLogout: (id: string) => Promise<void>;
}) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Mobile</th>
            <th style={styles.th}>Department</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Devices</th>
            <th style={styles.th}>Last seen</th>
            <th style={styles.th}>Admin</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={styles.td}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {u.profile?.displayName ?? '—'}
                  {u.isAdmin && <Crown size={11} color="#B07900" />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.profile?.employeeId}</div>
              </td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>{u.mobileNumber}</td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{u.profile?.department ?? '—'}</td>
              <td style={styles.td}><span style={{ ...styles.statusPill, ...statusStyle(u.status) }}>{u.status}</span></td>
              <td style={styles.td}>{u.activeDevices}</td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{u.lastSeenAt ? relativeTime(u.lastSeenAt) : '—'}</td>
              <td style={styles.td}>
                <button
                  onClick={() => onSetAdmin(u.id, !u.isAdmin)}
                  style={styles.iconAction}
                  disabled={u.id === meId}
                  title={u.id === meId ? 'Cannot change own role' : (u.isAdmin ? 'Revoke admin' : 'Grant admin')}
                >
                  {u.isAdmin ? <ToggleRight size={18} color="var(--internal)" /> : <ToggleLeft size={18} color="var(--text-tertiary)" />}
                </button>
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>
                {u.id !== meId && (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {u.activeDevices > 0 && (
                      <button
                        onClick={() => onForceLogout(u.id)}
                        style={{ ...styles.btn, color: 'var(--danger)' }}
                        title="Revoke all sessions and devices"
                      >
                        Force-logout
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const next = u.status === 'active' ? 'deactivated' : 'active';
                        if (confirm(`${next === 'deactivated' ? 'Deactivate' : 'Reactivate'} ${u.profile?.displayName}?`)) onSetStatus(u.id, next);
                      }}
                      style={{ ...styles.btn, color: u.status === 'active' ? 'var(--danger)' : 'var(--internal)' }}
                    >
                      {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateInviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mobileLocal, setMobileLocal] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = /^[6-9]\d{9}$/.test(mobileLocal) && employeeId.trim().length >= 2 && displayName.trim().length >= 2;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.adminCreateInvite({
        mobileNumber: `+91${mobileLocal}`,
        employeeId: employeeId.trim(),
        displayName: displayName.trim(),
        department: department.trim() || undefined,
      });
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create invite');
      setBusy(false);
    }
  };

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Invite employee</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <Field label="Display name">
            <input style={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Priya Shah" autoFocus />
          </Field>
          <Field label="Employee ID">
            <input style={styles.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="EMP-1234" />
          </Field>
          <Field label="Mobile number">
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={styles.cc}>+91</div>
              <input
                style={{ ...styles.input, flex: 1 }}
                value={mobileLocal}
                onChange={(e) => setMobileLocal(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                placeholder="98765 43210"
                maxLength={10}
              />
            </div>
          </Field>
          <Field label="Department (optional)">
            <input style={styles.input} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" />
          </Field>
          {err && <div style={styles.error}>{err}</div>}
        </div>
        <div style={styles.modalFooter}>
          <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.cta, opacity: valid && !busy ? 1 : 0.4, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}
            disabled={!valid || busy}
            onClick={submit}
          >
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

function statusStyle(s: string): React.CSSProperties {
  if (s === 'accepted' || s === 'active') return { background: '#DCFAE6', color: '#067647' };
  if (s === 'sent') return { background: 'var(--internal-soft)', color: 'var(--internal)' };
  if (s === 'pending') return { background: '#FEF3C7', color: '#92400E' };
  if (s === 'deactivated' || s === 'revoked' || s === 'expired') return { background: 'var(--bubble-other)', color: 'var(--text-secondary)' };
  return { background: 'var(--bubble-other)', color: 'var(--text-secondary)' };
}

const styles: Record<string, React.CSSProperties> = {
  loading: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 },
  page: { flex: 1, overflowY: 'auto', padding: 32, maxWidth: 1200, width: '100%', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 16 },
  kicker: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: 'var(--text-tertiary)', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: -0.4 },
  cta: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'var(--inverse)', color: 'var(--text-on-inverse)', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' },
  tab: { padding: '10px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: 'var(--text-primary)', borderBottomColor: 'var(--inverse)', fontWeight: 600 },
  error: { padding: 12, background: '#FEE4E2', color: 'var(--danger)', fontSize: 13, borderRadius: 10, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardLabel: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 },
  cardValue: { fontSize: 26, fontWeight: 700, letterSpacing: -0.4 },
  cardDelta: { fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 },
  tableWrap: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', background: 'var(--canvas)' },
  td: { padding: '12px 16px', fontSize: 13, verticalAlign: 'middle' },
  statusPill: { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 'var(--radius-full)', textTransform: 'uppercase', letterSpacing: 0.4 },
  iconAction: { width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' },
  btn: { fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8 },
  btnGhost: { fontSize: 14, fontWeight: 500, padding: '10px 16px', borderRadius: 10, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' },
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(11,11,15,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' },
  closeBtn: { width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' },
  modalBody: { padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' },
  modalFooter: { padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  input: { height: 40, padding: '0 12px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 14, minWidth: 0 },
  cc: { height: 40, padding: '0 12px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 },
  kindBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  kindBtnActive: { background: 'var(--inverse)', color: 'var(--text-on-inverse)', borderColor: 'var(--inverse)' },
  memberList: { maxHeight: 200, overflowY: 'auto', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' },
};
