import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import api from '../api/client';
import {
  Save, Send, Eye, EyeOff, AlertCircle, CheckCircle2,
  Loader2, Upload, X, Palette, Mail,
} from 'lucide-react';

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

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
      <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-gray-900 text-sm">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function StatusMsg({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
      {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {msg.text}
    </span>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { branding, refresh: refreshBranding } = useBranding();

  // SMTP
  const [form, setForm]         = useState<SmtpForm>(defaultForm);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [saveMsg, setSaveMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [testMsg, setTestMsg]   = useState<{ text: string; ok: boolean } | null>(null);

  // Branding
  const [logoPreview, setLogoPreview]       = useState('');
  const [faviconPreview, setFaviconPreview] = useState('');
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMsg, setBrandingMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const logoInputRef    = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/settings/smtp').then(({ data }) => {
      if (data.settings) setForm(data.settings);
    }).catch(() => {});
    setTestEmail(user?.email || '');
  }, [user]);

  useEffect(() => {
    setLogoPreview(branding.logo);
    setFaviconPreview(branding.favicon);
  }, [branding]);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const saveBranding = async () => {
    setBrandingSaving(true); setBrandingMsg(null);
    try {
      await api.put('/settings/branding', { logo: logoPreview || '', favicon: faviconPreview || '' });
      await refreshBranding();
      setBrandingMsg({ text: 'Branding saved.', ok: true });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Save failed'
        : 'Save failed';
      setBrandingMsg({ text: msg, ok: false });
    } finally { setBrandingSaving(false); }
  };

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
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Save failed'
        : 'Save failed';
      setSaveMsg({ text: msg, ok: false });
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setTestMsg(null);
    try {
      const { data } = await api.post('/settings/smtp/test', { to: testEmail || user?.email });
      setTestMsg({ text: data.message || 'Test email sent.', ok: true });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Test failed'
        : 'Test failed';
      setTestMsg({ text: msg, ok: false });
    } finally { setTesting(false); }
  };

  const isRelay = form.connection_type === 'relay';

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* ── Branding ─────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <SectionHeader
          icon={<Palette size={17} className="text-indigo-600" />}
          title="Branding"
          description="Custom logo and favicon shown across the app"
        />

        <div className="p-6 space-y-4">
          {/* Logo row */}
          <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-xl">
            <div
              className="w-36 h-20 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg bg-white cursor-pointer hover:border-indigo-400 transition-colors shrink-0 overflow-hidden"
              onClick={() => logoInputRef.current?.click()}
            >
              {logoPreview
                ? <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain p-1" />
                : <span className="text-xs text-gray-400 text-center px-2">Click to upload</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">Sidebar Logo</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Replaces the default icon in the sidebar and mobile header. PNG, SVG, WebP — max 5 MB.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => logoInputRef.current?.click()} className="btn-secondary text-xs py-1.5">
                  <Upload size={12} /> Upload
                </button>
                {logoPreview && (
                  <button type="button" onClick={() => setLogoPreview('')} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={12} /> Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setLogoPreview(await readFile(f)); e.target.value = ''; }} />
          </div>

          {/* Favicon row */}
          <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-xl">
            <div
              className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg bg-white cursor-pointer hover:border-indigo-400 transition-colors shrink-0 overflow-hidden"
              onClick={() => faviconInputRef.current?.click()}
            >
              {faviconPreview
                ? <img src={faviconPreview} alt="Favicon" className="w-12 h-12 object-contain" />
                : <span className="text-xs text-gray-400 text-center px-1">Click to upload</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">Favicon</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Shown in the browser tab. Use a square image. PNG, WebP — max 1 MB.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => faviconInputRef.current?.click()} className="btn-secondary text-xs py-1.5">
                  <Upload size={12} /> Upload
                </button>
                {faviconPreview && (
                  <button type="button" onClick={() => setFaviconPreview('')} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={12} /> Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setFaviconPreview(await readFile(f)); e.target.value = ''; }} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <StatusMsg msg={brandingMsg} />
            <button onClick={saveBranding} disabled={brandingSaving} className="btn-primary ml-auto">
              {brandingSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Branding</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Email / SMTP ──────────────────────────────────── */}
      <div className="card overflow-hidden">
        <SectionHeader
          icon={<Mail size={17} className="text-indigo-600" />}
          title="Email / SMTP"
          description="Used to send OTP login codes to users"
        />

        <div className="p-6 space-y-5">
          {/* Connection type */}
          <div>
            <label className="label">Connection type</label>
            <div className="flex gap-2 mt-1">
              {CONN_TYPES.map(ct => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => pickConn(ct.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.connection_type === ct.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
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
                    value={form.auth_pass} onChange={e => set('auth_pass', e.target.value)}
                    placeholder="App password" />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* From */}
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

          <div className="flex items-center justify-between pt-1">
            <StatusMsg msg={saveMsg} />
            <button onClick={save} disabled={saving} className="btn-primary ml-auto">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save SMTP</>}
            </button>
          </div>
        </div>

        {/* Test email — inlined below SMTP */}
        <div className="border-t border-gray-100 px-6 py-5">
          <p className="text-sm font-medium text-gray-800 mb-3">Send test email</p>
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
          <div className="mt-3">
            {testMsg && <StatusMsg msg={testMsg} />}
            {!form.host && <p className="text-xs text-amber-600">Save an SMTP host before sending a test.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
