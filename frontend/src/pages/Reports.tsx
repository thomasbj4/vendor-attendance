import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { AttendanceRecord, User, Timesheet } from '../types';
import { format, parseISO } from 'date-fns';
import { FileSpreadsheet, Filter, Zap, FileCheck, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 25;

const STATUS_BADGE: Record<string, string> = {
  present: 'badge-green',
  absent: 'badge-red',
  'half-day': 'badge-yellow',
  leave: 'badge-blue',
};

const TS_STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  signed:    'bg-emerald-100 text-emerald-700',
  draft:     'bg-gray-100 text-gray-500',
};

export default function Reports() {
  const [records,    setRecords]    = useState<AttendanceRecord[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [users,      setUsers]      = useState<User[]>([]);
  const [exporting,  setExporting]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [tsLoading,  setTsLoading]  = useState(false);
  const [page,       setPage]       = useState(1);
  const getWeekRange = () => {
    const today = new Date();
    const day = today.getDay(); // 0 Sun … 6 Sat
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { start: fmt(monday), end: fmt(sunday) };
  };

  const [filters, setFilters] = useState(() => ({ user_id: '', status: '', ...getWeekRange() }));

  // Load non-admin users for filter dropdown
  useEffect(() => {
    api.get('/users').then(({ data }) => {
      setUsers(data.users.filter((u: User) => u.role !== 'admin'));
    }).catch(() => {});
  }, []);

  // Load attendance records
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.user_id) params.user_id     = filters.user_id;
      if (filters.status)  params.status      = filters.status;
      if (filters.start)   params.start_date  = filters.start;
      if (filters.end)     params.end_date    = filters.end;
      const { data } = await api.get('/attendance', { params });
      setRecords(data.records.filter((r: AttendanceRecord & { user_email?: string }) =>
        !users.find(u => u.id === r.user_id && u.role === 'admin')
      ));
    } finally { setLoading(false); }
  }, [filters, users]);

  // Load submitted/signed timesheets for the date range
  const loadTimesheets = useCallback(async () => {
    setTsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.user_id) params.user_id = filters.user_id;
      const { data } = await api.get('/timesheets', { params });
      let ts: Timesheet[] = data.timesheets.filter(
        (t: Timesheet) => t.status === 'submitted' || t.status === 'signed'
      );
      // Filter by date range overlap
      if (filters.start) ts = ts.filter(t => t.period_end   >= filters.start);
      if (filters.end)   ts = ts.filter(t => t.period_start <= filters.end);
      setTimesheets(ts);
    } finally { setTsLoading(false); }
  }, [filters]);

  useEffect(() => { if (users.length >= 0) { load(); loadTimesheets(); } }, [load, loadTimesheets]);
  useEffect(() => { setPage(1); }, [filters]);

  const doExport = async () => {
    if (timesheets.filter(t => t.status === 'submitted').length === 0 && timesheets.length === 0) {
      alert('No submitted timesheets found. Employees must submit their timesheets before exporting.');
      return;
    }
    setExporting(true);
    try {
      const body: Record<string, unknown> = {};
      if (filters.user_id) body.user_ids  = [parseInt(filters.user_id)];
      if (filters.start)   body.start_date = filters.start;
      if (filters.end)     body.end_date   = filters.end;

      const res = await api.post('/export/attendance', body, { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      const cd   = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      link.download = match ? match[1] : 'attendance-report.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
      // Refresh timesheets to show signed status
      loadTimesheets();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: Blob } }).response?.data;
      if (errData instanceof Blob) {
        const text = await errData.text();
        try { alert(JSON.parse(text).error); } catch { alert('Export failed.'); }
      } else {
        alert('Export failed. Make sure employees have submitted timesheets for this period.');
      }
    } finally { setExporting(false); }
  };

  // Build a map from user_id to their timesheet status (for the record table)
  const tsStatusByUser = new Map<number, string>();
  for (const t of timesheets) {
    if (!tsStatusByUser.has(t.user_id) || t.status === 'signed') {
      tsStatusByUser.set(t.user_id, t.status);
    }
  }

  const submittedCount  = timesheets.filter(t => t.status === 'submitted').length;
  const signedCount     = timesheets.filter(t => t.status === 'signed').length;
  const totalHours      = records.reduce((s, r) => s + (r.regular_hours || 0) + (r.extra_hours || 0), 0);
  const uniqueUsers     = new Set(records.map(r => r.user_id)).size;

  const canExport = timesheets.some(t => t.status === 'submitted' || t.status === 'signed');
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const paginatedRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Export is available only for submitted timesheets</p>
        </div>
        <button
          onClick={doExport}
          disabled={exporting || !canExport}
          title={!canExport ? 'No submitted timesheets in the selected range' : 'Export to Excel'}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet size={15} />
          {exporting ? 'Exporting...' : 'Export to Excel'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Employees',      value: uniqueUsers },
          { label: 'Total Records',  value: records.length },
          { label: 'Submitted',      value: submittedCount, color: 'text-blue-600' },
          { label: 'Signed',         value: signedCount,    color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Filters</span>
          {(filters.user_id || filters.status || filters.start || filters.end) && (
            <button
              onClick={() => setFilters({ user_id: '', status: '', ...getWeekRange() })}
              className="ml-auto text-xs text-indigo-600 hover:text-indigo-800"
            >Clear all</button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="label">Employee</label>
            <select className="input" value={filters.user_id}
              onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
              <option value="">All Employees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Att. Status</label>
            <select className="input" value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="half-day">Half Day</option>
              <option value="leave">Leave</option>
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.start}
              onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.end}
              onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Submitted/Signed Timesheets */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <FileCheck size={15} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-700">Timesheets</span>
          {tsLoading && <RefreshCw size={12} className="animate-spin text-gray-400 ml-1" />}
          <span className="text-xs text-gray-400 ml-1">
            {timesheets.length} timesheet{timesheets.length !== 1 ? 's' : ''} in range
          </span>
          {!canExport && !tsLoading && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertCircle size={11} /> No submitted timesheets — export locked
            </span>
          )}
        </div>
        {timesheets.length === 0 && !tsLoading ? (
          <div className="px-5 py-6 text-center text-sm text-gray-400">
            No submitted or signed timesheets for this filter. Export is not available until employees submit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Employee','Period','Regular Hrs','Extra Hrs','Total Hrs','Status','Signed At'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {timesheets.map(ts => (
                  <tr key={ts.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-indigo-700 text-xs font-semibold">{ts.user_name?.charAt(0)}</span>
                        </div>
                        <span className="font-medium text-gray-900 text-sm">{ts.user_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {format(parseISO(ts.period_start + 'T00:00:00'), 'MMM d')} –{' '}
                      {format(parseISO(ts.period_end   + 'T00:00:00'), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{ts.total_regular_hours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-amber-600">{ts.total_extra_hours.toFixed(1)}h</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {(ts.total_regular_hours + ts.total_extra_hours).toFixed(1)}h
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TS_STATUS_STYLE[ts.status]}`}>
                        {ts.status.charAt(0).toUpperCase() + ts.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {ts.signed_at
                        ? format(parseISO(ts.signed_at), 'MMM d, yyyy HH:mm')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attendance records */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">{records.length} record{records.length !== 1 ? 's' : ''}</span>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Employee','Date','Start','End','Break','Regular','Extra','Status','Timesheet','Notes'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
              ) : paginatedRecords.map(r => {
                const tsStatus = tsStatusByUser.get(r.user_id);
                const dow = parseISO(r.date + 'T00:00:00').getDay();
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-indigo-700 text-xs font-semibold">{r.user_name?.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{r.user_name}</p>
                          <p className="text-xs text-gray-400">{r.user_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <div className="flex items-center gap-1.5">
                        {format(parseISO(r.date + 'T00:00:00'), 'EEE, MMM d yyyy')}
                        {(dow === 0 || dow === 6) && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">
                            Weekend OT
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.clock_in || '08:00'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.clock_out || '16:00'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.break_minutes ? `${r.break_minutes}m` : '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{(r.regular_hours || 8).toFixed(1)}h</td>
                    <td className="px-4 py-3">
                      {r.extra_hours
                        ? <span className="text-amber-600 font-medium flex items-center gap-1"><Zap size={11} />+{r.extra_hours}h</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={STATUS_BADGE[r.status] || 'badge-gray'}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {tsStatus ? (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${TS_STATUS_STYLE[tsStatus]}`}>
                          {tsStatus.charAt(0).toUpperCase() + tsStatus.slice(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate">{r.notes || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary py-1.5 px-3 disabled:opacity-40"
            >
              <ChevronLeft size={15} /> Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    p === page
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-secondary py-1.5 px-3 disabled:opacity-40"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
