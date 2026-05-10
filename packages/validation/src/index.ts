import { z } from 'zod';

export const mobileNumberSchema = z
  .string()
  .trim()
  .min(8)
  .max(16)
  .regex(/^\+?[1-9]\d{7,15}$/);

export const inviteUserSchema = z.object({
  displayName: z.string().trim().min(2),
  employeeId: z.string().trim().min(2),
  mobileNumber: mobileNumberSchema,
  department: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
