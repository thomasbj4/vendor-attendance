import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Save, Send, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';

interface SmtpForm {
  host: string;
  port: number;
  connection_type: string;
  auth_user: string;
  auth_pass: string;
  from_name: string;
  from_email: string;
}

const CONN_TYPES = [
  { value: 'relay',    label: 'Relay',       port: 25  },
  { value: 'starttls', label: 'STARTTLS',    port: 587 },
  { value: 'smtps',    label: 'SMTPS / SSL', port: 465 },
];

const defaultForm: SmtpForm = {
  host: '', port: 587, connection_type: 'starttls',
  auth_user: '', auth_pass: '', from_name: 'Vendor Attendance', from_email: '',
};

function StatusMsg({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
      {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {msg.text}
    </span>
  );
}

export default function SettingsSmtp() {
  const { user } = useAuth();
  const [form, setForm]           = useState<SmtpForm>(defaultForm);
  const [showPass, setShowPass]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [saveMsg, setSaveMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [testMsg, setTestMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.get('/settings/smtp').then(({ data }) => {
      if (data.settings) setForm(data.settings);
    }).catch(() => {});
    setTestEmail(user?.email || '');
  }, [user]);

  const set = (k: keyof SmtpForm, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const pickConn = (ct: string) => {
    const def = CONN_TYPES.find(c => c.value === ct);
    setForm(f => ({ ...f, connection_type: ct, port: def?.port ?? f.port }));
  };

  const save = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      await api.put('/settings/smtp', form);
      setSaveMsg({ text: 'SMTP settings saved.', ok: true });
    } catch (err: unknown) {
      const text = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Save failed'
        : 'Save failed';
      setSaveMsg({ text, ok: false });
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setTestMsg(null);
    try {
      const { data } = await api.post('/settings/smtp/test', { to: testEmail || user?.email });
      setTestMsg({ text: data.message || 'Test email sent.', ok: true });
    } catch (err: unknown) {
      const text = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Test failed'
        : 'Test failed';
      setTestMsg({ text, ok: false });
    } finally { setTesting(false); }
  };

  const isRelay = form.connection_type === 'relay';

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
          <Mail size={18} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Email / SMTP</h1>
          <p className="text-xs text-gray-500">Used to send OTP login codes to users</p>
        </div>
      </div>

      {/* SMTP config card */}
      <div className="card overflow-hidden">
        <div className="p-6 space-y-5">

          {/* Connection type */}
          <div>
            <label className="label">Connection type</label>
            <div className="flex gap-2 mt-1">
              {CONN_TYPES.map(ct => (
                <button key={ct.value} type="button" onClick={() => pickConn(ct.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.connection_type === ct.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <label className="label">SMTP Host</label>
              <input type="text" className="input" value={form.host}
                onChange={e => set('host', e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className="label">Port</label>
              <input type="number" className="input text-center" value={form.port}
                onChange={e => set('port', parseInt(e.target.value) || 587)} min={1} max={65535} />
            </div>
          </div>

          {/* Credentials */}
          {!isRelay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Username</label>
                <input type="text" className="input" value={form.auth_user}
                  onChange={e => set('auth_user', e.target.value)} placeholder="you@gmail.com" />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="input pr-9"
                    value={form.auth_pass} onChange={e => set('auth_pass', e.target.value)} placeholder="App password" />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sender */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From name</label>
              <input type="text" className="input" value={form.from_name}
                onChange={e => set('from_name', e.target.value)} placeholder="Vendor Attendance" />
            </div>
            <div>
              <label className="label">From email</label>
              <input type="email" className="input" value={form.from_email}
                onChange={e => set('from_email', e.target.value)} placeholder="no-reply@company.com" />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <StatusMsg msg={saveMsg} />
          <button onClick={save} disabled={saving} className="btn-primary ml-auto">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save SMTP</>}
          </button>
        </div>
      </div>

      {/* Test email card */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">Send test email</p>
          <p className="text-xs text-gray-500 mt-0.5">Verify your SMTP settings are working</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Recipient</label>
              <input type="email" className="input" value={testEmail}
                onChange={e => setTestEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            <button onClick={sendTest} disabled={testing || !form.host} className="btn-secondary shrink-0">
              {testing ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send test</>}
            </button>
          </div>
          {testMsg && <StatusMsg msg={testMsg} />}
          {!form.host && <p className="text-xs text-amber-600">Save an SMTP host before sending a test.</p>}
        </div>
      </div>
    </div>
  );
}
