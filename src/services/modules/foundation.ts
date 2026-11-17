import { requireClient } from '@/services/supabase/client';
import type { Profile } from '@/types/domain';
/** Paginated reads stay outside Pinia. RLS always decides visibility. */
export async function fetchAnnouncements(page = 0) {
  const { data, error } = await requireClient()
    .from('posts')
    .select('id,title,kind,pinned,publish_at,state')
    .eq('kind', 'announcement')
    .eq('state', 'published')
    .order('pinned', { ascending: false })
    .order('publish_at', { ascending: false })
    .range(page * 20, page * 20 + 19);
  if (error) throw error;
  return data;
}
export async function fetchRoster(): Promise<Profile[]> {
  const rows: Profile[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await requireClient()
      .from('profiles')
      .select('id,full_name,username,role,active')
      .order('full_name')
      .order('id')
      .range(offset, offset + 99);
    if (error) throw error;
    rows.push(...(data as Profile[]));
    if (data.length < 100) return rows;
  }
}
