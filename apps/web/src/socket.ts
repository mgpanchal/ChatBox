'use client';

import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(/\/v1\/?$/, '');

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') throw new Error('socket on server');
  if (_socket && _socket.connected) return _socket;
  if (_socket) return _socket;

  _socket = io(BASE, {
    auth: (cb) => cb({ token: localStorage.getItem('chatbox.access') ?? '' }),
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

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const s = getSocket();
    ref.current = s;
    setConnected(s.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: ref.current, connected };
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
