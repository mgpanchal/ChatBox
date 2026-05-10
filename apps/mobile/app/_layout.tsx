import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { tokens } from '../src/theme';
import { hydrateConversationCache } from '../src/conversation-cache';
import { hydrateMeStore, meStore } from '../src/me-store';
import { conversationListStore, directoryStore, teamsStore } from '../src/list-cache';
import { useAppState } from '../src/use-app-state';
import { session } from '../src/session';
import { getSocket, disconnectSocket } from '../src/socket';
import { useNetwork } from '../src/use-network';
import { sendQueue } from '../src/send-queue';

export default function RootLayout() {
  useEffect(() => {
    // Warm all in-memory caches from AsyncStorage on app boot. Non-blocking.
    hydrateMeStore().catch(() => {});
    hydrateConversationCache().catch(() => {});
    conversationListStore.hydration().catch(() => {});
    directoryStore.hydration().catch(() => {});
    teamsStore.hydration().catch(() => {});
    sendQueue.hydrate().then(() => sendQueue.flush()).catch(() => {});
  }, []);

  // Foreground / background lifecycle.
  useAppState((next, prev) => {
    if (!session.isSignedIn()) return;
    if (next === 'active' && prev !== 'active') {
      // Came back to foreground — refresh quietly, reconnect socket.
      meStore.refresh().catch(() => {});
      conversationListStore.refresh().catch(() => {});
      try { getSocket(); } catch {} // ensures connection
    } else if (next === 'background' || next === 'inactive') {
      // Going away — disconnect socket so server marks user offline.
      disconnectSocket();
    }
  });

  // Reconnect socket when network comes back.
  useNetwork();

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.color.canvas },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}
