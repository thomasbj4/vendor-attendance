import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Building2, Eye, EyeOff, Lock, Mail, KeyRound, MessageSquare } from 'lucide-react';

type Mode = 'password' | 'otp-email' | 'otp-code';

export default function Login() {
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const resetToMode = (m: 'password' | 'otp-email') => {
    setMode(m);
    setError('');
    setInfo('');
    setOtp('');
    setPassword('');
  };

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Login failed'
        : 'Login failed';
      setError(msg);
    } finally { setLoading(false); }
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email });
      setInfo('OTP sent! Check your email for a 6-digit code.');
      setMode('otp-code');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to send OTP'
        : 'Failed to send OTP';
      setError(msg);
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyOtp(email, otp);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Invalid OTP'
        : 'Invalid OTP';
      setError(msg);
    } finally { setLoading(false); }
  };


  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white shadow-md rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-9 h-9 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Vendor Attendance</h1>
          <p className="text-gray-500 mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* Mode toggle */}
          <div className="flex rounded-xl bg-gray-100 p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => resetToMode('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'password' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Lock size={14} /> Password
            </button>
            <button
              type="button"
              onClick={() => resetToMode('otp-email')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                mode !== 'password' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageSquare size={14} /> OTP
            </button>
          </div>

          {/* Password login */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-5">
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input pl-9" placeholder="you@vendor.com" required autoFocus />
                </div>
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input pl-9 pr-10" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}

          {/* OTP — enter email */}
          {mode === 'otp-email' && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input pl-9" placeholder="you@vendor.com" required autoFocus />
                </div>
              </div>
              <p className="text-xs text-gray-500">A 6-digit code will be sent to your email address.</p>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </form>
          )}

          {/* OTP — enter code */}
          {mode === 'otp-code' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              {info && <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3">{info}</div>}
              <div>
                <label className="label">6-digit OTP code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input pl-9 text-center tracking-[0.5em] text-xl font-bold"
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Sent to <span className="font-medium text-gray-600">{email}</span></p>
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}
              <button type="submit" disabled={loading || otp.length < 6} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Verifying...' : 'Verify & Sign in'}
              </button>
              <button type="button" onClick={() => { setMode('otp-email'); setError(''); setOtp(''); setInfo(''); }}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-800 transition-colors">
                Didn't receive it? Send again
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
