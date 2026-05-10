import { z } from 'zod';
import { mobileNumberSchema } from '@chatbox/validation';

export const createInviteSchema = z.object({
  mobileNumber: mobileNumberSchema,
  employeeId: z.string().trim().min(2).max(32),
  displayName: z.string().trim().min(2).max(120),
  department: z.string().trim().max(80).optional(),
});
export type CreateInviteDto = z.infer<typeof createInviteSchema>;

export const setStatusSchema = z.object({
  status: z.enum(['active', 'deactivated']),
});
export type SetStatusDto = z.infer<typeof setStatusSchema>;

export const setAdminSchema = z.object({
  isAdmin: z.boolean(),
});
export type SetAdminDto = z.infer<typeof setAdminSchema>;

export const createConversationSchema = z.object({
  kind: z.enum(['channel', 'announcement']),
  title: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(240).optional(),
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']).default('internal'),
  pinned: z.boolean().optional(),
  memberUserIds: z.array(z.string().uuid()).max(500),
});
export type CreateConversationDto = z.infer<typeof createConversationSchema>;

export const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AddMembersDto = z.infer<typeof addMembersSchema>;

export const bulkInviteSchema = z.object({
  rows: z.array(z.object({
    mobileNumber: mobileNumberSchema,
    employeeId: z.string().trim().min(2).max(32),
    displayName: z.string().trim().min(2).max(120),
    department: z.string().trim().max(80).optional(),
  })).min(1).max(5000),
});
export type BulkInviteDto = z.infer<typeof bulkInviteSchema>;
