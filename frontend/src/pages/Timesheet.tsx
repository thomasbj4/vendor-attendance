import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Timesheet, AttendanceRecord } from '../types';
import SignaturePadComponent from '../components/SignaturePad';
import { format, parseISO } from 'date-fns';
import { Plus, FileText, Eye, Trash2, Check, PenLine, RefreshCw, X, ChevronDown, ChevronUp, Zap } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-gray',
  submitted: 'badge-blue',
  signed: 'badge-green',
};

interface Detail {
  timesheet: Timesheet;
  records: AttendanceRecord[];
}

export default function TimesheetPage() {
  const { user } = useAuth();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ period_start: '', period_end: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showSignPad, setShowSignPad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extraHours, setExtraHours] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [showDetail, setShowDetail] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/timesheets');
    setTimesheets(data.timesheets);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (id: number) => {
    if (showDetail === id) { setShowDetail(null); return; }
    const { data } = await api.get(`/timesheets/${id}`);
    setDetail(data);
    setExtraHours(data.timesheet.total_extra_hours);
    setEditNotes(data.timesheet.notes || '');
    setShowDetail(id);
  };

  const create = async () => {
    if (!form.period_start || !form.period_end) { alert('Select date range.'); return; }
    setCreating(true);
    try {
      await api.post('/timesheets', form);
      setShowCreate(false);
      setForm({ period_start: '', period_end: '', notes: '' });
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Error'
        : 'Error';
      alert(msg);
    } finally { setCreating(false); }
  };

  const deleteTs = async (id: number) => {
    if (!confirm('Delete this timesheet?')) return;
    await api.delete(`/timesheets/${id}`);
    load();
    if (showDetail === id) setShowDetail(null);
  };

  const saveUpdates = async () => {
    if (!detail) return;
    await api.put(`/timesheets/${detail.timesheet.id}`, {
      notes: editNotes,
      extra_hours: extraHours,
    });
    await api.post(`/timesheets/${detail.timesheet.id}/recalculate`);
    load();
    const { data } = await api.get(`/timesheets/${detail.timesheet.id}`);
    setDetail(data);
    setExtraHours(data.timesheet.total_extra_hours);
  };

  const handleSign = async (signatureId: number) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.post(`/timesheets/${detail.timesheet.id}/submit`, { signature_id: signatureId });
      setShowSignPad(false);
      load();
      const { data } = await api.get(`/timesheets/${detail.timesheet.id}`);
      setDetail(data);
    } finally { setSubmitting(false); }
  };

  const canEdit = (ts: Timesheet) => ts.status === 'draft' && (user?.role !== 'user' || ts.user_id === user.id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Timesheet
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Create New Timesheet</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Period Start</label>
              <input type="date" className="input" value={form.period_start}
                onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
            </div>
            <div>
              <label className="label">Period End</label>
              <input type="date" className="input" value={form.period_end}
                onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input type="text" className="input" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. June week 1" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button onClick={create} disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Timesheets list */}
      <div className="space-y-3">
        {timesheets.length === 0 ? (
          <div className="card p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No timesheets yet. Create one to get started.</p>
          </div>
        ) : timesheets.map(ts => (
          <div key={ts.id} className="card overflow-hidden">
            {/* Header row */}
            <div className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
              onClick={() => loadDetail(ts.id)}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-indigo-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      {format(parseISO(ts.period_start + 'T00:00:00'), 'MMM d')} – {format(parseISO(ts.period_end + 'T00:00:00'), 'MMM d, yyyy')}
                    </p>
                    <span className={STATUS_BADGE[ts.status] || 'badge-gray'}>{ts.status}</span>
                    {ts.signature_id && <span className="badge badge-purple flex items-center gap-1"><PenLine size={10} />Signed</span>}
                  </div>
                  {ts.user_name && user?.role !== 'user' && (
                    <p className="text-xs text-gray-500">{ts.user_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{(ts.total_regular_hours + ts.total_extra_hours).toFixed(1)}h total</p>
                  <p className="text-xs text-gray-400">{ts.total_regular_hours.toFixed(1)}h reg · {ts.total_extra_hours.toFixed(1)}h extra</p>
                </div>
                {canEdit(ts) && (
                  <button onClick={e => { e.stopPropagation(); deleteTs(ts.id); }}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1">
                    <Trash2 size={16} />
                  </button>
                )}
                {showDetail === ts.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </div>
            </div>

            {/* Detail expand */}
            {showDetail === ts.id && detail && detail.timesheet.id === ts.id && (
              <div className="border-t border-gray-100">
                {/* Actions bar */}
                <div className="px-5 py-3 bg-gray-50 flex items-center gap-3 flex-wrap">
                  {canEdit(ts) && (
                    <>
                      <button onClick={saveUpdates} className="btn-secondary text-xs py-1.5">
                        <RefreshCw size={13} /> Recalculate & Save
                      </button>
                    </>
                  )}
                  {ts.status === 'draft' && (
                    <button onClick={() => setShowSignPad(true)} className="btn-primary text-xs py-1.5">
                      <PenLine size={13} /> Sign & Submit
                    </button>
                  )}
                  {user?.role === 'admin' && ts.status === 'submitted' && (
                    <button onClick={async () => { await api.post(`/timesheets/${ts.id}/sign`); load(); loadDetail(ts.id); }}
                      className="btn-success text-xs py-1.5">
                      <Check size={13} /> Sign Off
                    </button>
                  )}
                  <button onClick={() => { setShowDetail(null); setDetail(null); }} className="ml-auto text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </div>

                {/* Edit fields */}
                {canEdit(ts) && (
                  <div className="px-5 py-3 grid grid-cols-2 gap-4 border-b border-gray-100">
                    <div>
                      <label className="label">Additional Extra Hours (manual)</label>
                      <input type="number" min="0" step="0.5" className="input" value={extraHours}
                        onChange={e => setExtraHours(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label">Notes</label>
                      <input type="text" className="input" value={editNotes}
                        onChange={e => setEditNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="px-5 py-3 grid grid-cols-4 gap-4 border-b border-gray-100 text-sm">
                  <div className="text-center"><p className="text-xs text-gray-400 mb-0.5">Regular Hours</p><p className="font-bold text-gray-900">{detail.timesheet.total_regular_hours.toFixed(1)}h</p></div>
                  <div className="text-center"><p className="text-xs text-gray-400 mb-0.5">Extra Hours</p><p className="font-bold text-amber-600">{detail.timesheet.total_extra_hours.toFixed(1)}h</p></div>
                  <div className="text-center"><p className="text-xs text-gray-400 mb-0.5">Total Hours</p><p className="font-bold text-indigo-600">{(detail.timesheet.total_regular_hours + detail.timesheet.total_extra_hours).toFixed(1)}h</p></div>
                  <div className="text-center"><p className="text-xs text-gray-400 mb-0.5">Days</p><p className="font-bold text-gray-900">{detail.records.length}</p></div>
                </div>

                {/* Attendance table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        {['Date', 'Day', 'In', 'Out', 'Break', 'Regular', 'Extra', 'Status', 'Notes'].map(h => (
                          <th key={h} className="px-4 py-2 text-xs font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.records.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-4 text-center text-gray-400">No attendance records in this period</td></tr>
                      ) : detail.records.map(r => (
                        <tr key={r.id} className={`hover:bg-gray-50 ${r.status === 'absent' ? 'text-red-500' : ''}`}>
                          <td className="px-4 py-2 font-medium">{r.date}</td>
                          <td className="px-4 py-2 text-gray-500">{format(parseISO(r.date + 'T00:00:00'), 'EEE')}</td>
                          <td className="px-4 py-2">{r.clock_in || '—'}</td>
                          <td className="px-4 py-2">{r.clock_out || '—'}</td>
                          <td className="px-4 py-2">{r.break_minutes ? `${r.break_minutes}m` : '—'}</td>
                          <td className="px-4 py-2 font-medium">{(r.regular_hours || 0).toFixed(1)}h</td>
                          <td className="px-4 py-2">
                            {r.extra_hours ? <span className="text-amber-600 flex items-center gap-1"><Zap size={11} />+{r.extra_hours}h</span> : '—'}
                          </td>
                          <td className="px-4 py-2"><span className={`badge ${r.status === 'present' ? 'badge-green' : r.status === 'absent' ? 'badge-red' : 'badge-yellow'}`}>{r.status}</span></td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{r.notes || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Signature preview */}
                {detail.timesheet.signature_data && (
                  <div className="px-5 py-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Signature</p>
                    <img src={detail.timesheet.signature_data} alt="Signature"
                      className="max-h-20 border border-gray-200 rounded-lg bg-white p-2" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Signature Modal */}
      {showSignPad && detail && (
        <SignaturePadComponent
          onSave={handleSign}
          onClose={() => setShowSignPad(false)}
        />
      )}
    </div>
  );
}
