export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  department: string | null;
  vendor_id: string | null;
  is_active: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  extra_hours: number;
  extra_start: string | null;
  extra_end: string | null;
  regular_hours?: number;
  status: 'present' | 'absent' | 'half-day' | 'leave';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Timesheet {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  department?: string | null;
  period_start: string;
  period_end: string;
  total_regular_hours: number;
  total_extra_hours: number;
  notes: string | null;
  /** draft → submitted → signed (final) */
  status: 'draft' | 'submitted' | 'signed';
  signature_id: number | null;
  signature_data?: string | null;
  signature_name?: string | null;
  submitted_at: string | null;
  signed_by: number | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Signature {
  id: number;
  user_id: number;
  name: string;
  data: string;
  is_default: number;
  created_at: string;
}
