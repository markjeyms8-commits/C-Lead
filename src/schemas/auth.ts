import { z } from 'zod';
export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/),
  password: z.string().min(1).max(128),
});
export const passwordSchema = z.string().min(12).max(128);
