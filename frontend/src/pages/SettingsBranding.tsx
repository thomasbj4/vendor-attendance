import { useState, useEffect, useRef } from 'react';
import { useBranding } from '../context/BrandingContext';
import api from '../api/client';
import { Save, AlertCircle, CheckCircle2, Loader2, Upload, X, Palette } from 'lucide-react';

function StatusMsg({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
      {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {msg.text}
    </span>
  );
}

export default function SettingsBranding() {
  const { branding, refresh } = useBranding();
  const [logoPreview, setLogoPreview]       = useState('');
  const [faviconPreview, setFaviconPreview] = useState('');
  const [saving, setSaving]                 = useState(false);
  const [msg, setMsg]                       = useState<{ text: string; ok: boolean } | null>(null);
  const logoRef    = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoPreview(branding.logo);
    setFaviconPreview(branding.favicon);
  }, [branding]);

  const readFile = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await api.put('/settings/branding', { logo: logoPreview || '', favicon: faviconPreview || '' });
      await refresh();
      setMsg({ text: 'Branding saved.', ok: true });
    } catch (err: unknown) {
      const text = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Save failed'
        : 'Save failed';
      setMsg({ text, ok: false });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
          <Palette size={18} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Branding</h1>
          <p className="text-xs text-gray-500">Custom logo and favicon shown across the app</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-gray-100">

          {/* Logo */}
          <div className="p-5 flex items-center gap-5">
            <div
              className="w-40 h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 cursor-pointer hover:border-indigo-400 transition-colors shrink-0 overflow-hidden"
              onClick={() => logoRef.current?.click()}
            >
              {logoPreview
                ? <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain p-2" />
                : <span className="text-xs text-gray-400 text-center px-2">Click to upload</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Sidebar Logo</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-4">
                Replaces the default icon in the sidebar and mobile header.<br />
                PNG, SVG, WebP, JPEG — max 5 MB.
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => logoRef.current?.click()} className="btn-secondary text-xs py-1.5">
                  <Upload size={12} /> Upload
                </button>
                {logoPreview && (
                  <button type="button" onClick={() => setLogoPreview('')} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={12} /> Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden"
              onChange={async e => { const f = e.target.files?.[0]; if (f) setLogoPreview(await readFile(f)); e.target.value = ''; }} />
          </div>

          {/* Favicon */}
          <div className="p-5 flex items-center gap-5">
            <div
              className="w-24 h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 cursor-pointer hover:border-indigo-400 transition-colors shrink-0 overflow-hidden"
              onClick={() => faviconRef.current?.click()}
            >
              {faviconPreview
                ? <img src={faviconPreview} alt="Favicon" className="w-14 h-14 object-contain" />
                : <span className="text-xs text-gray-400 text-center px-1">Click to upload</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Favicon</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-4">
                Shown in the browser tab. Use a square image for best results.<br />
                PNG, WebP, SVG — max 1 MB.
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => faviconRef.current?.click()} className="btn-secondary text-xs py-1.5">
                  <Upload size={12} /> Upload
                </button>
                {faviconPreview && (
                  <button type="button" onClick={() => setFaviconPreview('')} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={12} /> Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={faviconRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden"
              onChange={async e => { const f = e.target.files?.[0]; if (f) setFaviconPreview(await readFile(f)); e.target.value = ''; }} />
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <StatusMsg msg={msg} />
          <button onClick={save} disabled={saving} className="btn-primary ml-auto">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Branding</>}
          </button>
        </div>
      </div>
    </div>
  );
}
