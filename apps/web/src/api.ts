const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`, body);
  }
  return body as T;
}

export type OtpRequestResponse = {
  ok: true;
  expiresAt: string;
  devCode?: string;
};

export type OtpVerifyResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    mobileNumber: string;
    status: string;
    profile: { displayName: string; employeeId: string; department: string | null } | null;
  };
  device: { id: string; platform: string; name: string | null };
};

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem('chatbox.access');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export type Me = {
  id: string;
  mobileNumber: string;
  status: string;
  isAdmin: boolean;
  profile: {
    employeeId: string;
    displayName: string;
    department: string | null;
    title: string | null;
    photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null;
  } | null;
};

export type DirectoryUser = {
  id: string;
  displayName: string;
  employeeId: string;
  department: string | null;
  title: string | null;
  online: boolean;
  lastSeenAt: string | null;
  photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null;
};

export type DeviceItem = {
  id: string;
  platform: string;
  name: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type AdminStats = {
  totalEmployees: number;
  pendingInvites: number;
  expiringSoon: number;
  messagesToday: number;
  confidentialChannels: number;
  deactivated: number;
};

export type AdminInvite = {
  id: string;
  mobileNumber: string;
  employeeId: string;
  displayName: string;
  department: string | null;
  status: 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type AdminUser = {
  id: string;
  mobileNumber: string;
  status: 'invited' | 'active' | 'deactivated';
  isAdmin: boolean;
  lastSeenAt: string | null;
  activeDevices: number;
  profile: {
    employeeId: string;
    displayName: string;
    department: string | null;
    title: string | null;
  } | null;
};

export type AdminAuditEntry = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: any;
  ipAddress: string | null;
  createdAt: string;
  actor: string | null;
  actorEmployeeId: string | null;
};

export type ConversationListItem = {
  id: string;
  kind: 'direct' | 'channel' | 'announcement';
  title: string | null;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pinned: boolean;
  muted?: boolean;
  mutedUntil?: string | null;
  unread: number;
  updatedAt: string;
  otherUserId: string | null;
  otherOnline: boolean | null;
  otherPhotoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderName: string;
    self: boolean;
  } | null;
};

export type ConversationDetail = {
  id: string;
  kind: 'direct' | 'channel' | 'announcement';
  title: string | null;
  topic: string | null;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pinned: boolean;
  members: {
    userId: string;
    displayName: string;
    employeeId: string | null;
    isAdmin: boolean;
    online: boolean;
    lastSeenAt: string | null;
    photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null;
  }[];
};

export type Receipt = {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type ReplyPreview = {
  senderName: string;
  body: string | null;
  deleted: boolean;
};

export type AttachmentItem = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  previewUrl: string | null;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
};

export type UploadResponse = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  previewUrl?: string | null;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

export type MessageItem = {
  id: string;
  body: string | null;
  deleted: boolean;
  sender: { id: string; displayName: string; employeeId: string | null; photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null };
  self: boolean;
  replyToMessageId: string | null;
  replyToPreview: ReplyPreview | null;
  editedAt: string | null;
  createdAt: string;
  reactions: { emoji: string; userId: string }[];
  receipts: Receipt[];
  mentions: { userId: string }[];
  attachments: AttachmentItem[];
  visibility: 'everyone' | 'restricted';
  audienceTeams: { slug: string; name: string }[];
  redacted: boolean;
};

export type Team = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  iAmMember: boolean;
};

export type MentionItem = {
  id: string;
  acknowledgedAt: string | null;
  createdAt: string;
  conversation: { id: string; title: string | null; kind: string; sensitivity: string };
  message: { id: string; body: string | null; deleted: boolean; senderName: string; senderPhotoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null; createdAt: string };
};

export type AdminConversationListItem = {
  id: string;
  kind: 'channel' | 'announcement';
  title: string | null;
  topic: string | null;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pinned: boolean;
  memberCount: number;
  messageCount: number;
  createdAt: string;
};

export type SearchResult = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string; photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null };
  conversation: { id: string; title: string | null; kind: string; sensitivity: string };
};

export type ConversationMember = {
  userId: string;
  displayName: string;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  isAdmin: boolean;
  online: boolean;
  lastSeenAt: string | null;
  joinedAt: string;
  photoUrls?: { thumb?: string; sm?: string; md?: string; lg?: string } | null;
};

export const api = {
  requestOtp: (mobileNumber: string) =>
    request<OtpRequestResponse>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber }),
    }),
  verifyOtp: (input: { mobileNumber: string; code: string; platform: 'web' | 'ios' | 'android'; name?: string }) =>
    request<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        mobileNumber: input.mobileNumber,
        code: input.code,
        device: { platform: input.platform, name: input.name },
      }),
    }),
  me: () => request<Me>('/me', { headers: authHeaders() }),
  myDevices: () => request<DeviceItem[]>('/me/devices', { headers: authHeaders() }),
  listUsers: () => request<DirectoryUser[]>('/users', { headers: authHeaders() }),
  listTeams: () => request<Team[]>('/teams', { headers: authHeaders() }),
  listConversations: () => request<ConversationListItem[]>('/conversations', { headers: authHeaders() }),
  muteConversation: (id: string, mutedUntil: string | null) =>
    request<{ ok: true; mutedUntil: string | null }>(`/conversations/${id}/mute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ mutedUntil }),
    }),
  getConversation: (id: string) => request<ConversationDetail>(`/conversations/${id}`, { headers: authHeaders() }),
  listMessages: (id: string, opts?: { before?: string; around?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set('before', opts.before);
    if (opts?.around) params.set('around', opts.around);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const path = `/conversations/${id}/messages${qs ? `?${qs}` : ''}`;
    return request<{ messages: MessageItem[]; hasMore: boolean }>(path, { headers: authHeaders() }).then((r) => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chatbox:unread-change'));
      return r;
    });
  },
  sendMessage: (id: string, body: string, replyToMessageId?: string, attachmentIds?: string[]) =>
    request<MessageItem>(`/conversations/${id}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ body, replyToMessageId, attachmentIds }),
    }),
  uploadFile: async (file: File): Promise<UploadResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';
    const t = typeof window !== 'undefined' ? localStorage.getItem('chatbox.access') : null;
    const res = await fetch(`${BASE}/uploads`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`, body);
    return body as UploadResponse;
  },
  createDirect: (otherUserId: string) =>
    request<{ id: string; kind: string }>('/conversations/direct', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ otherUserId }),
    }),
  toggleReaction: (cid: string, mid: string, emoji: string) =>
    request<{ ok: true; action: 'added' | 'removed' }>(`/conversations/${cid}/messages/${mid}/reactions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ emoji }),
    }),
  editMessage: (cid: string, mid: string, body: string) =>
    request<{ ok: true; body: string; editedAt: string }>(`/conversations/${cid}/messages/${mid}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ body }),
    }),
  deleteMessage: (cid: string, mid: string) =>
    request<{ ok: true }>(`/conversations/${cid}/messages/${mid}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }),

  // admin
  adminStats: () => request<AdminStats>('/admin/stats', { headers: authHeaders() }),
  adminInvites: () => request<AdminInvite[]>('/admin/invites', { headers: authHeaders() }),
  adminCreateInvite: (data: { mobileNumber: string; employeeId: string; displayName: string; department?: string }) =>
    request<AdminInvite>('/admin/invites', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }),
  adminRevokeInvite: (id: string) =>
    request<{ ok: true }>(`/admin/invites/${id}/revoke`, { method: 'POST', headers: authHeaders() }),
  adminUsers: () => request<AdminUser[]>('/admin/users', { headers: authHeaders() }),
  adminSetUserStatus: (id: string, status: 'active' | 'deactivated') =>
    request<{ ok: true }>(`/admin/users/${id}/status`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ status }) }),
  adminSetAdmin: (id: string, isAdmin: boolean) =>
    request<{ ok: true }>(`/admin/users/${id}/admin`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ isAdmin }) }),
  adminForceLogoutAll: (id: string) =>
    request<{ ok: true; sessions: number; devices: number }>(`/admin/users/${id}/force-logout`, { method: 'POST', headers: authHeaders() }),
  adminAudit: (limit = 100) => request<AdminAuditEntry[]>(`/admin/audit?limit=${limit}`, { headers: authHeaders() }),
  adminBulkInvite: (rows: { mobileNumber: string; employeeId: string; displayName: string; department?: string }[]) =>
    request<{ created: number; skipped: { row: number; mobileNumber: string; reason: string }[] }>('/admin/invites/bulk', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ rows }),
    }),
  adminFlagged: () =>
    request<Array<{
      id: string;
      body: string;
      createdAt: string;
      flagged: { id: string; label: string }[];
      sender: { id: string; displayName: string };
      conversation: { id: string; title: string | null; kind: string; sensitivity: string };
    }>>('/admin/flagged', { headers: authHeaders() }),
  adminListConversations: () => request<AdminConversationListItem[]>('/admin/conversations', { headers: authHeaders() }),
  adminCreateConversation: (data: {
    kind: 'channel' | 'announcement';
    title: string;
    topic?: string;
    sensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
    pinned?: boolean;
    memberUserIds: string[];
  }) =>
    request<{ id: string; kind: string; title: string | null }>('/admin/conversations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    }),

  // mentions
  myMentions: () => request<MentionItem[]>('/me/mentions', { headers: authHeaders() }),
  ackMention: (id: string) => request<{ ok: true }>(`/me/mentions/${id}/ack`, { method: 'POST', headers: authHeaders() }),
  ackAllMentions: () => request<{ ok: true }>('/me/mentions/ack-all', { method: 'POST', headers: authHeaders() }),

  uploadProfilePhoto: async (file: File): Promise<{ ok: true; photoUrls: { thumb: string; sm: string; md: string; lg: string } }> => {
    const fd = new FormData();
    fd.append('file', file);
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';
    const t = typeof window !== 'undefined' ? localStorage.getItem('chatbox.access') : null;
    const res = await fetch(`${BASE}/me/photo`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`, body);
    return body;
  },
  removeProfilePhoto: () => request<{ ok: true }>('/me/photo', { method: 'DELETE', headers: authHeaders() }),

  // search & members
  searchInConversation: (cid: string, q: string, opts?: { before?: string; limit?: number }) =>
    request<{ results: SearchResult[]; nextCursor: string | null }>(
      `/conversations/${cid}/search?q=${encodeURIComponent(q)}${opts?.before ? `&before=${encodeURIComponent(opts.before)}` : ''}${opts?.limit ? `&limit=${opts.limit}` : ''}`,
      { headers: authHeaders() },
    ),
  globalSearch: (q: string, opts?: { before?: string; limit?: number }) =>
    request<{ results: SearchResult[]; nextCursor: string | null }>(
      `/search?q=${encodeURIComponent(q)}${opts?.before ? `&before=${encodeURIComponent(opts.before)}` : ''}${opts?.limit ? `&limit=${opts.limit}` : ''}`,
      { headers: authHeaders() },
    ),
  listConversationMembers: (cid: string) =>
    request<ConversationMember[]>(`/conversations/${cid}/members`, { headers: authHeaders() }),
  leaveConversation: (cid: string) =>
    request<{ ok: true }>(`/conversations/${cid}/leave`, { method: 'POST', headers: authHeaders() }),
  adminAddMembers: (cid: string, userIds: string[]) =>
    request<{ added: number }>(`/admin/conversations/${cid}/members`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userIds }),
    }),
  adminRemoveMember: (cid: string, userId: string) =>
    request<{ ok: true }>(`/admin/conversations/${cid}/members/${userId}/remove`, { method: 'POST', headers: authHeaders() }),
};

export const session = {
  save(r: OtpVerifyResponse) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('chatbox.access', r.accessToken);
    localStorage.setItem('chatbox.refresh', r.refreshToken);
    localStorage.setItem('chatbox.user', JSON.stringify(r.user));
  },
  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('chatbox.access');
    localStorage.removeItem('chatbox.refresh');
    localStorage.removeItem('chatbox.user');
  },
  user() {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('chatbox.user');
    return raw ? JSON.parse(raw) : null;
  },
};
