import { z } from 'zod';
export function safeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      /^https?:\/\//.test(value) &&
      !/[\s<>"\\]/.test(value) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
export const richBlockSchema = z
  .object({
    type: z.enum(['paragraph', 'bullet', 'number']),
    text: z.string().min(1).max(2000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    url: z.string().max(2000).url().refine(safeHttpUrl).optional(),
  })
  .strict();
export const richTextSchema = z
  .array(richBlockSchema)
  .min(1)
  .max(50)
  .refine((blocks) => blocks.reduce((n, b) => n + b.text.length, 0) <= 20000);
export type RichBlock = z.infer<typeof richBlockSchema>;
export const postSchema = z.object({
  title: z.string().trim().min(1).max(160),
  semester_id: z.uuid(),
  body: richTextSchema,
});
export const commentSchema = z.string().trim().min(1).max(3000);
export const moderationReason = z.string().trim().min(3).max(500);
export function safeLink(value?: string) {
  if (!value) return undefined;
  const result = richBlockSchema.safeParse({
    type: 'paragraph',
    text: 'link',
    url: value,
  });
  return result.success ? value : undefined;
}
