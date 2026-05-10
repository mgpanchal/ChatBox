import { useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { session } from './session';
import { getSocket } from './socket';
import { conversationListStore } from './list-cache';
import { meStore } from './me-store';
import { sendQueue } from './send-queue';

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

NetInfo.addEventListener((state: NetInfoState) => {
  const next = !!state.isConnected && state.isInternetReachable !== false;
  if (next === online) return;
  online = next;
  for (const l of listeners) l(online);

  // Auto-reconnect on resume.
  if (online && session.isSignedIn()) {
    try { getSocket(); } catch {}
    meStore.refresh().catch(() => {});
    conversationListStore.refresh().catch(() => {});
    sendQueue.flush();
  }
});

export function useNetwork() {
  useEffect(() => {
    NetInfo.fetch().then((s) => {
      online = !!s.isConnected && s.isInternetReachable !== false;
    });
  }, []);
}

export function isOnline(): boolean { return online; }
export function subscribeNetwork(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
