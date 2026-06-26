import { useEffect, useState } from 'react';
import api from '../api/client';
import { Signature } from '../types';
import { X, PenLine, Plus, CheckCircle2 } from 'lucide-react';
import SignaturePadComponent from './SignaturePad';

interface Props {
  onConfirm: (signatureId: number) => void;
  onClose: () => void;
}

export default function SignaturePicker({ onConfirm, onClose }: Props) {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showDraw, setShowDraw] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/signatures');
    setSignatures(data.signatures);
    // Auto-select default
    const def = data.signatures.find((s: Signature) => s.is_default);
    if (def) setSelected(def.id);
    else if (data.signatures.length > 0) setSelected(data.signatures[0].id);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleNewSaved = (signatureId: number) => {
    setShowDraw(false);
    load().then(() => setSelected(signatureId));
  };

  if (showDraw) {
    return <SignaturePadComponent onSave={handleNewSaved} onClose={() => setShowDraw(false)} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Sign & Publish Report</h2>
            <p className="text-sm text-gray-400 mt-0.5">Choose a signature to attach</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-center text-gray-400 py-6 text-sm">Loading signatures...</p>
          ) : signatures.length === 0 ? (
            <div className="text-center py-8">
              <PenLine className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-4">You have no saved signatures yet.</p>
              <button onClick={() => setShowDraw(true)} className="btn-primary">
                <Plus size={15} /> Add Signature
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {signatures.map(sig => (
                  <button
                    key={sig.id}
                    onClick={() => setSelected(sig.id)}
                    className={`relative rounded-xl border-2 p-3 text-left transition-all
                      ${selected === sig.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    {selected === sig.id && (
                      <CheckCircle2 size={16} className="absolute top-2 right-2 text-indigo-500" />
                    )}
                    <div className="h-16 flex items-center justify-center bg-white rounded-lg border border-gray-100 mb-2 overflow-hidden">
                      <img src={sig.data} alt={sig.name} className="max-h-full max-w-full object-contain" />
                    </div>
                    <p className="text-xs font-medium text-gray-700 truncate">{sig.name}</p>
                    {sig.is_default ? <span className="text-[10px] text-indigo-500 font-medium">Default</span> : null}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDraw(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                <Plus size={15} /> Add New Signature
              </button>
            </>
          )}
        </div>

        {signatures.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className="btn-primary"
            >
              <PenLine size={15} /> Publish Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
