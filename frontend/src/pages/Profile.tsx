import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import {
  Lock, Save, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff,
  User, Mail, Shield, Building2,
} from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [msg, setMsg]                         = useState<{ text: string; ok: boolean } | null>(null);

  const save = async () => {
    if (!newPassword) { setMsg({ text: 'Enter a new password.', ok: false }); return; }
    if (newPassword.length < 8) { setMsg({ text: 'Password must be at least 8 characters.', ok: false }); return; }
    if (newPassword !== confirmPassword) { setMsg({ text: 'Passwords do not match.', ok: false }); return; }

    setSaving(true); setMsg(null);
    try {
      await api.put('/auth/password', { new_password: newPassword, confirm_password: confirmPassword });
      setMsg({ text: 'Password updated successfully.', ok: true });
      setNewPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      const text = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Update failed'
        : 'Update failed';
      setMsg({ text, ok: false });
    } finally { setSaving(false); }
  };

  const roleColor: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    user:  'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="p-4 sm:p-6 max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">My Account</h1>

      {/* Profile info */}
      <div className="card overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-indigo-700 text-xl font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">{user?.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[user?.role || 'user']}`}>
                {user?.role?.charAt(0).toUpperCase()}{user?.role?.slice(1)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-3 text-gray-600">
            <Mail size={15} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="font-medium text-gray-800">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Shield size={15} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Role</p>
              <p className="font-medium text-gray-800 capitalize">{user?.role}</p>
            </div>
          </div>
          {user?.department && (
            <div className="flex items-center gap-3 text-gray-600">
              <Building2 size={15} className="text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Department</p>
                <p className="font-medium text-gray-800">{user.department}</p>
              </div>
            </div>
          )}
          {(user as { vendor_id?: string })?.vendor_id && (
            <div className="flex items-center gap-3 text-gray-600">
              <User size={15} className="text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Vendor ID</p>
                <p className="font-medium text-gray-800">{(user as { vendor_id?: string }).vendor_id}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Change password */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Lock size={15} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Change Password</p>
            <p className="text-xs text-gray-500">Minimum 8 characters</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="input pr-10"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
              <button type="button" onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                className="input pr-10"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                onKeyDown={e => e.key === 'Enter' && save()}
              />
              <button type="button" onClick={() => setShowConfirm(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              {msg && (
                <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {msg.text}
                </span>
              )}
            </div>
            <button onClick={save} disabled={saving} className="btn-primary ml-auto">
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><Save size={14} /> Update Password</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
