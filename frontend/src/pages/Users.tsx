import { useState, useEffect } from 'react';
import api from '../api/client';
import { User } from '../types';
import { Plus, Edit2, UserX, UserCheck, X, Shield, Users as UsersIcon } from 'lucide-react';

const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-purple',
  user: 'badge-green',
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  department: string;
  vendor_id: string;
}

const emptyForm: UserForm = { name: '', email: '', password: '', role: 'user', department: '', vendor_id: '' };

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const { data } = await api.get('/users');
    setUsers(data.users);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUser(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      department: u.department || '',
      vendor_id: u.vendor_id || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editUser) {
        const payload: Partial<UserForm> = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/users/${editUser.id}`, payload);
      } else {
        await api.post('/users', form);
      }
      setShowModal(false);
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Error'
        : 'Error';
      alert(msg);
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: User) => {
    if (!confirm(`${u.is_active ? 'Deactivate' : 'Activate'} ${u.name}?`)) return;
    await api.put(`/users/${u.id}`, { is_active: !u.is_active });
    load();
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(filter.toLowerCase()) ||
    u.email.toLowerCase().includes(filter.toLowerCase()) ||
    u.role.includes(filter.toLowerCase())
  );

  const counts = { admin: users.filter(u => u.role === 'admin').length, user: users.filter(u => u.role === 'user').length };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: users.length, color: 'bg-indigo-500' },
          { label: 'Admins', value: counts.admin, color: 'bg-purple-500' },
          { label: 'Staff', value: counts.user, color: 'bg-emerald-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 flex items-center gap-4">
            <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
              <UsersIcon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <input
            type="text"
            placeholder="Search users..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="input max-w-xs"
          />
          <span className="text-sm text-gray-400 ml-auto">{filtered.length} users</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Name', 'Email', 'Role', 'Department', 'Vendor ID', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-indigo-700 text-sm font-semibold">{u.name.charAt(0)}</span>
                      </div>
                      <span className="font-medium text-gray-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={ROLE_BADGE[u.role] || 'badge-gray'}>
                      {u.role === 'admin' && <Shield size={10} className="inline mr-1" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.department || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{u.vendor_id || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={u.is_active ? 'badge-green' : 'badge-red'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="text-indigo-600 hover:text-indigo-800 p-1">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => toggleActive(u)} className={`p-1 ${u.is_active ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-emerald-500'}`}>
                        {u.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input type="text" className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@vendor.com" />
              </div>
              <div>
                <label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                <input type="password" className="input" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Department</label>
                  <input type="text" className="input" value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Operations" />
                </div>
                <div>
                  <label className="label">Vendor ID</label>
                  <input type="text" className="input" value={form.vendor_id}
                    onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))} placeholder="V001" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
