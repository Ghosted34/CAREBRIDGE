import { z } from 'zod';

export const RequestUploadUrlBody = z.object({
  document_type: z.enum(['photo', 'xray', 'report', 'referral', 'other']),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(3).max(100),
  file_size_bytes: z.number().int().positive().max(25_000_000), // 25 MB max
});
export type RequestUploadUrlBody = z.infer<typeof RequestUploadUrlBody>;

export const ConfirmUploadBody = z.object({
  storage_key: z.string().min(1).max(500),
  document_type: z.enum(['photo', 'xray', 'report', 'referral', 'other']),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(3).max(100),
  file_size_bytes: z.number().int().positive().max(25_000_000),
});
export type ConfirmUploadBody = z.infer<typeof ConfirmUploadBody>;
