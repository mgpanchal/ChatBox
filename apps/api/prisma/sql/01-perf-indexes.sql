-- Full-text search on message bodies (GIN over tsvector)
CREATE INDEX IF NOT EXISTS idx_msg_body_fts
  ON "Message" USING GIN (to_tsvector('english', body));

-- Hot path: chat scroll (only undeleted messages)
CREATE INDEX IF NOT EXISTS idx_msg_conv_active
  ON "Message" ("conversationId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

-- Activity feed: a user's mentions newest-first
CREATE INDEX IF NOT EXISTS idx_mention_user_created
  ON "MessageMention" ("userId", "createdAt" DESC);

-- Unread receipts hot path
CREATE INDEX IF NOT EXISTS idx_receipt_unread
  ON "MessageReceipt" ("userId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

-- Conversation last-activity sort (for sidebar ordering)
CREATE INDEX IF NOT EXISTS idx_member_user
  ON "ConversationMember" ("userId", "lastReadAt");

-- Audit log queries by user + time
CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON "AuditLog" ("userId", "createdAt" DESC);
