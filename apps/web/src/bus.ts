type BusMessage =
  | { type: 'me-updated' }
  | { type: 'me-cleared' }
  | { type: 'conversation-updated'; id: string }
  | { type: 'conversation-list-updated' }
  | { type: 'directory-updated' };

type Listener = (msg: BusMessage) => void;

const channelName = 'chatbox-bus';
let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(channelName);
  channel.onmessage = (e: MessageEvent<BusMessage>) => {
    for (const l of listeners) {
      try { l(e.data); } catch {}
    }
  };
}

export const bus = {
  publish: (msg: BusMessage) => {
    ensureChannel();
    channel?.postMessage(msg);
  },
  subscribe: (l: Listener) => {
    ensureChannel();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
