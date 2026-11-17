import type { Capability, Role } from '@/types/domain';
export function can(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false;
  if (role === 'president' || role === 'vice_president') return true;
  return role === 'secretary'
    ? ['academic', 'attendance'].includes(capability)
    : role === 'treasurer' && capability === 'contributions';
}
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
