import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { AttendanceRecord, User, Timesheet } from '../types';
import { format, startOfWeek, parseISO, addDays, isToday as dateFnsIsToday } from 'date-fns';
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
// Default period: last Saturday → this Friday
const currentMon          = startOfWeek(today, { weekStartsOn: 1 });
const currentPeriodStart  = addDays(currentMon, -2); // Sat
const currentPeriodEnd    = addDays(currentMon,  4); // Fri

function getWorkDays(weekStart: Date) {
  return [0, 1, 2, 3, 4].map(i => addDays(weekStart, i)); // Mon–Fri
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin';

  const [rangeStart, setRangeStart] = useState(format(currentPeriodStart, 'yyyy-MM-dd'));
  const [rangeEnd,   setRangeEnd]   = useState(format(currentPeriodEnd,   'yyyy-MM-dd'));
  const [userStatuses, setUserStatuses] = useState<UserWeekStatus[]>([]);
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [weekTimesheets, setWeekTimesheets] = useState<Timesheet[]>([]);
  const [myTimesheet, setMyTimesheet] = useState<Timesheet | null>(null);
  const [loading, setLoading] = useState(true);

  // rangeStart is always Saturday; Monday is 2 days later
  const weekStart    = addDays(parseISO(rangeStart), 2);
  const workDays     = getWorkDays(weekStart);
  const pastWorkDays = workDays.filter(d => d <= today);

  const weekStartStr  = format(weekStart, 'yyyy-MM-dd');  // Monday
  const weekEndStr    = rangeEnd;                          // Friday (for API fetch)
  const weekSundayStr = format(addDays(weekStart, 6), 'yyyy-MM-dd'); // Sunday — timesheet period_end

  const isCurrentPeriod = rangeStart === format(currentPeriodStart, 'yyyy-MM-dd');
  const weekLabel = isCurrentPeriod
    ? 'This Week'
    : `${format(parseISO(rangeStart), 'MMM d')} – ${format(parseISO(rangeEnd), 'MMM d')}`;

  // Sat/Sun at the START of the range
  const weekendDays     = [parseISO(rangeStart), addDays(parseISO(rangeStart), 1)];
  const weekendDateStrs = weekendDays.map(d => format(d, 'yyyy-MM-dd'));
  const fetchStartStr   = rangeStart; // starts from Saturday

  const todayStr = format(today, 'yyyy-MM-dd');

  const goToPrevPeriod = () => {
    setRangeStart(format(addDays(parseISO(rangeStart), -7), 'yyyy-MM-dd'));
    setRangeEnd(format(addDays(parseISO(rangeEnd),   -7), 'yyyy-MM-dd'));
  };
  const goToNextPeriod = () => {
    if (isCurrentPeriod) return;
    setRangeStart(format(addDays(parseISO(rangeStart), 7), 'yyyy-MM-dd'));
    setRangeEnd(format(addDays(parseISO(rangeEnd),   7), 'yyyy-MM-dd'));
  };
  const goToCurrentPeriod = () => {
    setRangeStart(format(currentPeriodStart, 'yyyy-MM-dd'));
    setRangeEnd(format(currentPeriodEnd,   'yyyy-MM-dd'));
  };
  const handleStartChange = (value: string) => {
    if (!value) return;
    const d   = parseISO(value);
    const day = d.getDay(); // 0=Sun … 6=Sat
    const daysFromSat = day === 6 ? 0 : day + 1;
    const ps  = addDays(d, -daysFromSat); // snap to Saturday
    setRangeStart(format(ps,              'yyyy-MM-dd'));
    setRangeEnd(format(addDays(ps, 6),  'yyyy-MM-dd')); // +6 = Friday
  };

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
            t.period_start === weekStartStr && t.period_end === weekSundayStr &&
            (t.status === 'submitted' || t.status === 'signed')
          );
          setWeekTimesheets(ts);

          const statuses: UserWeekStatus[] = users.map(u => {
            const records        = allRecords.filter(r => r.user_id === u.id);
            const weekdayRecords = records.filter(r => !weekendDateStrs.includes(r.date));
            const weekendRecords = records.filter(r =>  weekendDateStrs.includes(r.date));
            const submittedDays  = weekdayRecords.map(r => r.date);
            const relevantDays   = isCurrentPeriod ? pastWorkDays : workDays;
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
            t.period_start === weekStartStr && t.period_end === weekSundayStr
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
  const totalRegHours = userStatuses.reduce((s, u) => s + u.weekdayRecords.reduce((ss, r) => ss + (r.regular_hours || 0), 0), 0);
  const totalOTHours  = userStatuses.reduce((s, u) => s + u.weekdayRecords.reduce((ss, r) => ss + (r.extra_hours || 0), 0) + u.weekendHours, 0);

  // User-view derived stats
  const myWeekdayRecords = myRecords.filter(r => !weekendDateStrs.includes(r.date));
  const myWeekendRecords = myRecords.filter(r =>  weekendDateStrs.includes(r.date));
  const mySubmittedDays  = myWeekdayRecords.map(r => r.date);
  const relevantDays     = isCurrentPeriod ? pastWorkDays : workDays;
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0]}</h1>
          <p className="text-gray-400 text-sm mt-0.5 flex items-center gap-1">
            <CalendarDays size={13} />
            {format(parseISO(rangeStart), 'MMM d')} – {format(parseISO(rangeEnd), 'MMM d, yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <button onClick={goToPrevPeriod}
              className="px-2.5 py-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700 border-r border-gray-100 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1 px-2.5 py-1.5">
              <input
                type="date"
                value={rangeStart}
                max={todayStr}
                onChange={e => handleStartChange(e.target.value)}
                className="text-sm text-gray-700 outline-none bg-transparent w-[116px] cursor-pointer"
              />
              <span className="text-gray-300 text-xs select-none">–</span>
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                max={todayStr}
                onChange={e => setRangeEnd(e.target.value)}
                className="text-sm text-gray-700 outline-none bg-transparent w-[116px] cursor-pointer"
              />
            </div>
            <button onClick={goToNextPeriod} disabled={isCurrentPeriod}
              className="px-2.5 py-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700 border-l border-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
          {!isCurrentPeriod && (
            <button onClick={goToCurrentPeriod} className="btn-secondary text-xs py-1.5 px-3">
              This Week
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : isManager ? (
        <>
          {/* Admin stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{userStatuses.length}</p>
                <p className="text-xs text-gray-500">Employees</p>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{submitted.length}</p>
                <p className="text-xs text-gray-500">Submitted</p>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <XCircle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{notSubmitted.length}</p>
                <p className="text-xs text-gray-500">Not submitted</p>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                <Clock size={18} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{totalRegHours.toFixed(0)}h</p>
                <p className="text-xs text-gray-500">Regular hrs</p>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <Zap size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-amber-600">{totalOTHours.toFixed(0)}h</p>
                <p className="text-xs text-gray-500">Overtime</p>
              </div>
            </div>
          </div>

          {/* Admin user table */}
          <div className="card overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
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

            <div className="overflow-x-auto">
            <div className="divide-y divide-gray-50 min-w-[700px]">
              {userStatuses.length === 0 && (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">No users found</div>
              )}
              {userStatuses.map(({ user: u, records, weekdayRecords, weekendRecords, submittedDays, missedDays, weekendHours }) => {
                const relevantDaysForUser = isCurrentPeriod ? pastWorkDays : workDays;
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
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

          {myMissedDays.length > 0 && isCurrentPeriod && (
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
