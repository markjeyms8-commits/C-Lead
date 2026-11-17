export type Role =
  'president' | 'vice_president' | 'secretary' | 'treasurer' | 'student';
export interface Profile {
  id: string;
  full_name: string;
  username: string;
  role: Role;
  active: boolean;
}
export type Capability =
  | 'accounts'
  | 'publish'
  | 'academic'
  | 'attendance'
  | 'contributions'
  | 'audit'
  | 'roles';
