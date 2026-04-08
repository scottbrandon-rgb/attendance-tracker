export interface Class {
  id: string;
  name: string;
  description: string;
}

export interface Member {
  id: string;
  name: string;
  notes: string;
  classId: string | null;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late';

export interface AttendanceRecord {
  id: string;
  memberId: string | null;
  classId: string | null;
  date: string;
  status: AttendanceStatus;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

// Classes

export async function getClasses(): Promise<Class[]> {
  return apiFetch<Class[]>('/api/classes');
}

// Members

export async function getMembers(classId?: string): Promise<Member[]> {
  const url = classId
    ? `/api/members?classId=${encodeURIComponent(classId)}`
    : '/api/members';
  return apiFetch<Member[]>(url);
}

export async function createMember(data: {
  name: string;
  classId: string;
  notes?: string;
}): Promise<Member> {
  return apiFetch<Member>('/api/members', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMember(
  id: string,
  data: { name?: string; notes?: string; classId?: string }
): Promise<Member> {
  return apiFetch<Member>(`/api/members?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteMember(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean; id: string }>(
    `/api/members?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

// Attendance

export async function getAttendance(
  classId: string,
  date?: string
): Promise<AttendanceRecord[]> {
  let url = `/api/attendance?classId=${encodeURIComponent(classId)}`;
  if (date) {
    url += `&date=${encodeURIComponent(date)}`;
  }
  return apiFetch<AttendanceRecord[]>(url);
}

export async function createAttendance(data: {
  memberId: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
}): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>('/api/attendance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAttendance(
  id: string,
  status: AttendanceStatus
): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(`/api/attendance?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteAttendance(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean; id: string }>(
    `/api/attendance?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}
