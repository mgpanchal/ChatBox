import { z } from 'zod';
import { mobileNumberSchema } from '@chatbox/validation';

export const otpRequestSchema = z.object({
  mobileNumber: mobileNumberSchema,
});
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  mobileNumber: mobileNumberSchema,
  code: z.string().regex(/^\d{4,8}$/),
  device: z.object({
    platform: z.enum(['ios', 'android', 'web']),
    name: z.string().min(1).max(120).optional(),
    pushToken: z.string().max(255).optional(),
  }),
});
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(8),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(8),
});
export type LogoutDto = z.infer<typeof logoutSchema>;
