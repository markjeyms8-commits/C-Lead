import { requireClient } from '@/services/supabase/client';
import {
  accountSchema,
  parseCsv,
  previewRoster,
  type AccountInput,
} from '@/schemas/accounts';
import type { Member, PendingAccount } from '@/types/administration';
import type { Role } from '@/types/domain';
export async function memberRoster(): Promise<Member[]> {
  const rows: Member[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await requireClient()
      .rpc('account_roster')
      .range(offset, offset + 99);
    if (r.error) throw r.error;
    rows.push(...(r.data as Member[]));
    if (r.data.length < 100) return rows;
  }
}
export async function pendingAccounts(): Promise<PendingAccount[]> {
  const r = await requireClient().rpc('pending_account_creations');
  if (r.error) throw r.error;
  return r.data;
}
export async function createAccount(input: AccountInput, operation_id: string) {
  const r = await requireClient().functions.invoke('admin-accounts', {
    body: { action: 'create', ...accountSchema.parse(input), operation_id },
  });
  if (r.error || !r.data?.success) throw new Error('account');
  return r.data.user_id as string;
}
export async function editAccount(
  id: string,
  input: AccountInput,
  role: Role,
  active: boolean,
  reason: string,
) {
  const r = await requireClient().rpc('edit_account', {
    target_user: id,
    official_name: input.full_name,
    login_username: input.username,
    official_number: input.student_number,
    assigned_role: role,
    is_active: active,
    change_reason: reason,
  });
  if (r.error) throw r.error;
}
export async function resetAccount(id: string, reason: string) {
  const r = await requireClient().functions.invoke('admin-accounts', {
    body: { action: 'reset', user_id: id, reason },
  });
  if (r.error || !r.data?.success) throw new Error('reset');
}
export async function readRosterFile(file: File, existing: AccountInput[]) {
  if (file.size > 2 * 1024 * 1024) throw new Error('size');
  let rows: unknown[][];
  if (file.name.toLowerCase().endsWith('.csv'))
    rows = parseCsv(await file.text());
  else if (file.name.toLowerCase().endsWith('.xlsx')) {
    const { readSheet: read } = await import('read-excel-file/browser');
    rows = await read(file);
  } else throw new Error('type');
  return previewRoster(rows, existing);
}
export async function revokeAccountSessions(id: string, reason: string) {
  const r = await requireClient().rpc('admin_revoke_sessions', {
    target_user: id,
    revocation_reason: reason,
  });
  if (r.error) throw r.error;
}
