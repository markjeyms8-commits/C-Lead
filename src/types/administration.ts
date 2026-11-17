import type { Profile } from './domain';
export interface Member extends Profile {
  student_number: string;
}
export interface PendingAccount {
  operation_id: string;
  full_name: string;
  username: string;
  student_number: string;
}
