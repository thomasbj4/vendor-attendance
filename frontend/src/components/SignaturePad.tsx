import { useRef, useEffect, useState, useCallback } from 'react';
import SignaturePadLib from 'signature_pad';
import { Pen, Upload, Image, Trash2, RotateCcw } from 'lucide-react';
import api from '../api/client';
import { Signature } from '../types';

interface Props {
  onSave: (signatureId: number) => void;
  onClose: () => void;
}

type Tab = 'draw' | 'upload' | 'saved';

export default function SignaturePad({ onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [savedSigs, setSavedSigs] = useState<Signature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<number | null>(null);
  const [sigName, setSigName] = useState('My Signature');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  useEffect(() => {
    api.get('/signatures').then(({ data }) => setSavedSigs(data.signatures)).catch(() => {});
  }, []);

  const initCanvas = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);

    padRef.current = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: '#1e293b',
      minWidth: 1,
      maxWidth: 3,
    });
    padRef.current.addEventListener('endStroke', () => setIsEmpty(false));
  }, []);

  useEffect(() => {
    if (tab === 'draw') {
      setTimeout(initCanvas, 50);
    }
    return () => { padRef.current?.off(); };
  }, [tab, initCanvas]);

  const clear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setUploadPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      let data: string;

      if (tab === 'draw') {
        if (padRef.current?.isEmpty()) { alert('Please draw your signature first.'); setSaving(false); return; }
        data = padRef.current!.toDataURL('image/png');
      } else if (tab === 'upload') {
        if (!uploadPreview) { alert('Please upload an image first.'); setSaving(false); return; }
        data = uploadPreview;
      } else {
        if (!selectedSigId) { alert('Please select a signature.'); setSaving(false); return; }
        onSave(selectedSigId);
        return;
      }

      const { data: res } = await api.post('/signatures', {
        data,
        name: sigName,
        set_default: setAsDefault,
      });
      onSave(res.signature.id);
    } catch {
      alert('Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Pen }[] = [
    { id: 'draw', label: 'Draw', icon: Pen },
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'saved', label: 'Saved', icon: Image },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Sign Timesheet</h2>
          <p className="text-sm text-gray-500 mt-0.5">Choose how to add your signature</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Draw tab */}
          {tab === 'draw' && (
            <div>
              <div className="relative border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 mb-3" style={{ height: 180 }}>
                <canvas ref={canvasRef} className="w-full h-full rounded-xl cursor-crosshair" />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-gray-400 text-sm">Draw your signature here</p>
                  </div>
                )}
              </div>
              <button onClick={clear} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <RotateCcw size={12} /> Clear
              </button>
            </div>
          )}

          {/* Upload tab */}
          {tab === 'upload' && (
            <div>
              <label className="block w-full border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors mb-3">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Click to upload signature image</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 2MB</p>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
              {uploadPreview && (
                <div className="relative">
                  <img src={uploadPreview} alt="Preview" className="max-h-32 mx-auto rounded-lg border border-gray-200" />
                  <button onClick={() => setUploadPreview(null)} className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Saved tab */}
          {tab === 'saved' && (
            <div>
              {savedSigs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Image className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No saved signatures yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedSigs.map(sig => (
                    <button
                      key={sig.id}
                      onClick={() => setSelectedSigId(sig.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                        selectedSigId === sig.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <Pen size={14} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{sig.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(sig.created_at).toLocaleDateString()}
                          {sig.is_default ? ' · Default' : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Signature name & default */}
          {tab !== 'saved' && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Signature Label</label>
                <input
                  type="text"
                  value={sigName}
                  onChange={e => setSigName(e.target.value)}
                  className="input"
                  placeholder="My Signature"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={setAsDefault} onChange={e => setSetAsDefault(e.target.checked)} className="rounded border-gray-300 text-indigo-600" />
                <span className="text-sm text-gray-600">Set as default signature</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Apply Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
