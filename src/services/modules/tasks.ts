import { cacheRecent, offlineOwner } from '@/services/offline/cache';
import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import { taskSchema, type Task, type TaskProgress } from '@/schemas/tasks';
export async function listTasks(page = 0, archived = false): Promise<Task[]> {
  const r = await requireClient()
    .from('tasks')
    .select('*')
    .eq('status', archived ? 'archived' : 'active')
    .order('deadline')
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (r.error) throw r.error;
  if (page === 0 && !archived && offlineOwner()) {
    const own = await requireClient()
      .from('task_assignments')
      .select('task_id')
      .eq('student_id', offlineOwner()!)
      .is('revoked_at', null);
    if (!own.error)
      cacheRecent(
        'tasks',
        (r.data as Task[])
          .filter((t) => own.data.some((a) => a.task_id === t.id))
          .map((t) => ({
            id: t.id,
            title: t.title,
            text: t.description,
            date: t.deadline,
          })),
      );
  }
  return r.data as Task[];
}
export async function getTask(id: string): Promise<Task> {
  const r = await requireClient()
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error) throw r.error;
  return r.data as Task;
}
export const taskProgress = (id: string) =>
  rpc('task_progress', { target_task: id }) as Promise<TaskProgress[]>;
export async function saveTask(id: string | null, input: unknown) {
  const v = taskSchema.parse(input);
  return (await rpc('save_task', {
    target_task: id,
    task_subject: v.subject_id,
    task_title: v.title,
    task_description: v.description,
    due_at: v.deadline,
    audience: v.target_type,
    group_target: v.target_group_id,
    user_target: v.target_user_id,
    reminders: v.reminder_minutes,
    change_reason: v.reason || null,
  })) as string;
}
export const completeTask = (id: string, completed: boolean) =>
  rpc('set_task_completion', { target_task: id, is_complete: completed });
