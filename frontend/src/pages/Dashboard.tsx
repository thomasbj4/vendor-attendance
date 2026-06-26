import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { AttendanceRecord, User, Timesheet } from '../types';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, addDays, isToday as dateFnsIsToday } from 'date-fns';
import { CheckCircle2, XCircle, Clock, CalendarDays, FileText, Zap, ChevronLeft, ChevronRight, PenLine, Sun } from 'lucide-react';

interface UserWeekStatus {
  user: User;
  records: AttendanceRecord[];
  weekdayRecords: AttendanceRecord[];
  weekendRecords: AttendanceRecord[];
  submittedDays: string[];
  missedDays: string[];
  weekendHours: number;
}

const today = new Date();

function getWorkDays(weekStart: Date) {
  return [0, 1, 2, 3, 4].map(i => addDays(weekStart, i)); // Mon–Fri
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin';

  const [weekOffset, setWeekOffset] = useState(0);
  const [userStatuses, setUserStatuses] = useState<UserWeekStatus[]>([]);
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [weekTimesheets, setWeekTimesheets] = useState<Timesheet[]>([]);
  const [myTimesheet, setMyTimesheet] = useState<Timesheet | null>(null);
  const [loading, setLoading] = useState(true);

  const baseDate   = weekOffset === 0 ? today : addWeeks(today, weekOffset);
  const weekStart  = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd    = endOfWeek(baseDate, { weekStartsOn: 1 });
  const workDays   = getWorkDays(weekStart);
  const pastWorkDays = workDays.filter(d => d <= today);

  const weekStartStr  = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr    = format(weekEnd,   'yyyy-MM-dd');
  const weekFridayStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const isCurrentWeek = weekOffset === 0;
  const weekLabel = isCurrentWeek ? 'This Week' : weekOffset === -1 ? 'Last Week' : `Week of ${format(weekStart, 'MMM d')}`;

  // Always show the weekend BEFORE the viewed week (prev Sat/Sun)
  const weekendDays = [addDays(weekStart, -2), addDays(weekStart, -1)];
  const weekendDateStrs = weekendDays.map(d => format(d, 'yyyy-MM-dd'));
  const fetchStartStr = format(addDays(weekStart, -2), 'yyyy-MM-dd');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (isManager) {
          const [usersRes, recRes, tsRes] = await Promise.all([
            api.get('/users'),
            api.get('/attendance', { params: { start_date: fetchStartStr, end_date: weekEndStr } }),
            api.get('/timesheets'),
          ]);
          const users: User[]            = usersRes.data.users.filter((u: User) => u.is_active && u.role !== 'admin');
          const allRecords: AttendanceRecord[] = recRes.data.records;
          const ts: Timesheet[]          = tsRes.data.timesheets.filter((t: Timesheet) =>
            t.period_start === weekStartStr && t.period_end === weekFridayStr &&
            (t.status === 'submitted' || t.status === 'signed')
          );
          setWeekTimesheets(ts);

          const statuses: UserWeekStatus[] = users.map(u => {
            const records        = allRecords.filter(r => r.user_id === u.id);
            const weekdayRecords = records.filter(r => !weekendDateStrs.includes(r.date));
            const weekendRecords = records.filter(r =>  weekendDateStrs.includes(r.date));
            const submittedDays  = weekdayRecords.map(r => r.date);
            const relevantDays   = isCurrentWeek ? pastWorkDays : workDays;
            const missedDays     = relevantDays
              .filter(d => !submittedDays.includes(format(d, 'yyyy-MM-dd')))
              .map(d => format(d, 'yyyy-MM-dd'));
            const weekendHours   = weekendRecords.reduce((s, r) => s + (r.regular_hours || 0) + (r.extra_hours || 0), 0);
            return { user: u, records, weekdayRecords, weekendRecords, submittedDays, missedDays, weekendHours };
          });
          setUserStatuses(statuses);
        } else {
          const [recRes, tsRes] = await Promise.all([
            api.get('/attendance', { params: { start_date: fetchStartStr, end_date: weekEndStr } }),
            api.get('/timesheets'),
          ]);
          setMyRecords(recRes.data.records);
          const ts: Timesheet[] = tsRes.data.timesheets;
          const mine = ts.find((t: Timesheet) =>
            t.period_start === weekStartStr && t.period_end === weekFridayStr
          ) ?? null;
          setMyTimesheet(mine);
        }
      } finally { setLoading(false); }
    };
    load();
  }, [isManager, fetchStartStr, weekEndStr]);

  const submitted    = userStatuses.filter(s => s.submittedDays.length > 0);
  const notSubmitted = userStatuses.filter(s => s.submittedDays.length === 0 && s.weekendHours === 0);
  const partial      = userStatuses.filter(s => s.submittedDays.length > 0 && s.missedDays.length > 0);

  // User-view derived stats
  const myWeekdayRecords = myRecords.filter(r => !weekendDateStrs.includes(r.date));
  const myWeekendRecords = myRecords.filter(r =>  weekendDateStrs.includes(r.date));
  const mySubmittedDays  = myWeekdayRecords.map(r => r.date);
  const relevantDays     = isCurrentWeek ? pastWorkDays : workDays;
  const myMissedDays     = relevantDays.filter(d => !mySubmittedDays.includes(format(d, 'yyyy-MM-dd')));
  const myRegularHours   = myWeekdayRecords.reduce((s, r) => s + (r.regular_hours || 0), 0);
  const myWeekdayOT      = myWeekdayRecords.reduce((s, r) => s + (r.extra_hours || 0), 0);
  const myWeekendHours   = myWeekendRecords.reduce((s, r) => s + (r.regular_hours || 0) + (r.extra_hours || 0), 0);

  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  // Shared weekend row renderer (user view)
  const WeekendRow = ({ day }: { day: Date }) => {
    const dateStr  = format(day, 'yyyy-MM-dd');
    const isFuture = day > today;
    const rec      = myRecords.find(r => r.date === dateStr);
    const totalHrs = rec ? (rec.regular_hours || 0) + (rec.extra_hours || 0) : 0;
    return (
      <div className="px-5 py-3 flex items-center justify-between bg-violet-50/40 border-l-2 border-violet-200">
        <div>
          <p className="text-sm font-medium text-gray-700">
            {format(day, 'EEEE')}
            <span className="text-xs font-normal text-violet-500 ml-1.5">Weekend · OT</span>
          </p>
          <p className="text-xs text-gray-400">{format(day, 'MMM d')}</p>
        </div>
        {isFuture ? (
          <span className="text-xs text-gray-300">Upcoming · Optional</span>
        ) : rec ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{rec.clock_in || '—'} – {rec.clock_out || '—'}</span>
            <span className="text-amber-600 text-xs font-semibold flex items-center gap-0.5">
              <Zap size={11} />{totalHrs.toFixed(1)}h OT
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">Not logged · Optional</span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0]}</h1>
          <p className="text-gray-400 text-sm mt-0.5 flex items-center gap-1">
            <CalendarDays size={13} />
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          <button onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 text-sm font-medium text-gray-700 min-w-[90px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))} disabled={isCurrentWeek}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : isManager ? (
        <>
          {/* Admin stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{submitted.length}</p>
                <p className="text-xs text-gray-500">Submitted</p>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <XCircle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{notSubmitted.length}</p>
                <p className="text-xs text-gray-500">Not submitted</p>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{partial.length}</p>
                <p className="text-xs text-gray-500">Partial</p>
              </div>
            </div>
          </div>

          {/* Admin user table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">Attendance — {weekLabel}</h2>
              <div className="flex items-center gap-3 text-xs text-gray-400 pr-1">
                {workDays.map(d => (
                  <span key={d.toISOString()} className={`font-medium w-8 text-center ${dateFnsIsToday(d) ? 'text-indigo-600' : ''}`}>
                    {format(d, 'EEE')}
                  </span>
                ))}
                <span className="w-8 text-center text-violet-400">Sat</span>
                <span className="w-8 text-center text-violet-400">Sun</span>
                <span className="w-32 text-right pr-2">Hours</span>
                <span className="w-28 text-right">Status</span>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {userStatuses.length === 0 && (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">No users found</div>
              )}
              {userStatuses.map(({ user: u, records, weekdayRecords, weekendRecords, submittedDays, missedDays, weekendHours }) => {
                const relevantDaysForUser = isCurrentWeek ? pastWorkDays : workDays;
                const allDone  = relevantDaysForUser.length > 0 && relevantDaysForUser.every(d => submittedDays.includes(format(d, 'yyyy-MM-dd')));
                const noneDone = submittedDays.length === 0;
                const ts       = weekTimesheets.find(t => t.user_id === u.id);
                const isSigned = !!ts;
                const totalReg   = weekdayRecords.reduce((s, r) => s + (r.regular_hours || 0), 0);
                const totalExtra = weekdayRecords.reduce((s, r) => s + (r.extra_hours || 0), 0);

                return (
                  <div key={u.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                    {/* Name */}
                    <div className="flex items-center gap-3 w-44 shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0
                        ${isSigned ? 'bg-emerald-100 text-emerald-700' : noneDone ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                        {u.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.department || u.role}</p>
                      </div>
                    </div>

                    {/* Weekday dots */}
                    <div className="flex items-center gap-3">
                      {workDays.map(d => {
                        const dateStr  = format(d, 'yyyy-MM-dd');
                        const isFuture = d > today;
                        const rec      = records.find(r => r.date === dateStr);
                        const isToday  = dateFnsIsToday(d);
                        if (isFuture) return (
                          <div key={dateStr} className="w-8 h-8 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-gray-100" />
                          </div>
                        );
                        if (rec) {
                          const statusColor: Record<string, string> = {
                            present: 'bg-emerald-500', absent: 'bg-red-400', 'half-day': 'bg-amber-400', leave: 'bg-blue-400',
                          };
                          return (
                            <div key={dateStr} className={`w-8 h-8 flex items-center justify-center rounded-lg ${isToday ? 'ring-1 ring-indigo-300' : ''}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${statusColor[rec.status] || 'bg-gray-300'}`}>
                                <CheckCircle2 size={13} className="text-white" />
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={dateStr} className={`w-8 h-8 flex items-center justify-center rounded-lg ${isToday ? 'ring-1 ring-indigo-300' : ''}`}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-100">
                              <XCircle size={13} className="text-red-400" />
                            </div>
                          </div>
                        );
                      })}

                      {/* Weekend dots */}
                      {weekendDays.map(d => {
                        const dateStr  = format(d, 'yyyy-MM-dd');
                        const isFuture = d > today;
                        const rec      = weekendRecords.find(r => r.date === dateStr);
                        return (
                          <div key={dateStr} className="w-8 h-8 flex items-center justify-center">
                            {isFuture ? (
                              <div className="w-2 h-2 rounded-full bg-gray-100" />
                            ) : rec ? (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-violet-500">
                                <Sun size={11} className="text-white" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-100">
                                <Sun size={11} className="text-gray-300" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Hours */}
                    {records.length > 0 ? (
                      <div className="text-right shrink-0 w-32">
                        <p className="text-sm font-semibold text-gray-800">{totalReg.toFixed(1)}h reg</p>
                        {totalExtra > 0 && (
                          <p className="text-xs text-amber-600 flex items-center justify-end gap-0.5">
                            <Zap size={10} />+{totalExtra.toFixed(1)}h OT
                          </p>
                        )}
                        {weekendHours > 0 && (
                          <p className="text-xs text-violet-600 flex items-center justify-end gap-0.5">
                            <Sun size={10} />{weekendHours.toFixed(1)}h wknd
                          </p>
                        )}
                      </div>
                    ) : <div className="w-32" />}

                    {/* Sign-off status */}
                    <div className="w-28 text-right shrink-0">
                      {isSigned
                        ? <span className="badge-green flex items-center justify-end gap-1"><PenLine size={10} /> Signed</span>
                        : allDone
                        ? <span className="badge-blue">Pending sign-off</span>
                        : noneDone
                        ? <span className="badge-red">No records</span>
                        : <span className="badge-yellow">{submittedDays.length}/{relevantDaysForUser.length} days</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        // ── User view ──
        <div className="space-y-4">
          {(() => {
            const signedReg   = myTimesheet?.total_regular_hours ?? null;
            const signedExtra = myTimesheet?.total_extra_hours   ?? null;
            const displayReg   = signedReg   !== null ? signedReg   : myRegularHours;
            const displayExtra = signedExtra !== null ? signedExtra : myWeekdayOT;
            const isSigned     = !!myTimesheet;
            return (
              <div className="grid grid-cols-5 gap-4">
                <div className="card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{mySubmittedDays.length} / {relevantDays.length}</p>
                    <p className="text-xs text-gray-500">Days recorded</p>
                  </div>
                </div>

                <div className="card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Clock size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{displayReg.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">Regular hours</p>
                  </div>
                </div>

                <div className="card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Zap size={18} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{displayExtra.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">Overtime</p>
                  </div>
                </div>

                <div className="card p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                    <Sun size={18} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{myWeekendHours.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">Weekend OT</p>
                  </div>
                </div>

                <div className={`card p-4 flex items-center gap-3 ${isSigned ? 'border-emerald-200 bg-emerald-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSigned ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                    <PenLine size={18} className={isSigned ? 'text-emerald-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${isSigned ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {isSigned ? 'Signed & submitted' : 'Not signed'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {isSigned
                        ? `${(displayReg + displayExtra + myWeekendHours).toFixed(1)}h total`
                        : 'Go to Sign-off tab'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Daily list */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">{weekLabel}</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {/* Previous Sat/Sun at top (current week, Mon–Fri) */}
              {weekendDays.map(d => <WeekendRow key={format(d, 'yyyy-MM-dd')} day={d} />)}

              {/* Mon–Fri rows */}
              {workDays.map(d => {
                const dateStr  = format(d, 'yyyy-MM-dd');
                const isFuture = d > today;
                const isToday  = dateFnsIsToday(d);
                const rec      = myWeekdayRecords.find(r => r.date === dateStr);
                return (
                  <div key={dateStr} className={`px-5 py-3 flex items-center justify-between ${isToday ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                    <div>
                      <p className={`text-sm font-medium ${isToday ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {format(d, 'EEEE')}
                        {isToday && <span className="text-xs font-normal text-indigo-400 ml-1">Today</span>}
                      </p>
                      <p className="text-xs text-gray-400">{format(d, 'MMM d')}</p>
                    </div>
                    {isFuture ? (
                      <span className="badge-gray">Upcoming</span>
                    ) : rec ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{rec.clock_in || '08:00'} – {rec.clock_out || '16:00'}</span>
                        {rec.extra_hours ? (
                          <span className="text-amber-600 text-xs font-medium flex items-center gap-0.5">
                            <Zap size={11} />+{rec.extra_hours}h
                          </span>
                        ) : null}
                        <span className={rec.status === 'present' ? 'badge-green' : rec.status === 'absent' ? 'badge-red' : 'badge-yellow'}>
                          {rec.status}
                        </span>
                      </div>
                    ) : (
                      <span className="badge-red">Not submitted</span>
                    )}
                  </div>
                );
              })}

              {/* This week's Sat/Sun at bottom (past weeks or when on weekend) */}
              {/* weekend always shown above weekdays */}
            </div>
          </div>

          {myMissedDays.length > 0 && isCurrentWeek && (
            <div className="card p-4 bg-amber-50 border-amber-200 flex items-center justify-between">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">{myMissedDays.length} day{myMissedDays.length > 1 ? 's' : ''}</span> missing this week.
              </p>
              <a href="/attendance" className="btn-primary text-xs py-1.5">
                <FileText size={13} /> Go to Attendance Sheet
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
