import Constants from 'expo-constants';
import { session } from './session';

/**
 * Resolve the API base URL.
 *
 * Order of precedence:
 * 1. `EXPO_PUBLIC_API_URL` env (set in `.env` at apps/mobile root or via EAS).
 * 2. Auto-detect from the Expo bundler's host (e.g. dev machine on Wi-Fi).
 *    The bundler runs at `<lan-ip>:8081`; the API runs at `<lan-ip>:4000`.
 * 3. Fallback to localhost (only useful in iOS simulator on the same Mac).
 */
function resolveBase(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit && explicit.length > 0) return explicit;

  // expoConfig.hostUri is "192.168.1.4:8081" on Expo Go via LAN.
  const hostUri = (Constants.expoConfig as any)?.hostUri ?? Constants.linkingUri ?? '';
  const host = String(hostUri).split(':')[0];
  if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return `http://${host}:4000/v1`;
  }
  return 'http://localhost:4000/v1';
}

export const API_BASE = resolveBase();

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const access = session.getAccess();
  if (access && !headers.Authorization) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? safeParse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`, body);
  }
  return body as T;
}

function safeParse(t: string): any {
  try { return JSON.parse(t); } catch { return null; }
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

export type PhotoUrls = { thumb?: string; sm?: string; md?: string; lg?: string } | null;

export type ConversationListItem = {
  id: string;
  kind: 'channel' | 'announcement' | 'direct';
  title: string | null;
  topic: string | null;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pinned: boolean;
  muted?: boolean;
  mutedUntil?: string | null;
  unread: number;
  updatedAt: string;
  otherUserId?: string | null;
  otherOnline?: boolean;
  otherPhotoUrls?: PhotoUrls;
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
  kind: 'channel' | 'announcement' | 'direct';
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
    photoUrls?: PhotoUrls;
  }[];
};

export type Receipt = {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type Reaction = { userId: string; emoji: string };
export type Mention = { userId: string };

export type AttachmentItem = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  previewUrl: string | null;
  thumbUrl: string | null;
  width?: number | null;
  height?: number | null;
};

export type MessageItem = {
  id: string;
  body: string | null;
  deleted: boolean;
  sender: { id: string; displayName: string; employeeId: string | null; photoUrls?: PhotoUrls };
  self: boolean;
  replyToMessageId: string | null;
  replyToPreview: { senderName: string; body: string | null; deleted: boolean } | null;
  editedAt: string | null;
  createdAt: string;
  reactions: Reaction[];
  receipts: Receipt[];
  mentions: Mention[];
  attachments: AttachmentItem[];
  visibility: 'everyone' | 'restricted';
  audienceTeams: { slug: string; name: string }[];
  redacted?: boolean;
};

export type DirectoryUser = {
  id: string;
  displayName: string;
  employeeId: string;
  department: string | null;
  title: string | null;
  online: boolean;
  lastSeenAt: string | null;
  photoUrls?: PhotoUrls;
};

export type Team = {
  slug: string;
  name: string;
  memberCount: number;
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
  photoUrls?: PhotoUrls;
};

export type DeviceItem = {
  id: string;
  platform: string;
  name: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type MentionItem = {
  id: string;
  acknowledgedAt: string | null;
  createdAt: string;
  conversation: { id: string; title: string | null; kind: string; sensitivity: string };
  message: {
    id: string; body: string | null; deleted: boolean;
    senderName: string;
    senderPhotoUrls?: PhotoUrls;
    createdAt: string;
  };
};

export type SearchResult = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string; photoUrls?: PhotoUrls };
  conversation: { id: string; title: string | null; kind: string; sensitivity: string };
};

export type UploadResponse = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  previewUrl: string | null;
  thumbUrl: string | null;
  width?: number | null;
  height?: number | null;
};

export const api = {
  requestOtp: (mobileNumber: string) =>
    request<OtpRequestResponse>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber }),
    }),

  verifyOtp: (mobileNumber: string, code: string, device: { platform: string; name: string }) =>
    request<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, code, device }),
    }),

  refresh: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken: string) =>
    request<{ ok: true }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  me: () => request<Me>('/me'),

  listConversations: () => request<ConversationListItem[]>('/conversations'),

  muteConversation: (id: string, mutedUntil: string | null) =>
    request<{ ok: true; mutedUntil: string | null }>(`/conversations/${id}/mute`, {
      method: 'POST',
      body: JSON.stringify({ mutedUntil }),
    }),

  getConversation: (id: string) => request<ConversationDetail>(`/conversations/${id}`),

  listMessages: (id: string, opts?: { before?: string; around?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set('before', opts.before);
    if (opts?.around) params.set('around', opts.around);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return request<{ messages: MessageItem[]; hasMore: boolean }>(
      `/conversations/${id}/messages${qs ? `?${qs}` : ''}`,
    );
  },

  sendMessage: (id: string, body: string, replyToMessageId?: string, attachmentIds?: string[]) =>
    request<MessageItem>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, replyToMessageId, attachmentIds }),
    }),

  editMessage: (cid: string, mid: string, body: string) =>
    request<{ ok: true; body: string; editedAt: string }>(`/conversations/${cid}/messages/${mid}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),

  deleteMessage: (cid: string, mid: string) =>
    request<{ ok: true }>(`/conversations/${cid}/messages/${mid}`, { method: 'DELETE' }),

  toggleReaction: (cid: string, mid: string, emoji: string) =>
    request<{ action: 'added' | 'removed' }>(`/conversations/${cid}/messages/${mid}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  myDevices: () => request<DeviceItem[]>('/me/devices'),

  listUsers: () => request<DirectoryUser[]>('/users'),
  listTeams: () => request<Team[]>('/teams'),

  createDirect: (otherUserId: string) =>
    request<{ id: string; kind: string }>('/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    }),

  listConversationMembers: (cid: string) =>
    request<ConversationMember[]>(`/conversations/${cid}/members`),

  leaveConversation: (cid: string) =>
    request<{ ok: true }>(`/conversations/${cid}/leave`, { method: 'POST' }),

  myMentions: () => request<MentionItem[]>('/me/mentions'),
  ackMention: (id: string) => request<{ ok: true }>(`/me/mentions/${id}/ack`, { method: 'POST' }),
  ackAllMentions: () => request<{ ok: true }>('/me/mentions/ack-all', { method: 'POST' }),

  searchInConversation: (cid: string, q: string, opts?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.before) params.set('before', opts.before);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return request<{ results: SearchResult[]; nextCursor: string | null }>(
      `/conversations/${cid}/search?${params.toString()}`,
    );
  },
  globalSearch: (q: string, opts?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.before) params.set('before', opts.before);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return request<{ results: SearchResult[]; nextCursor: string | null }>(
      `/search?${params.toString()}`,
    );
  },

  uploadFile: async (file: { uri: string; name: string; type: string }) => {
    const access = session.getAccess();
    const fd = new FormData();
    // RN file upload via FormData uses { uri, name, type }
    fd.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      body: fd,
    });
    const text = await res.text();
    const body = text ? safeParse(text) : null;
    if (!res.ok) throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`, body);
    return body as UploadResponse;
  },

  uploadProfilePhoto: async (file: { uri: string; name: string; type: string }) => {
    const access = session.getAccess();
    const fd = new FormData();
    fd.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    const res = await fetch(`${API_BASE}/me/photo`, {
      method: 'POST',
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      body: fd,
    });
    const text = await res.text();
    const body = text ? safeParse(text) : null;
    if (!res.ok) throw new ApiError(res.status, body?.message ?? `HTTP ${res.status}`, body);
    return body as { ok: true; photoUrls: PhotoUrls };
  },

  removeProfilePhoto: () => request<{ ok: true }>('/me/photo', { method: 'DELETE' }),
};
