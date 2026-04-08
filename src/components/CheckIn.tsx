import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getMembers,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  type Member,
  type AttendanceRecord,
  type AttendanceStatus,
} from '../lib/api';

interface CheckInProps {
  classId: string;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

type StatusMap = Record<string, AttendanceRecord>;

export default function CheckIn({ classId }: CheckInProps) {
  const [date, setDate] = useState<string>(todayISO());
  const [members, setMembers] = useState<Member[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [errorMembers, setErrorMembers] = useState<string | null>(null);
  const [errorAttendance, setErrorAttendance] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  // Abort controller for cancelling in-flight attendance fetches on date/class change
  const abortRef = useRef<AbortController | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    setErrorMembers(null);
    try {
      const data = await getMembers(classId);
      setMembers(data);
    } catch (err) {
      setErrorMembers(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoadingMembers(false);
    }
  }, [classId]);

  const loadAttendance = useCallback(async (selectedDate: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoadingAttendance(true);
    setErrorAttendance(null);
    try {
      const records = await getAttendance(classId, selectedDate);
      const map: StatusMap = {};
      for (const r of records) {
        if (r.memberId) {
          map[r.memberId] = r;
        }
      }
      setStatusMap(map);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setErrorAttendance(err.message || 'Failed to load attendance');
      }
    } finally {
      setLoadingAttendance(false);
    }
  }, [classId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    loadAttendance(date);
  }, [loadAttendance, date]);

  const markStatus = async (member: Member, newStatus: AttendanceStatus) => {
    const existing = statusMap[member.id];

    // Optimistic update
    if (existing && existing.status === newStatus) {
      // Toggle off — delete record
      const optimisticMap = { ...statusMap };
      delete optimisticMap[member.id];
      setStatusMap(optimisticMap);

      setSyncing(prev => new Set(prev).add(member.id));
      try {
        await deleteAttendance(existing.id);
      } catch {
        // Rollback
        setStatusMap(prev => ({ ...prev, [member.id]: existing }));
      } finally {
        setSyncing(prev => {
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });
      }
      return;
    }

    if (existing) {
      // Update existing record
      const optimisticRecord: AttendanceRecord = { ...existing, status: newStatus };
      setStatusMap(prev => ({ ...prev, [member.id]: optimisticRecord }));

      setSyncing(prev => new Set(prev).add(member.id));
      try {
        const updated = await updateAttendance(existing.id, newStatus);
        setStatusMap(prev => ({ ...prev, [member.id]: updated }));
      } catch {
        // Rollback
        setStatusMap(prev => ({ ...prev, [member.id]: existing }));
      } finally {
        setSyncing(prev => {
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });
      }
    } else {
      // Create new record (optimistic placeholder)
      const tempId = `temp-${member.id}`;
      const optimisticRecord: AttendanceRecord = {
        id: tempId,
        memberId: member.id,
        classId,
        date,
        status: newStatus,
      };
      setStatusMap(prev => ({ ...prev, [member.id]: optimisticRecord }));

      setSyncing(prev => new Set(prev).add(member.id));
      try {
        const created = await createAttendance({
          memberId: member.id,
          classId,
          date,
          status: newStatus,
        });
        setStatusMap(prev => ({ ...prev, [member.id]: created }));
      } catch {
        // Rollback
        setStatusMap(prev => {
          const next = { ...prev };
          delete next[member.id];
          return next;
        });
      } finally {
        setSyncing(prev => {
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });
      }
    }
  };

  const markAllPresent = async () => {
    const toMark = members.filter(
      m => !statusMap[m.id] || statusMap[m.id].status !== 'Present'
    );

    // Optimistic update for all
    const optimisticUpdates: StatusMap = { ...statusMap };
    for (const member of toMark) {
      const tempId = `temp-${member.id}`;
      optimisticUpdates[member.id] = {
        id: statusMap[member.id]?.id || tempId,
        memberId: member.id,
        classId,
        date,
        status: 'Present',
      };
    }
    setStatusMap(optimisticUpdates);

    // Sync each in background
    await Promise.allSettled(
      toMark.map(async (member) => {
        setSyncing(prev => new Set(prev).add(member.id));
        try {
          const existing = statusMap[member.id];
          let record: AttendanceRecord;
          if (existing) {
            record = await updateAttendance(existing.id, 'Present');
          } else {
            record = await createAttendance({
              memberId: member.id,
              classId,
              date,
              status: 'Present',
            });
          }
          setStatusMap(prev => ({ ...prev, [member.id]: record }));
        } catch {
          // Silent fail — UI already shows optimistic state
        } finally {
          setSyncing(prev => {
            const next = new Set(prev);
            next.delete(member.id);
            return next;
          });
        }
      })
    );
  };

  const clearAll = async () => {
    const toDelete = members.filter(m => statusMap[m.id]);

    // Optimistic clear
    const optimisticMap = { ...statusMap };
    for (const member of toDelete) {
      delete optimisticMap[member.id];
    }
    setStatusMap(optimisticMap);

    await Promise.allSettled(
      toDelete.map(async (member) => {
        const record = statusMap[member.id];
        if (!record || record.id.startsWith('temp-')) return;

        setSyncing(prev => new Set(prev).add(member.id));
        try {
          await deleteAttendance(record.id);
        } catch {
          // Silent fail
        } finally {
          setSyncing(prev => {
            const next = new Set(prev);
            next.delete(member.id);
            return next;
          });
        }
      })
    );
  };

  const presentCount = members.filter(
    m => statusMap[m.id]?.status === 'Present'
  ).length;
  const markedCount = members.filter(m => statusMap[m.id]).length;

  if (loadingMembers) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <svg className="animate-spin h-6 w-6 mr-3 text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading members…
      </div>
    );
  }

  if (errorMembers) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
        <strong>Error:</strong> {errorMembers}
        <button
          onClick={loadMembers}
          className="ml-3 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium mb-1">No members in this class</p>
        <p className="text-sm">Add members on the Roster tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllPresent}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Mark All Present
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-blue-50 border border-blue-100 rounded-md px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm text-blue-800">
          <strong>{presentCount}</strong> of <strong>{members.length}</strong> present
          {markedCount > 0 && markedCount !== members.length && (
            <span className="text-blue-600 ml-2">({members.length - markedCount} unmarked)</span>
          )}
        </span>
        {errorAttendance && (
          <span className="text-xs text-red-600">{errorAttendance}</span>
        )}
      </div>

      {/* Member list — wait for attendance to load before rendering so statusMap is accurate */}
      {loadingAttendance ? (
        <div className="flex items-center justify-center py-10 text-gray-400 border border-gray-200 rounded-lg">
          <svg className="animate-spin h-5 w-5 mr-2 text-blue-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading attendance…
        </div>
      ) : members.filter(m => !statusMap[m.id]).length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-sm border border-gray-200 rounded-lg">
          Everyone has been checked in for this date.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {members.filter(m => !statusMap[m.id]).map(member => {
            const isSyncing = syncing.has(member.id);

            return (
              <div
                key={member.id}
                className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSyncing ? (
                    <svg className="animate-spin h-4 w-4 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-200" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                    {member.notes && (
                      <p className="text-xs text-gray-500 truncate">{member.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                  <button
                    onClick={() => markStatus(member, 'Present')}
                    disabled={isSyncing}
                    className="btn-status-present"
                  >
                    Present
                  </button>
                  <button
                    onClick={() => markStatus(member, 'Absent')}
                    disabled={isSyncing}
                    className="btn-status-absent"
                  >
                    Absent
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
