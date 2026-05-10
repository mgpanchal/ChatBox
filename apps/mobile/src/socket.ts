import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';
import { session } from './session';

// API_BASE is `http://<host>:4000/v1` — strip the trailing /v1 for socket.
const SOCKET_BASE = API_BASE.replace(/\/v1\/?$/, '');

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (_socket) return _socket;
  _socket = io(SOCKET_BASE, {
    auth: (cb) => cb({ token: session.getAccess() ?? '' }),
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

export type ReceiptEvent = {
  messageId: string;
  conversationId: string;
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type PresenceEvent = {
  userId: string;
  online: boolean;
  lastSeenAt?: string;
};

export type TypingEvent = {
  conversationId: string;
  userId: string;
  typing: boolean;
};
