import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { AttendanceRecord, User, Timesheet } from '../types';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, parseISO, startOfWeek, addDays,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, Edit2, Zap, X,
  Users, User as UserIcon, PenLine, Send, Lock, Clock,
} from 'lucide-react';
import SignaturePicker from '../components/SignaturePicker';

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-400',
  'half-day': 'bg-amber-400',
  leave: 'bg-blue-400',
};

const STATUS_CELL: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-800',
  absent: 'bg-red-100 text-red-700',
  'half-day': 'bg-amber-100 text-amber-800',
  leave: 'bg-blue-100 text-blue-700',
};
const STATUS_BADGE: Record<string, string> = {
  present: 'badge-green',
  absent: 'badge-red',
  'half-day': 'badge-yellow',
  leave: 'badge-blue',
};

interface EditForm {
  date: string;
  clock_in: string;
  clock_out: string;
  break_minutes: number;
  extra_hours: number;
  extra_start: string;
  extra_end: string;
  status: string;
  notes: string;
  user_id?: number;
}

const blank = (date: string): EditForm => ({
  date, clock_in: '08:00', clock_out: '16:00',
  break_minutes: 0, extra_hours: 0, extra_start: '', extra_end: '',
  status: 'present', notes: '',
});

function calcExtra(s: string, e: string) {
  if (!s || !e) return 0;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return Math.max(0, Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 10) / 10);
}

function wMon(d: Date) { return startOfWeek(d, { weekStartsOn: 1 }); }
function wSun(d: Date) { return addDays(startOfWeek(d, { weekStartsOn: 1 }), 6); }

