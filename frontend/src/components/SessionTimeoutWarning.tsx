import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const WARN_BEFORE_MS = 2 * 60 * 1000; // show warning 2 minutes before expiry

export default function SessionTimeoutWarning() {
  const { expiresAt, refreshSession, logout } = useAuth();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }

    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        logout().then(() => navigate('/login'));
        return;
      }
      setRemaining(ms <= WARN_BEFORE_MS ? ms : null);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, logout, navigate]);

  const handleExtend = useCallback(async () => {
    setExtending(true);
    try { await refreshSession(); } finally { setExtending(false); }
  }, [refreshSession]);

  if (remaining === null) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="fixed bottom-5 right-5 z-50 bg-white border border-amber-200 rounded-xl shadow-xl p-4 flex items-start gap-3 max-w-xs animate-in">
      <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
        <Clock size={15} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Session expiring soon</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Expires in{' '}
          <span className="font-mono font-semibold text-amber-600">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleExtend}
            disabled={extending}
            className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {extending ? 'Extending…' : 'Stay logged in'}
          </button>
          <button
            onClick={() => logout().then(() => navigate('/login'))}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
