import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  private sockets = new Map<string, Set<string>>();
  private conversationsByUser = new Map<string, Set<string>>();

  online(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    const wasOffline = !set;
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socketId);
    return wasOffline;
  }

  offline(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      this.conversationsByUser.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }

  setConversations(userId: string, conversationIds: string[]) {
    this.conversationsByUser.set(userId, new Set(conversationIds));
  }

  getConversations(userId: string): string[] {
    return [...(this.conversationsByUser.get(userId) ?? [])];
  }
}