export default function Attendance() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin';
  const today = new Date();

  // ── shared modal ──
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState<EditForm>(blank(format(today, 'yyyy-MM-dd')));
  const [saving, setSaving] = useState(false);

  // ── user view ──
  const [activeTab, setActiveTab] = useState<'attendance' | 'log' | 'signoff'>('attendance');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [userWeek, setUserWeek] = useState(wMon(today));   // week being viewed/signed in the strip
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allReports, setAllReports] = useState<Timesheet[]>([]);  // all user's submitted reports
  const [showSigPicker, setShowSigPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showWeekendSigPicker, setShowWeekendSigPicker] = useState(false);
  const [submittingWeekend, setSubmittingWeekend] = useState(false);

  // ── manager view ──
  const [managerWeek, setManagerWeek] = useState(wMon(today));
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submittedReports, setSubmittedReports] = useState<Timesheet[]>([]);
  const [weekRecords, setWeekRecords] = useState<AttendanceRecord[]>([]);

  // ─── USER: load month records ───
  const loadUserRecords = useCallback(async () => {
    if (isManager) return;
    const res = await api.get('/attendance', {
      params: { month: format(currentMonth, 'M'), year: format(currentMonth, 'yyyy') }
    }).catch(() => null);
    setRecords(res?.data.records ?? []);
  }, [currentMonth, isManager]);

  useEffect(() => { loadUserRecords(); }, [loadUserRecords]);


  // ─── USER: load attendance reports (to lock submitted weeks) ───
  const loadUserReports = useCallback(async () => {
    if (isManager) return;
    const { data } = await api.get('/timesheets').catch(() => ({ data: { timesheets: [] } }));
    setAllReports(data.timesheets);
  }, [isManager]);

  useEffect(() => { loadUserReports(); }, [loadUserReports]);

  const isLocked = (date: Date) => {
    if (isManager) return false;
    const ds = format(date, 'yyyy-MM-dd');
    return allReports.some(
      t => (t.status === 'submitted' || t.status === 'signed') && ds >= t.period_start && ds <= t.period_end
    );
  };

  // ─── MANAGER: load users ───
  useEffect(() => {
    if (!isManager) return;
    api.get('/users').then(({ data }) => {
      const list: User[] = data.users.filter((u: User) => u.is_active && u.role !== 'admin');
      setUsers(list);
      if (!selectedUser && list.length > 0) setSelectedUser(list[0]);
    });
  }, [isManager]);

  // ─── MANAGER: load submitted reports for the selected week ───
  const loadManagerReports = useCallback(async () => {
    if (!isManager) return;
    const { data } = await api.get('/timesheets').catch(() => ({ data: { timesheets: [] } }));
    const wm = format(managerWeek, 'yyyy-MM-dd');
    const wf = format(wSun(managerWeek), 'yyyy-MM-dd');
    setSubmittedReports(
      data.timesheets.filter((t: Timesheet) =>
        t.period_start === wm && t.period_end === wf &&
        (t.status === 'submitted' || t.status === 'signed')
      )
    );
  }, [isManager, managerWeek]);

  useEffect(() => { loadManagerReports(); }, [loadManagerReports]);

  // ─── MANAGER: load selected user's week records (always, regardless of submission) ───
  const loadManagerWeekRecords = useCallback(async () => {
    if (!isManager || !selectedUser) return;
    const res = await api.get('/attendance', {
      params: {
        user_id: selectedUser.id,
        start_date: format(addDays(managerWeek, -2), 'yyyy-MM-dd'), // Sat
        end_date:   format(addDays(managerWeek,  4), 'yyyy-MM-dd'), // Fri
      }
    }).catch(() => null);
    setWeekRecords(res?.data.records ?? []);
  }, [isManager, selectedUser, managerWeek]);

  useEffect(() => { loadManagerWeekRecords(); }, [loadManagerWeekRecords]);

  // ─── open modal ───
  const openModal = (date: Date) => {
    if (!isManager && isLocked(date)) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const srcRecords = isManager ? weekRecords : records;
    const existing = srcRecords.find(r => isSameDay(parseISO(r.date + 'T00:00:00'), date));
    if (existing) {
      setEditRecord(existing);
      setForm({
        date: dateStr,
        clock_in: existing.clock_in || '08:00',
        clock_out: existing.clock_out || '16:00',
        break_minutes: existing.break_minutes || 0,
        extra_hours: existing.extra_hours || 0,
        extra_start: existing.extra_start || '',
        extra_end: existing.extra_end || '',
        status: existing.status,
        notes: existing.notes || '',
        user_id: isManager ? selectedUser?.id : user?.id,
      });
    } else {
      setEditRecord(null);
      setForm({ ...blank(dateStr), user_id: isManager ? selectedUser?.id : user?.id });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.extra_start && form.extra_end) payload.extra_hours = calcExtra(form.extra_start, form.extra_end);
      if (editRecord) await api.put(`/attendance/${editRecord.id}`, payload);
      else await api.post('/attendance', payload);
      setShowModal(false);
      isManager ? loadManagerWeekRecords() : loadUserRecords();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Error' : 'Error';
      alert(msg);
    } finally { setSaving(false); }
  };

  const handleSignAndSubmit = async (signatureId: number) => {
    setSubmitting(true);
    try {
      const start = format(userWeek, 'yyyy-MM-dd');
      const end = format(wSun(userWeek), 'yyyy-MM-dd');
      const existing = allReports.find(t => t.period_start === start && t.period_end === end);
      let tsId = existing?.id;
      if (!tsId) {
        const { data } = await api.post('/timesheets', { period_start: start, period_end: end });
        tsId = data.timesheet.id;
      }
      await api.post(`/timesheets/${tsId}/submit`, { signature_id: signatureId });
      setShowSigPicker(false);
      loadUserReports();
    } finally { setSubmitting(false); }
  };

  const handleWeekendSignAndSubmit = async (signatureId: number) => {
    setSubmittingWeekend(true);
    try {
      const sat = addDays(userWeek, -2);
      const sun = addDays(userWeek, -1);
      const start = format(sat, 'yyyy-MM-dd');
      const end   = format(sun, 'yyyy-MM-dd');
      const existing = allReports.find(t => t.period_start === start && t.period_end === end);
      let tsId = existing?.id;
      if (!tsId) {
        const { data } = await api.post('/timesheets', { period_start: start, period_end: end });
        tsId = data.timesheet.id;
      }
      await api.post(`/timesheets/${tsId}/submit`, { signature_id: signatureId });
      setShowWeekendSigPicker(false);
      loadUserReports();
    } finally { setSubmittingWeekend(false); }
  };

  // ─── Shared modal component ───
  const AttendanceModal = () => {
    const computed = form.extra_start && form.extra_end ? calcExtra(form.extra_start, form.extra_end) : null;
    const who = isManager ? selectedUser?.name : user?.name;
    const formDow = form.date ? new Date(form.date + 'T00:00:00').getDay() : -1;
    const isWeekendForm = formDow === 0 || formDow === 6;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className={`px-6 py-5 border-b flex items-center justify-between ${isWeekendForm ? 'border-violet-100 bg-violet-50' : 'border-gray-100'}`}>
            <div>
              <h2 className="font-semibold text-gray-900">
                {isWeekendForm ? '🗓 Weekend Work' : (editRecord ? 'Edit' : 'Add') + ' Attendance'}
              </h2>
              <p className={`text-xs mt-0.5 ${isWeekendForm ? 'text-violet-500' : 'text-gray-400'}`}>
                {who} · {form.date}
                {isWeekendForm && ' · Hours counted as overtime'}
              </p>
            </div>
            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          {isWeekendForm && (
            <div className="mx-6 mt-4 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700">
              Weekend entries are <strong>optional</strong> and not required for sign-off. All hours logged here are counted as overtime.
            </div>
          )}

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Start Time</label>
                <input type="time" className="input" value={form.clock_in}
                  onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))} /></div>
              <div><label className="label">End Time</label>
                <input type="time" className="input" value={form.clock_out}
                  onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))} /></div>
            </div>
            <div><label className="label">Break (minutes)</label>
              <input type="number" min="0" className="input" value={form.break_minutes}
                onChange={e => setForm(f => ({ ...f, break_minutes: Number(e.target.value) }))} /></div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700"><Zap size={14} /> Additional / Extra Hours</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label text-amber-700">Extra Start</label>
                  <input type="time" className="input" value={form.extra_start}
                    onChange={e => setForm(f => ({ ...f, extra_start: e.target.value }))} /></div>
                <div><label className="label text-amber-700">Extra End</label>
                  <input type="time" className="input" value={form.extra_end}
                    onChange={e => setForm(f => ({ ...f, extra_end: e.target.value }))} /></div>
              </div>
              {computed !== null && computed > 0
                ? <p className="text-xs text-amber-600 font-medium">= {computed}h extra</p>
                : <p className="text-xs text-amber-500">Leave blank if no extra hours</p>}
            </div>

            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="present">Present</option>
                {!isWeekendForm && <option value="absent">Absent</option>}
                {!isWeekendForm && <option value="half-day">Half Day</option>}
                <option value="leave">Leave / Off</option>
              </select></div>
            <div><label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." /></div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════
  // REGULAR USER VIEW
  // ════════════════════════════════
  if (!isManager) {
    const curWFri = addDays(userWeek, 4);           // Friday — for Mon–Fri day cards
    const curWEnd = wSun(userWeek);                 // Sunday — timesheet period end
    const weekDays = eachDayOfInterval({ start: userWeek, end: curWFri });
    const isCurrentWeek = isSameDay(userWeek, wMon(today));

    // Find report for the selected week (Mon–Sun period)
    const wm = format(userWeek, 'yyyy-MM-dd');
    const wf = format(curWEnd, 'yyyy-MM-dd');
    const selectedWeekReport = allReports.find(t => t.period_start === wm && t.period_end === wf) ?? null;
    const isSigned = selectedWeekReport?.status === 'submitted' || selectedWeekReport?.status === 'signed';

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const pad = getDay(monthStart);

    const getRecord = (d: Date) => records.find(r => isSameDay(parseISO(r.date + 'T00:00:00'), d));
    const presentCount = records.filter(r => r.status === 'present').length;
    const totalHours = records.reduce((s, r) => s + (r.regular_hours || 0) + (r.extra_hours || 0), 0);

    // Pending sign-offs (submitted=false) count across all weeks for badge
    const unsignedCount = (() => {
      // check last 4 weeks including current
      let count = 0;
      for (let i = 0; i < 4; i++) {
        const wm = format(addDays(wMon(today), -7 * i), 'yyyy-MM-dd');
        const wf = format(addDays(wMon(today), -7 * i + 6), 'yyyy-MM-dd');
        const found = allReports.find(t => t.period_start === wm && t.period_end === wf);
        if (!found || (found.status !== 'submitted' && found.status !== 'signed')) count++;
      }
      return count;
    })();

    return (
      <div className="p-4 sm:p-6">
        {/* ── Page header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track your daily hours and submit weekly sign-offs</p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-7 overflow-x-auto max-w-full">
          {([
            { key: 'attendance', label: 'Calendar' },
            { key: 'log',        label: 'Attendance Log' },
            { key: 'signoff',    label: 'Weekly Sign-off', badge: unsignedCount },
          ] as { key: typeof activeTab; label: string; badge?: number }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ══ TAB: Calendar ══ */}
        {activeTab === 'attendance' && (
          <div>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-gray-800">Monthly Calendar</h2>
              <p className="text-xs text-gray-400 mt-0.5">Click any date to add or edit an entry</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <button onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))} className="btn-secondary p-1.5">
                  <ChevronLeft size={15} />
                </button>
                <div className="text-center">
                  <p className="font-semibold text-gray-800">{format(currentMonth, 'MMMM yyyy')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{presentCount} present · {totalHours.toFixed(1)}h logged</p>
                </div>
                <button onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))} className="btn-secondary p-1.5">
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-7 mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array(pad).fill(null).map((_, i) => <div key={`p${i}`} />)}
                  {days.map(day => {
                    const rec = getRecord(day);
                    const isToday = isSameDay(day, today);
                    const locked = isLocked(day);
                    const dow = day.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const cellColor = rec ? (STATUS_CELL[rec.status] || 'bg-gray-100 text-gray-700') : '';
                    return (
                      <button key={day.toISOString()} onClick={() => openModal(day)} disabled={locked}
                        className={`flex flex-col items-center justify-center rounded-lg min-h-[52px] text-xs transition-all
                          ${rec
                            ? (isWeekend ? 'bg-violet-100 text-violet-800' : cellColor)
                            : isWeekend
                              ? 'bg-violet-50 hover:bg-violet-100 text-violet-300'
                              : 'bg-white hover:bg-gray-50'}
                          ${isToday ? 'ring-2 ring-indigo-400' : ''}
                          ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <span className={`font-bold text-sm ${isToday && !rec ? 'text-indigo-600' : ''}`}>{format(day, 'd')}</span>
                        {!rec && isWeekend && <span className="text-[9px] text-violet-300 font-medium mt-0.5">{format(day, 'EEE')}</span>}
                        {rec?.extra_hours ? <span className="text-[10px] font-medium mt-0.5 opacity-70">+{rec.extra_hours}h</span> : null}
                        {rec && isWeekend ? <span className="text-[9px] font-semibold mt-0.5 opacity-60">OT</span> : null}
                        {!rec && locked && !isWeekend && <Lock size={9} className="text-gray-300 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                  {Object.entries(STATUS_CELL).map(([s, c]) => (
                    <div key={s} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${c}`}>
                      <span className="capitalize font-medium">{s}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-violet-100 text-violet-700">
                    <span className="font-medium">Weekend OT</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: Attendance Log ══ */}
        {activeTab === 'log' && (
          <div>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-gray-800">Attendance Log</h2>
              <p className="text-xs text-gray-400 mt-0.5">{format(currentMonth, 'MMMM yyyy')} — all entries</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))} className="btn-secondary p-1.5">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-sm font-semibold text-gray-700">{format(currentMonth, 'MMMM yyyy')}</span>
                  <button onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))} className="btn-secondary p-1.5">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <span className="text-xs text-gray-400">{records.length} record{records.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      {['Start', 'End', 'Break', 'Regular', 'Extra', 'Status', 'Notes', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">No records for {format(currentMonth, 'MMMM yyyy')}</td></tr>
                    ) : [...records].sort((a, b) => a.date.localeCompare(b.date)).map(r => {
                      const locked = isLocked(parseISO(r.date + 'T00:00:00'));
                      const recDow = parseISO(r.date + 'T00:00:00').getDay();
                      const isWeekendRec = recDow === 0 || recDow === 6;
                      return (
                        <tr key={r.id} className={`hover:bg-gray-50 ${isWeekendRec ? 'bg-violet-50/50' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              {format(parseISO(r.date + 'T00:00:00'), 'EEE, MMM d')}
                              {isWeekendRec && <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">Weekend</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{r.clock_in || '08:00'}</td>
                          <td className="px-4 py-2.5 text-gray-600">{r.clock_out || '16:00'}</td>
                          <td className="px-4 py-2.5 text-gray-500">{r.break_minutes ? `${r.break_minutes}m` : '—'}</td>
                          <td className="px-4 py-2.5 font-medium">{(r.regular_hours || 8).toFixed(1)}h</td>
                          <td className="px-4 py-2.5">
                            {r.extra_hours ? (
                              <span className="text-amber-600 font-medium flex items-center gap-1">
                                <Zap size={11} />+{r.extra_hours}h
                                {r.extra_start && r.extra_end && <span className="text-amber-400 text-[11px]"> ({r.extra_start}–{r.extra_end})</span>}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5"><span className={STATUS_BADGE[r.status] || 'badge-gray'}>{r.status}</span></td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[140px] truncate">{r.notes || ''}</td>
                          <td className="px-4 py-2.5">
                            {locked
                              ? <Lock size={13} className="text-gray-300" />
                              : <button onClick={() => openModal(parseISO(r.date + 'T00:00:00'))} className="text-indigo-500 hover:text-indigo-700"><Edit2 size={14} /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: Weekly Sign-off ══ */}
        {activeTab === 'signoff' && (() => {
          const pastWeekDays = weekDays.filter(d => d <= today);
          const missingDays  = pastWeekDays.filter(d => !getRecord(d));
          const canSign      = !isSigned && missingDays.length === 0 && pastWeekDays.length > 0;

          const totalRegular = weekDays.reduce((s, d) => s + (getRecord(d)?.regular_hours || 0), 0);
          const totalExtra   = weekDays.reduce((s, d) => s + (getRecord(d)?.extra_hours || 0), 0);
          const daysLogged   = weekDays.filter(d => getRecord(d)).length;

          // Always show the weekend BEFORE the viewed week (prev Sat/Sun)
          const weekendDays = [addDays(userWeek, -2), addDays(userWeek, -1)];
          const weSatStr = format(weekendDays[0], 'yyyy-MM-dd');
          const weSunStr = format(weekendDays[1], 'yyyy-MM-dd');
          const weekendTs = allReports.find(t => t.period_start === weSatStr && t.period_end === weSunStr);
          const isWeekendSigned = weekendTs?.status === 'submitted' || weekendTs?.status === 'signed';
          const weekendOT   = weekendDays.reduce((s, d) => s + (getRecord(d)?.regular_hours || 0) + (getRecord(d)?.extra_hours || 0), 0);
          const canSignWeekend = !isWeekendSigned && weekendDays.some(d => getRecord(d));

          const DayRow = ({ day, isWeekend = false, locked: rowLocked = false }: { day: Date; isWeekend?: boolean; locked?: boolean }) => {
            const rec       = getRecord(day);
            const isToday   = isSameDay(day, today);
            const isMissing = !isWeekend && !rec && day <= today && !isSigned;
            const rowIsLocked = isSigned || rowLocked;
            return (
              <div className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0
                ${isMissing ? 'bg-red-50' : isToday ? 'bg-indigo-50/30' : isWeekend ? 'bg-violet-50/30' : 'hover:bg-gray-50/60'}`}>

                <div className="w-24 shrink-0">
                  <span className={`text-xs font-semibold ${isToday ? 'text-indigo-600' : isMissing ? 'text-red-500' : 'text-gray-700'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className="text-xs text-gray-400 ml-1.5">{format(day, 'MMM d')}</span>
                </div>

                <div className="w-20 shrink-0">
                  {rec
                    ? <span className={`badge ${STATUS_BADGE[rec.status] || 'badge-gray'}`}>{rec.status}</span>
                    : isMissing
                      ? <span className="text-xs text-red-400 font-medium">Missing</span>
                      : day > today
                        ? <span className="text-xs text-gray-300">Upcoming</span>
                        : <span className="text-xs text-gray-400">{isWeekend ? 'Not logged' : '—'}</span>}
                </div>

                <div className="flex-1 text-xs text-gray-500">
                  {rec?.clock_in && rec?.clock_out
                    ? <>{rec.clock_in} – {rec.clock_out}{rec.break_minutes ? <span className="text-gray-400 ml-1.5">{rec.break_minutes}m break</span> : null}</>
                    : null}
                </div>

                <div className="w-24 text-right shrink-0">
                  {rec ? (
                    isWeekend ? (
                      <span className="text-xs font-semibold text-amber-600">
                        {((rec.regular_hours || 0) + (rec.extra_hours || 0)).toFixed(1)}h OT
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-700">
                        {(rec.regular_hours || 0).toFixed(1)}h
                        {rec.extra_hours ? <span className="text-amber-600 ml-1.5">+{rec.extra_hours}h</span> : null}
                      </span>
                    )
                  ) : null}
                  {isWeekend && !rec && <span className="text-xs text-gray-300">—</span>}
                </div>

                <div className="w-10 flex justify-end shrink-0">
                  {rowIsLocked
                    ? <Lock size={12} className="text-gray-300" />
                    : <button onClick={() => openModal(day)}
                        className="p-1 rounded text-gray-300 hover:text-indigo-500 transition-colors"
                        title={rec ? 'Edit' : 'Add'}>
                        {rec ? <Edit2 size={13} /> : <span className="text-sm leading-none font-bold">+</span>}
                      </button>}
                </div>
              </div>
            );
          };

          return (
            <>
              {/* ── Card 1: Weekend sign-off (optional, shown first — previous weekend always) ── */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">
                        Weekend · {format(weekendDays[0], 'MMM d')} – {format(weekendDays[1], 'MMM d, yyyy')}
                      </p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">Optional</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Previous weekend · all hours counted as overtime
                    </p>
                  </div>

                  {weekendOT > 0 && (
                    <div className="text-right shrink-0 pl-4 border-l border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Weekend OT</p>
                      <p className="text-sm font-bold text-amber-600">{weekendOT.toFixed(1)}h</p>
                    </div>
                  )}

                  {isWeekendSigned ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-semibold text-emerald-700 shrink-0">
                      <PenLine size={14} /> Signed
                    </div>
                  ) : (
                    <button
                      onClick={() => canSignWeekend && setShowWeekendSigPicker(true)}
                      disabled={!canSignWeekend || submittingWeekend}
                      title={!canSignWeekend ? 'Log at least one weekend day to sign' : ''}
                      className="btn-secondary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Send size={14} /> Sign Weekend
                    </button>
                  )}
                </div>

                <div className="px-5 py-2 bg-violet-50 border-b border-violet-100">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest">
                    Weekend Overtime · {format(weekendDays[0], 'MMM d')}–{format(weekendDays[1], 'd')}
                  </p>
                </div>
                {weekendDays.map(day => <DayRow key={day.toISOString()} day={day} isWeekend locked={isWeekendSigned} />)}
              </div>

              {/* ── Card 2: Weekday sign-off (Mon–Fri, mandatory) ── */}
              <div className="card overflow-hidden mt-4">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => { const p = addDays(userWeek, -7); setUserWeek(p); setCurrentMonth(p); }}
                      className="btn-secondary p-1.5"><ChevronLeft size={14} /></button>
                    <div className="text-center min-w-[170px]">
                      <p className="text-sm font-semibold text-gray-800">
                        {format(userWeek, 'MMM d')} – {format(curWEnd, 'MMM d, yyyy')}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {isCurrentWeek ? 'Current week' : 'Past week'}
                      </p>
                    </div>
                    <button onClick={() => { const n = addDays(userWeek, 7); setUserWeek(n); setCurrentMonth(n); }}
                      disabled={isCurrentWeek} className="btn-secondary p-1.5 disabled:opacity-30">
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-5 flex-1 pl-4 border-l border-gray-100">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Regular</p>
                      <p className="text-sm font-bold text-gray-800">{totalRegular.toFixed(1)}h</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Overtime</p>
                      <p className="text-sm font-bold text-amber-600">{totalExtra.toFixed(1)}h</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Days</p>
                      <p className={`text-sm font-bold ${missingDays.length > 0 && !isSigned ? 'text-red-500' : 'text-gray-800'}`}>
                        {daysLogged}/5
                      </p>
                    </div>
                  </div>

                  {isSigned ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-semibold text-emerald-700 shrink-0">
                      <PenLine size={14} /> Signed
                    </div>
                  ) : (
                    <button onClick={() => canSign && setShowSigPicker(true)}
                      disabled={!canSign || submitting}
                      title={missingDays.length > 0 ? `Fill in ${missingDays.length} missing day(s) first` : ''}
                      className="btn-primary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Send size={14} /> Sign & Submit
                    </button>
                  )}
                </div>

                {!isSigned && missingDays.length > 0 && (
                  <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                    <span className="text-amber-500 text-sm">⚠</span>
                    <p className="text-xs text-amber-700">
                      Missing: <span className="font-semibold">{missingDays.map(d => format(d, 'EEE MMM d')).join(', ')}</span>
                      {' — '}
                      <button className="underline" onClick={() => setActiveTab('attendance')}>add in Calendar</button>
                    </p>
                  </div>
                )}

                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Weekdays · Mon–Fri</p>
                </div>
                {weekDays.map(day => <DayRow key={day.toISOString()} day={day} />)}
              </div>
            </>
          );
        })()}

        {showModal && <AttendanceModal />}
        {showSigPicker && <SignaturePicker onConfirm={handleSignAndSubmit} onClose={() => setShowSigPicker(false)} />}
        {showWeekendSigPicker && <SignaturePicker onConfirm={handleWeekendSignAndSubmit} onClose={() => setShowWeekendSigPicker(false)} />}
      </div>
    );
  }

  // ════════════════════════════════
  // MANAGER / ADMIN VIEW
  // ════════════════════════════════
  const mwSat = addDays(managerWeek, -2); // period start: previous Saturday
  const mwFri = addDays(managerWeek,  4); // period end:   this Friday
  const weekDays = eachDayOfInterval({ start: managerWeek, end: mwFri });
  const isCurrentPeriod = isSameDay(managerWeek, wMon(today));
  const mgrTodayStr = format(today, 'yyyy-MM-dd');
  const handleManagerPeriodChange = (value: string) => {
    if (!value) return;
    const d = parseISO(value);
    const day = d.getDay();
    const sat = addDays(d, day === 6 ? 0 : -(day + 1));
    setManagerWeek(addDays(sat, 2));
  };
  const selectedReport = selectedUser ? submittedReports.find(t => t.user_id === selectedUser.id) : null;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">View submitted attendance by week</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <button onClick={() => setManagerWeek(d => addDays(d, -7))}
              className="px-2.5 py-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700 border-r border-gray-100 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1 px-2.5 py-1.5">
              <input
                type="date"
                value={format(mwSat, 'yyyy-MM-dd')}
                max={mgrTodayStr}
                onChange={e => handleManagerPeriodChange(e.target.value)}
                className="text-sm text-gray-700 outline-none bg-transparent w-[116px] cursor-pointer"
              />
              <span className="text-gray-300 text-xs select-none">–</span>
              <input
                type="date"
                value={format(mwFri, 'yyyy-MM-dd')}
                readOnly
                className="text-sm text-gray-500 outline-none bg-transparent w-[116px] cursor-default"
              />
            </div>
            <button onClick={() => setManagerWeek(d => addDays(d, 7))} disabled={isCurrentPeriod}
              className="px-2.5 py-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700 border-l border-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16} />
            </button>
          </div>
          {!isCurrentPeriod && (
            <button onClick={() => setManagerWeek(wMon(today))} className="btn-secondary text-xs py-1.5 px-3">
              This Week
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-5">
        {/* Users sidebar */}
        <div className="w-full md:w-56 md:shrink-0">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Users size={14} className="text-indigo-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Employees</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[calc(100vh-260px)] overflow-y-auto">
              {users.map(u => {
                const submitted = submittedReports.some(t => t.user_id === u.id);
                const active = selectedUser?.id === u.id;
                return (
                  <button key={u.id} onClick={() => setSelectedUser(u)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-gray-50
                      ${active ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold
                      ${active ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {u.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${active ? 'text-indigo-700' : 'text-gray-800'}`}>{u.name}</p>
                      {submitted
                        ? <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5"><PenLine size={9} /> Submitted</span>
                        : <span className="text-[11px] text-amber-500 flex items-center gap-0.5"><Clock size={9} /> Pending</span>}
                    </div>
                  </button>
                );
              })}
              {users.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-400 text-xs">
                  <UserIcon size={20} className="mx-auto mb-1 opacity-40" />No users
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        {!selectedUser ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center"><Users size={36} className="mx-auto mb-2 opacity-30" /><p>Select an employee</p></div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 space-y-4">
            {/* User card + Signature */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-700 font-semibold">{selectedUser.name.charAt(0)}</span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{selectedUser.name}</h2>
                      <p className="text-xs text-gray-500">{selectedUser.department || selectedUser.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedReport
                      ? <span className="badge-green flex items-center gap-1"><PenLine size={10} /> Signed & Submitted</span>
                      : <span className="badge-yellow flex items-center gap-1"><Clock size={10} /> Not yet submitted</span>
                    }
                    <span className="text-xs text-gray-400">{format(mwSat, 'MMM d')} – {format(mwFri, 'MMM d, yyyy')}</span>
                  </div>
                </div>
                {selectedReport?.signature_data && (
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Signature</p>
                    <div className="border border-gray-200 rounded-xl p-2 bg-gray-50 inline-block">
                      <img src={selectedReport.signature_data} alt="signature" className="h-16 w-44 object-contain" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Week records table — Mon–Sun */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Attendance — {format(mwSat, 'MMM d')} to {format(mwFri, 'MMM d')}</h3>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Edit2 size={11} /> Click pencil to edit any record
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Day', 'Start', 'End', 'Break', 'Regular', 'Extra', 'Status', 'Notes', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* Weekend first — Sat + Sun (start of period) */}
                    <tr>
                      <td colSpan={9} className="px-4 py-1.5 bg-violet-50 border-b border-violet-100">
                        <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest">Weekend — Overtime</span>
                      </td>
                    </tr>
                    {[addDays(managerWeek, -2), addDays(managerWeek, -1)].map(day => {
                      const rec = weekRecords.find(r => isSameDay(parseISO(r.date + 'T00:00:00'), day));
                      const isToday = isSameDay(day, today);
                      return (
                        <tr key={day.toISOString()} className={`bg-violet-50/40 hover:bg-violet-50 ${isToday ? 'bg-indigo-50' : ''}`}>
                          <td className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-2">
                              <span className={isToday ? 'text-indigo-600' : 'text-violet-700'}>{format(day, 'EEE, MMM d')}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded">OT</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{rec ? (rec.clock_in || '08:00') : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-gray-600">{rec ? (rec.clock_out || '16:00') : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-gray-500">{rec?.break_minutes ? `${rec.break_minutes}m` : '—'}</td>
                          <td className="px-4 py-3 font-medium text-violet-700">{rec ? `${(rec.regular_hours || 0).toFixed(1)}h` : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3">
                            {rec?.extra_hours ? (
                              <span className="text-amber-600 font-medium flex items-center gap-1">
                                <Zap size={11} />+{rec.extra_hours}h
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {rec ? <span className={STATUS_BADGE[rec.status] || 'badge-gray'}>{rec.status}</span> : <span className="text-gray-300 text-xs">Not logged</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-[120px] truncate">{rec?.notes || ''}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => openModal(day)} className="text-violet-500 hover:text-violet-700" title="Log/edit weekend">
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Weekdays Mon–Fri */}
                    <tr>
                      <td colSpan={9} className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Weekdays — Mon–Fri</span>
                      </td>
                    </tr>
                    {weekDays.map(day => {
                      const rec = weekRecords.find(r => isSameDay(parseISO(r.date + 'T00:00:00'), day));
                      const isToday = isSameDay(day, today);
                      return (
                        <tr key={day.toISOString()} className={`hover:bg-gray-50 ${isToday ? 'bg-indigo-50' : ''}`}>
                          <td className="px-4 py-3 font-medium">
                            <span className={isToday ? 'text-indigo-600' : 'text-gray-900'}>{format(day, 'EEE, MMM d')}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{rec ? (rec.clock_in || '08:00') : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-gray-600">{rec ? (rec.clock_out || '16:00') : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-gray-500">{rec?.break_minutes ? `${rec.break_minutes}m` : '—'}</td>
                          <td className="px-4 py-3 font-medium">{rec ? `${(rec.regular_hours || 8).toFixed(1)}h` : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3">
                            {rec?.extra_hours ? (
                              <span className="text-amber-600 font-medium flex items-center gap-1">
                                <Zap size={11} />+{rec.extra_hours}h
                                {rec.extra_start && rec.extra_end && <span className="text-amber-400 text-[11px]"> ({rec.extra_start}–{rec.extra_end})</span>}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {rec ? <span className={STATUS_BADGE[rec.status] || 'badge-gray'}>{rec.status}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-[120px] truncate">{rec?.notes || ''}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => openModal(day)} className="text-indigo-500 hover:text-indigo-700" title="Edit record">
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && <AttendanceModal />}
    </div>
  );
}
