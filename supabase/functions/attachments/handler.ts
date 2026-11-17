import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, readBody, response, service } from '../_shared/auth.ts';
import { readFileBytes, validateFile } from '../_shared/files.ts';
export async function handleAttachments(request: Request) {
  const upload = request.headers.get('x-clead-action') === 'upload';
  const early = preflight(request, upload ? 10485760 : 4096);
  if (early) return early;
  try {
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: request.headers.get('authorization') ?? '',
          },
        },
        auth: { persistSession: false },
      },
    );
    const user = await caller.auth.getUser();
    if (user.error || !user.data.user)
      return response(request, { error: 'Unauthorized' }, 401);
    const sessions = await caller.rpc('my_sessions');
    const session = sessions.data?.find(
      (s: { is_current: boolean }) => s.is_current,
    );
    if (sessions.error || !session)
      return response(request, { error: 'Unauthorized' }, 401);
    const actor = user.data.user.id,
      operator_session = session.id;
    const admin = service();
    const clientRpc = async (name: string, args: Record<string, unknown>) => {
      const r = await caller.rpc(name, args);
      if (r.error) throw r.error;
      return r.data;
    };
    const serverRpc = async (name: string, args: Record<string, unknown>) => {
      const r = await admin.rpc(name, args);
      if (r.error) throw r.error;
      return r.data;
    };
    const storage = admin.storage.from('attachments');
    const remove = async (id: string, path: string) => {
      const result = await storage.remove([path]);
      if (result.error) throw result.error;
      await serverRpc('finish_attachment_delete', { attachment_id: id, actor });
    };
    if (upload) {
      const name = decodeURIComponent(
        request.headers.get('x-clead-filename') ?? '',
      );
      const mime = request.headers.get('content-type') ?? '';
      const bytes = await readFileBytes(request);
      validateFile(name, mime, bytes);
      const taskParent = request.headers.get('x-clead-parent-type') === 'task';
      const rawAttachment = await clientRpc(
        taskParent ? 'reserve_task_attachment' : 'reserve_attachment',
        {
          [taskParent ? 'target_task' : 'target_post']:
            request.headers.get('x-clead-parent'),
          file_name: name,
          file_mime: mime,
          file_bytes: bytes.length,
        },
      );
      const attachment = Array.isArray(rawAttachment)
        ? rawAttachment[0]
        : rawAttachment;
      try {
        const stored = await storage.upload(attachment.storage_path, bytes, {
          contentType: mime,
          upsert: false,
        });
        if (stored.error) throw stored.error;
        await serverRpc(
          taskParent
            ? 'finish_task_attachment_upload'
            : 'finish_attachment_upload',
          {
            attachment_id: attachment.id,
            actor,
            operator_session,
          },
        );
      } catch {
        await remove(attachment.id, attachment.storage_path);
        throw new Error('Upload incomplete');
      }
      return response(request, { success: true });
    }
    const body = await readBody(request);
    if (body.action === 'link' || body.action === 'delete') {
      const rawAttachment = await clientRpc(
        body.parent_type === 'task'
          ? 'task_attachment_access'
          : 'attachment_access',
        {
          attachment_id: body.attachment_id,
          access_mode: body.action === 'link' ? 'read' : 'delete',
        },
      );
      const attachment = Array.isArray(rawAttachment)
        ? rawAttachment[0]
        : rawAttachment;
      if (body.action === 'delete') {
        await remove(attachment.id, attachment.storage_path);
        return response(request, { success: true });
      }
      const signed = await storage.createSignedUrl(
        attachment.storage_path,
        60,
        { download: attachment.filename },
      );
      if (signed.error) throw signed.error;
      return response(request, { url: signed.data.signedUrl, expires_in: 60 });
    }
    if (body.action === 'remove_post') {
      const attachments = await clientRpc('prepare_post_deletion', {
        target_post: body.post_id,
        removal_reason: body.reason,
        report_id: body.report_id ?? null,
      });
      for (const attachment of attachments)
        await remove(attachment.id, attachment.storage_path);
      await serverRpc('finish_post_deletion', {
        target_post: body.post_id,
        actor,
        operator_session,
        report_id: body.report_id ?? null,
      });
      return response(request, { success: true });
    }
    return response(request, { error: 'Invalid action' }, 400);
  } catch {
    return response(
      request,
      {
        error:
          'Attachment operation failed. Check access, file type and limits; retry incomplete deletion.',
      },
      400,
    );
  }
}
