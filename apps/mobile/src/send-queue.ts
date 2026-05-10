import { api, type MessageItem } from './api';
import { storageGet, storagePut } from './storage';
import { isOnline } from './use-network';

const KEY = 'send-queue';

type QueuedSend = {
  tempId: string;
  conversationId: string;
  body: string;
  replyToMessageId?: string;
  attachmentIds?: string[];
  createdAt: string;
  attempts: number;
};

type Listener = (cid: string, real: MessageItem, tempId: string) => void;

let queue: QueuedSend[] = [];
let inflight = false;
let hydrated = false;
const listeners = new Set<Listener>();

async function persist() {
  await storagePut(KEY, queue);
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  const stored = await storageGet<QueuedSend[]>(KEY);
  if (Array.isArray(stored)) queue = stored;
  hydrated = true;
}

export const sendQueue = {
  hydrate,
  hasPending: () => queue.length > 0,
  pendingFor: (cid: string) => queue.filter((q) => q.conversationId === cid),
  enqueue: async (item: Omit<QueuedSend, 'attempts'>) => {
    queue.push({ ...item, attempts: 0 });
    await persist();
    if (isOnline()) sendQueue.flush();
  },
  drop: async (tempId: string) => {
    queue = queue.filter((q) => q.tempId !== tempId);
    await persist();
  },
  flush: async () => {
    if (inflight || queue.length === 0 || !isOnline()) return;
    inflight = true;
    try {
      while (queue.length > 0 && isOnline()) {
        const item = queue[0]!;
        try {
          const real = await api.sendMessage(item.conversationId, item.body, item.replyToMessageId, item.attachmentIds);
          for (const l of listeners) l(item.conversationId, real, item.tempId);
          queue.shift();
          await persist();
        } catch (e: any) {
          item.attempts += 1;
          if (item.attempts >= 5) {
            // Give up after 5 retries; user can re-send manually.
            queue.shift();
            await persist();
          } else {
            await persist();
            break; // retry later (e.g. on next reconnect)
          }
        }
      }
    } finally {
      inflight = false;
    }
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
