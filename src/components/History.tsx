import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getAttendance,
  getMembers,
  updateAttendance,
  type AttendanceRecord,
  type Member,
  type AttendanceStatus,
} from '../lib/api';

interface HistoryProps {
  classId: string;
}

interface DateGroup {
  date: string;
  records: AttendanceRecord[];
  presentCount: number;
  totalMembers: number;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Unknown date';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: AttendanceStatus | string }) {
  const styles: Record<string, string> = {
    Present: 'bg-green-100 text-green-800 border-green-200',
    Late: 'bg-amber-100 text-amber-800 border-amber-200',
    Absent: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        styles[status] || 'bg-gray-100 text-gray-700 border-gray-200'
      }`}
    >
      {status}
    </span>
  );
}

export default function History({ classId }: HistoryProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attendanceData, membersData] = await Promise.all([
        getAttendance(classId),
        getMembers(classId),
      ]);
      setRecords(attendanceData);
      setMembers(membersData);

      // Auto-expand the most recent date
      if (attendanceData.length > 0) {
        const dates = [...new Set(attendanceData.map(r => r.date))].sort().reverse();
        if (dates[0]) {
          setExpandedDates(new Set([dates[0]]));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const memberMap = useMemo(() => {
    const map: Record<string, Member> = {};
    for (const m of members) {
      map[m.id] = m;
    }
    return map;
  }, [members]);

  const dateGroups = useMemo((): DateGroup[] => {
    const groupMap: Record<string, AttendanceRecord[]> = {};
    for (const r of records) {
      if (!r.date) continue;
      if (!groupMap[r.date]) groupMap[r.date] = [];
      groupMap[r.date].push(r);
    }

    return Object.entries(groupMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, recs]) => ({
        date,
        records: recs.sort((a, b) => {
          const nameA = (a.memberId && memberMap[a.memberId]?.name) || '';
          const nameB = (b.memberId && memberMap[b.memberId]?.name) || '';
          return nameA.localeCompare(nameB);
        }),
        presentCount: recs.filter(r => r.status === 'Present').length,
        totalMembers: members.length,
      }));
  }, [records, memberMap, members.length]);

  const filteredGroups = useMemo((): DateGroup[] => {
    if (!search.trim()) return dateGroups;
    const q = search.toLowerCase();
    return dateGroups
      .map(group => ({
        ...group,
        records: group.records.filter(r => {
          const memberName = (r.memberId && memberMap[r.memberId]?.name) || '';
          return memberName.toLowerCase().includes(q);
        }),
      }))
      .filter(group => group.records.length > 0);
  }, [dateGroups, search, memberMap]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const changeStatus = async (record: AttendanceRecord, newStatus: AttendanceStatus) => {
    const previousStatus = record.status;
    // Optimistic update
    setRecords(prev =>
      prev.map(r => r.id === record.id ? { ...r, status: newStatus } : r)
    );
    setSyncing(prev => new Set(prev).add(record.id));
    try {
      const updated = await updateAttendance(record.id, newStatus);
      setRecords(prev =>
        prev.map(r => r.id === record.id ? updated : r)
      );
    } catch {
      // Rollback
      setRecords(prev =>
        prev.map(r => r.id === record.id ? { ...r, status: previousStatus } : r)
      );
    } finally {
      setSyncing(prev => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const expandAll = () => {
    setExpandedDates(new Set(filteredGroups.map(g => g.date)));
  };

  const collapseAll = () => {
    setExpandedDates(new Set());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <svg className="animate-spin h-6 w-6 mr-3 text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
        <strong>Error:</strong> {error}
        <button onClick={loadData} className="ml-3 underline hover:no-underline">
          Retry
        </button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium mb-1">No attendance records yet</p>
        <p className="text-sm">Use the Check-in tab to record attendance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by member name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-md pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 hover:underline px-2 py-1"
          >
            Expand all
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-blue-600 hover:underline px-2 py-1"
          >
            Collapse all
          </button>
        </div>
      </div>

      {filteredGroups.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-sm">
          No records match your search.
        </div>
      )}

      {/* Date groups */}
      <div className="space-y-3">
        {filteredGroups.map(group => {
          const isExpanded = expandedDates.has(group.date);
          const absentCount = group.records.filter(r => r.status === 'Absent').length;

          return (
            <div
              key={group.date}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Date header */}
              <button
                onClick={() => toggleDate(group.date)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-gray-900 text-sm">
                    {formatDate(group.date)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {group.presentCount} present
                    </span>
                    {absentCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {absentCount} absent
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-400 flex-shrink-0 ml-2">
                  <span className="text-xs">{group.records.length} record{group.records.length !== 1 ? 's' : ''}</span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>

              {/* Records table */}
              {isExpanded && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white border-t border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                        Member
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.records.map(record => {
                      const member = record.memberId ? memberMap[record.memberId] : null;
                      const isSyncing = syncing.has(record.id);
                      return (
                        <tr key={record.id} className="bg-white hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 text-gray-900 font-medium">
                            {member?.name || (
                              <span className="text-gray-400 italic">Unknown member</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isSyncing ? (
                              <div className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                <StatusBadge status={record.status} />
                              </div>
                            ) : (
                              <select
                                value={record.status}
                                onChange={e => changeStatus(record, e.target.value as AttendanceStatus)}
                                className={`text-xs font-medium border rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                                  record.status === 'Present'
                                    ? 'bg-green-100 text-green-800 border-green-200'
                                    : record.status === 'Absent'
                                    ? 'bg-red-100 text-red-800 border-red-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                              >
                                <option value="Present">Present</option>
                                <option value="Absent">Absent</option>
                                {record.status === 'Late' && (
                                  <option value="Late">Late</option>
                                )}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <p className="text-xs text-gray-400">
        {dateGroups.length} session{dateGroups.length !== 1 ? 's' : ''} recorded
        {search && ` (filtered to ${filteredGroups.length})`}
      </p>
    </div>
  );
}
