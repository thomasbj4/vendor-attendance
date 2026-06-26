import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { format, parseISO } from 'date-fns';
import { ShieldCheck, RefreshCw } from 'lucide-react';

interface AuditEntry {
  id: number;
  user_id: number | null;
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: string | null;
  created_at: string;
}

const ACTION_STYLES: Record<string, string> = {
  'auth.login':            'bg-blue-100 text-blue-700',
  'auth.login_failed':     'bg-red-100 text-red-600',
  'attendance.create':     'bg-emerald-100 text-emerald-700',
  'attendance.update':     'bg-amber-100 text-amber-700',
  'attendance.delete':     'bg-red-100 text-red-600',
  'timesheet.create':      'bg-indigo-100 text-indigo-700',
  'timesheet.submit':      'bg-violet-100 text-violet-700',
  'timesheet.sign':        'bg-emerald-100 text-emerald-700',
  'user.create':           'bg-emerald-100 text-emerald-700',
  'user.update':           'bg-amber-100 text-amber-700',
  'user.deactivate':       'bg-red-100 text-red-600',
  'settings.smtp.update':  'bg-gray-100 text-gray-600',
};

const ACTION_LABELS: Record<string, string> = {
  'auth.login':            'Login',
  'auth.login_failed':     'Login failed',
  'attendance.create':     'Record created',
  'attendance.update':     'Record updated',
  'attendance.delete':     'Record deleted',
  'timesheet.create':      'Timesheet created',
  'timesheet.submit':      'Timesheet submitted',
  'timesheet.sign':        'Timesheet signed',
  'user.create':           'User created',
  'user.update':           'User updated',
  'user.deactivate':       'User deactivated',
  'settings.smtp.update':  'SMTP updated',
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ action: '', start: '', end: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.action) params.action = filters.action;
      if (filters.start)  params.start  = filters.start;
      if (filters.end)    params.end    = filters.end;
      const { data } = await api.get('/audit', { params });
      setLogs(data.logs);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const parseDetails = (raw: string | null): Record<string, unknown> => {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={22} className="text-indigo-600" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">All system actions, newest first</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex items-end gap-4">
        <div className="flex-1">
          <label className="label">Action</label>
          <select className="input" value={filters.action}
            onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
            <option value="">All actions</option>
            {ALL_ACTIONS.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
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
        {(filters.action || filters.start || filters.end) && (
          <button onClick={() => setFilters({ action: '', start: '', end: '' })}
            className="btn-secondary shrink-0">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm text-gray-500">
          {logs.length} event{logs.length !== 1 ? 's' : ''} (latest 200)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Time', 'Actor', 'Action', 'Entity', 'Details'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No events found</td></tr>
              ) : logs.map(log => {
                const details = parseDetails(log.details);
                const style = ACTION_STYLES[log.action] || 'bg-gray-100 text-gray-600';
                const label = ACTION_LABELS[log.action] || log.action;
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      <p className="font-medium text-gray-800">
                        {format(parseISO(log.created_at), 'MMM d, yyyy')}
                      </p>
                      <p>{format(parseISO(log.created_at), 'HH:mm:ss')}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{log.actor_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${style}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {log.entity_type && (
                        <span className="font-medium text-gray-700">{log.entity_type}</span>
                      )}
                      {log.entity_id && <span className="text-gray-400"> #{log.entity_id}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[280px]">
                      {Object.entries(details)
                        .filter(([, v]) => v !== null && v !== undefined)
                        .map(([k, v]) => (
                          <span key={k} className="inline-flex items-center gap-1 mr-2">
                            <span className="text-gray-500">{k.replace(/_/g, ' ')}:</span>
                            <span className="text-gray-700 font-medium">
                              {Array.isArray(v) ? v.join(', ') : String(v)}
                            </span>
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
