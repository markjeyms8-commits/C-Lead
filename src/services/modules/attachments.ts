import { backendEnv } from '@/config/env';
import { requireClient } from '@/services/supabase/client';
export interface Attachment {
  id: string;
  post_id: string | null;
  task_id: string | null;
  uploader_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  state: 'pending' | 'ready' | 'deleting' | 'deleted';
  created_at: string;
}
export async function attachments(
  postId: string,
  parentType: 'post' | 'task' = 'post',
): Promise<Attachment[]> {
  const r = await requireClient()
    .from('post_attachments')
    .select(
      'id,post_id,task_id,uploader_id,filename,mime_type,byte_size,state,created_at',
    )
    .eq(parentType === 'task' ? 'task_id' : 'post_id', postId)
    .neq('state', 'deleted')
    .order('created_at');
  if (r.error) throw r.error;
  return r.data as Attachment[];
}
export async function uploadAttachment(
  postId: string,
  file: File,
  parentType: 'post' | 'task' = 'post',
) {
  const r = await requireClient().functions.invoke('attachments', {
    body: file,
    headers: {
      'Content-Type':
        file.type ||
        (
          {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            pdf: 'application/pdf',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          } as Record<string, string>
        )[file.name.split('.').at(-1)?.toLowerCase() ?? ''] ||
        'application/octet-stream',
      'x-clead-action': 'upload',
      'x-clead-parent-type': parentType,
      'x-clead-parent': postId,
      'x-clead-filename': encodeURIComponent(file.name),
    },
  });
  if (r.error || !r.data?.success) throw new Error('upload');
}
export async function attachmentLink(
  id: string,
  parentType: 'post' | 'task' = 'post',
): Promise<string> {
  const r = await requireClient().functions.invoke('attachments', {
    body: { action: 'link', attachment_id: id, parent_type: parentType },
  });
  if (r.error || typeof r.data?.url !== 'string') throw new Error('link');
  const url = new URL(r.data.url);
  if (
    !backendEnv ||
    url.origin !== new URL(backendEnv.VITE_SUPABASE_URL).origin ||
    !url.pathname.startsWith('/storage/v1/object/sign/attachments/') ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password
  )
    throw new Error('link');
  return r.data.url;
}
export async function deleteAttachment(
  id: string,
  parentType: 'post' | 'task' = 'post',
) {
  const r = await requireClient().functions.invoke('attachments', {
    body: { action: 'delete', attachment_id: id, parent_type: parentType },
  });
  if (r.error || !r.data?.success) throw new Error('delete');
}
export async function removePost(
  id: string,
  reason: string,
  reportId?: string,
) {
  const r = await requireClient().functions.invoke('attachments', {
    body: { action: 'remove_post', post_id: id, reason, report_id: reportId },
  });
  if (r.error || !r.data?.success) throw new Error('delete');
}
