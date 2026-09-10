import React, { useEffect, useMemo, useState } from 'react';

const API = import.meta.env.PROD
  ? 'https://leave-management-r25l.onrender.com/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:4001/api');
const tabs = ['All requests', 'Pending', 'Approved', 'Rejected'];

function formatDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function formatTime(value) { return value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '--'; }
function statusClass(status) { return status.toLowerCase(); }
function todayKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function isWeekendDate(date = new Date()) { return [0, 6].includes(date.getDay()); }

function App() {
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('All requests');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState(null);
  const [notice, setNotice] = useState('');
  const [activeNav, setActiveNav] = useState('dashboard');
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('leaveflow_session')); } catch { return null; } });
  const role = session?.user.role || 'Employee';
  const authHeaders = () => ({ Authorization: `Bearer ${session?.token || ''}` });

  const loadRequests = async () => {
    setLoading(true);
    try { const response = await fetch(`${API}/leaves`, { headers: authHeaders() }); if (!response.ok) throw new Error('Unable to load requests'); setRequests(await response.json()); }
    catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  };
  const loadEmployees = async () => {
    if (role !== 'Manager') { setEmployees([]); return; }
    try { const response = await fetch(`${API}/employees`, { headers: authHeaders() }); if (!response.ok) throw new Error('Unable to load employees'); setEmployees(await response.json()); }
    catch (error) { setNotice(error.message); }
  };
  const loadProfile = async () => {
    if (role !== 'Employee') { setProfile(null); return; }
    try { const response = await fetch(`${API}/profile`, { headers: authHeaders() }); if (!response.ok) throw new Error('Unable to load your profile'); setProfile(await response.json()); }
    catch (error) { setNotice(error.message); }
  };
  const loadMessages = async () => {
    try { const response = await fetch(`${API}/messages`, { headers: authHeaders() }); if (!response.ok) throw new Error('Unable to load messages'); setMessages(await response.json()); }
    catch (error) { setNotice(error.message); }
  };
  const loadAttendance = async () => {
    try { const response = await fetch(`${API}/attendance`, { headers: authHeaders() }); if (!response.ok) throw new Error('Unable to load attendance'); setAttendance(await response.json()); }
    catch (error) { setNotice(error.message); }
  };
  useEffect(() => { if (session) { loadRequests(); loadEmployees(); loadProfile(); loadMessages(); loadAttendance(); } }, [session]);

  const visibleRequests = useMemo(() => {
    const scoped = requests;
    return activeTab === 'All requests' ? scoped : scoped.filter(request => request.status === activeTab);
  }, [activeTab, requests, role]);
  const counts = useMemo(() => ({ pending: requests.filter(request => request.status === 'Pending').length, approved: requests.filter(request => request.status === 'Approved').length, days: requests.filter(request => request.status === 'Approved').reduce((sum, request) => sum + request.days, 0) }), [requests]);

  const transition = async (id, action) => {
    if (working.has(id)) return;
    setWorking(previous => new Set(previous).add(id));
    setNotice('');
    try {
      const response = await fetch(`${API}/leaves/${id}/${action}`, { method: 'POST', headers: authHeaders() });
      if (!response.ok) { const error = await response.json(); throw new Error(error.message); }
      const updated = await response.json();
      setRequests(previous => previous.map(request => request.id === id ? updated : request));
    } catch (error) { setNotice(error.message || 'Action failed. Please try again.'); await loadRequests(); }
    finally { setWorking(previous => { const next = new Set(previous); next.delete(id); return next; }); }
  };

  const submitRequest = async form => {
    const response = await fetch(`${API}/leaves`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ ...form, days: Math.max(1, Math.ceil((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1) }) });
    if (!response.ok) throw new Error('Could not submit request');
    const created = await response.json();
    setRequests(previous => [created, ...previous]); setShowForm(false); setActiveTab('All requests');
  };

  const sendMessage = async message => {
    const response = await fetch(`${API}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(message) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not send message.');
    setMessages(previous => [result, ...previous]);
  };

  const login = async (credentials, mode = 'login') => {
    const response = await fetch(`${API}/auth/${mode === 'signup' ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to log in.');
    localStorage.setItem('leaveflow_session', JSON.stringify(result));
    setSession(result); setNotice('');
  };
  const punch = async action => {
    setNotice('');
    try {
      const response = await fetch(`${API}/attendance/${action}`, { method: 'POST', headers: authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to update attendance.');
      setAttendance(previous => [result, ...previous.filter(record => record.id !== result.id && !(record.date === result.date && record.employeeEmail === result.employeeEmail))]);
    } catch (error) { setNotice(error.message); }
  };
  const updateAttendance = async form => {
    const response = await fetch(`${API}/attendance/${editingAttendance.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(form)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not update attendance.');
    setAttendance(previous => previous.map(record => record.id === editingAttendance.id ? result : record));
    setEditingAttendance(null);
  };
  const deleteAttendance = async id => {
    if (!window.confirm('Delete this attendance record?')) return;
    setWorking(previous => new Set(previous).add(id));
    try {
      const response = await fetch(`${API}/attendance/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Could not delete attendance.');
      }
      setAttendance(previous => previous.filter(record => record.id !== id));
    } catch (error) {
      setNotice(error.message || 'Delete failed. Please try again.');
    } finally {
      setWorking(previous => { const next = new Set(previous); next.delete(id); return next; });
    }
  };
  const logout = () => { localStorage.removeItem('leaveflow_session'); setSession(null); setRequests([]); setEmployees([]); setProfile(null); setAttendance([]); };
  const navigateTo = (section, message) => {
    const target = document.getElementById(section);
    setActiveNav(section);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (message) setNotice(message);
  };

  if (!session) return <Login onLogin={login} />;

  return <main className="app-shell">
    <aside className="sidebar"><div className="side-logo">LF</div><nav><button className={`side-link ${activeNav === 'dashboard' ? 'active' : ''}`} aria-label="Dashboard" onClick={() => navigateTo('dashboard')}>⌂</button><button className={`side-link ${activeNav === 'requests' ? 'active' : ''}`} aria-label="Leave requests" onClick={() => navigateTo('requests')}>▦</button><button className={`side-link ${activeNav === 'attendance' ? 'active' : ''}`} aria-label="Attendance" onClick={() => navigateTo('attendance')}>◷</button><button className={`side-link ${activeNav === 'employees' ? 'active' : ''}`} aria-label="Employees" onClick={() => navigateTo('employees')}>♙</button><button className={`side-link ${activeNav === 'messages' ? 'active' : ''}`} aria-label="Messages" onClick={() => navigateTo('messages')}>•••</button></nav><button className="side-link logout" aria-label="Log out" onClick={logout}>↪</button></aside>
    <div className="app-main">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark">LF</span><span>leaveflow</span></div><div className="topbar-right"><span className="sync-dot"><i /> Live sync</span><span className="logged-user">{session.user.name}</span><button className="avatar" onClick={logout}>↪</button></div></header>
      <div className="content">
      <section className="intro" id="dashboard"><div className="welcome-copy"><p className="eyebrow">September 2026 <span>•</span> {role.toLowerCase()} view</p><h1>Good morning, <em>{session.user.name.split(' ')[0]}</em></h1><p className="subtext">{role === 'Manager' ? 'Review your team and keep time off moving smoothly.' : 'Submit leave and keep track of every request.'}</p></div><div className="role-badge">{role} portal</div></section>
      <section className="metrics"><div className="metric"><span className="metric-label">Pending review</span><strong>{counts.pending}</strong><span className="metric-note">needs your attention</span></div><div className="metric"><span className="metric-label">Approved days</span><strong>{counts.days}</strong><span className="metric-note">across the team</span></div><div className="metric metric-accent"><span className="metric-label">Your allowance</span><strong>14 <small>/ 24 days</small></strong><div className="progress"><span style={{ width: '58%' }} /></div><span className="metric-note">10 days remaining</span></div></section>
      <section className="toolbar"><div className="tabs">{tabs.map(tab => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}<span>{tab === 'All requests' ? requests.length : requests.filter(request => request.status === tab).length}</span></button>)}</div>{role === 'Employee' && <button className="primary-button" onClick={() => setShowForm(true)}><b>+</b> Request time off</button>}</section>
      {notice && <div className="notice">{notice}</div>}
      <section className="attendance-section" id="attendance"><div className="section-title"><div><p className="eyebrow">Employee-wise attendance</p><h2>Attendance</h2></div><span>Weekdays · 9:00 AM - 6:00 PM</span></div>{role === 'Employee' || role === 'Manager' ? <><div className="attendance-today"><div><strong>{formatDate(todayKey())}</strong><span>{isWeekendDate() ? 'Weekend off' : attendance.find(record => record.date === todayKey())?.status || 'Not punched in'}</span></div><div className="attendance-times"><span>Punch in <b>{formatTime(attendance.find(record => record.date === todayKey())?.punchIn)}</b></span><span>Punch out <b>{formatTime(attendance.find(record => record.date === todayKey())?.punchOut)}</b></span></div><div className="attendance-actions">{!isWeekendDate() && !attendance.find(record => record.date === todayKey()) && <button className="primary-button" onClick={() => punch('punch-in')}>Punch in</button>}{!isWeekendDate() && attendance.find(record => record.date === todayKey())?.punchIn && !attendance.find(record => record.date === todayKey())?.punchOut && <button className="primary-button" onClick={() => punch('punch-out')}>Punch out</button>}</div></div><div className="attendance-history"><div className={`attendance-row attendance-header ${role === 'Manager' ? 'manager-attendance-header' : ''}`}><strong>{role === 'Manager' ? 'Employee' : 'Date'}</strong>{role === 'Manager' && <span>Date</span>}<span>Status</span><span>Punch in</span><span>Punch out</span>{role === 'Manager' && <span>Actions</span>}</div>{attendance.slice(0, 12).map(record => <div className={`attendance-row ${role === 'Manager' ? 'manager-attendance-row' : ''}`} key={record.id}><strong>{role === 'Manager' ? record.employeeName : formatDate(record.date)}</strong>{role === 'Manager' && <span>{formatDate(record.date)}</span>}<span>{record.status}</span><span>{formatTime(record.punchIn)}</span><span>{formatTime(record.punchOut)}</span>{role === 'Manager' && <div className="actions"><button className="cancel" disabled={working.has(record.id)} onClick={() => setEditingAttendance(record)}>Edit</button><button className="reject" disabled={working.has(record.id)} onClick={() => deleteAttendance(record.id)}>Delete</button></div>}</div>)}</div></> : <div className="attendance-history">{attendance.length === 0 ? <div className="empty-state">No attendance records yet.</div> : attendance.slice(0, 12).map(record => <div className="attendance-row" key={record.id}><strong>{record.employeeName}</strong><span>{formatDate(record.date)}</span><span>{formatTime(record.punchIn)}</span><span>{formatTime(record.punchOut)}</span></div>)}</div>}</section>
      <section className="request-list" id="requests"><div className="list-heading"><span>Leave requests</span><span>{visibleRequests.length} {visibleRequests.length === 1 ? 'request' : 'requests'}</span></div>{loading ? <div className="empty-state">Loading requests...</div> : visibleRequests.length === 0 ? <div className="empty-state">No requests in this view.</div> : visibleRequests.map(request => <article className="request-row" key={request.id}><div className="person"><span className="person-avatar">{request.employeeName.split(' ').map(part => part[0]).join('')}</span><div><strong>{request.employeeName}</strong><small>{request.type} <span>·</span> {request.days} {request.days === 1 ? 'day' : 'days'}</small></div></div><div className="date-range"><strong>{formatDate(request.startDate)}</strong><span>to</span><strong>{formatDate(request.endDate)}</strong></div><div className="reason">{request.reason || 'No reason provided'}</div><div className={`status ${statusClass(request.status)}`}><i />{request.status}</div><div className="actions">{role === 'Manager' && request.status === 'Pending' && <><button className="approve" disabled={working.has(request.id)} onClick={() => transition(request.id, 'approve')}>{working.has(request.id) ? 'Saving...' : 'Approve'}</button><button className="reject" disabled={working.has(request.id)} onClick={() => transition(request.id, 'reject')}>Reject</button></>}{role === 'Employee' && request.employeeName === session.user.name && request.status === 'Pending' && <button className="cancel" disabled={working.has(request.id)} onClick={() => transition(request.id, 'cancel')}>{working.has(request.id) ? 'Cancelling...' : 'Cancel'}</button>}</div></article>)}</section>
      <section className="employee-section" id="employees"><div className="section-title"><div><p className="eyebrow">{role === 'Manager' ? 'People directory' : 'Your profile'}</p><h2>{role === 'Manager' ? 'Employees' : 'Employee details'}</h2></div><span>{role === 'Manager' ? `${employees.length} active people` : 'Signed-in account'}</span></div><div className="employee-table"><div className="employee-table-head"><span>Employee</span><span>Department</span><span>Role</span><span>Leave used</span><span>Availability</span></div>{role === 'Manager' ? (employees.length === 0 ? <div className="empty-state">Loading employees...</div> : employees.map(employee => <div className="employee-row" key={employee.id}><div className="person"><span className="person-avatar">{employee.name.split(' ').map(part => part[0]).join('')}</span><div><strong>{employee.name}</strong><small>{employee.email}</small></div></div><span>{employee.department}</span><span>{employee.role}</span><span>{employee.usedDays} / {employee.allowance} days</span><span className="availability"><i />{employee.allowance - employee.usedDays} days left</span></div>)) : (profile ? <div className="employee-row"><div className="person"><span className="person-avatar">{profile.name.split(' ').map(part => part[0]).join('')}</span><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div><span>{profile.department}</span><span>{profile.role}</span><span>{profile.usedDays} / {profile.allowance} days</span><span className="availability"><i />{profile.allowance - profile.usedDays} days left</span></div> : <div className="empty-state">Loading your profile...</div>)}</div></section>
      <div id="messages"><MessageCenter role={role} employees={employees} messages={messages} onSend={sendMessage} /></div>
      </div>
    </div>
    {showForm && <RequestModal onClose={() => setShowForm(false)} onSubmit={submitRequest} />}
    {editingAttendance && <AttendanceModal onClose={() => setEditingAttendance(null)} onSubmit={updateAttendance} initialValues={editingAttendance} />}
  </main>;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const update = event => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async event => { event.preventDefault(); setLoading(true); setError(''); try { await onLogin(form, mode); } catch (loginError) { setError(loginError.message); setLoading(false); } };
  const isSignup = mode === 'signup';
  return <main className="login-page"><div className="login-art"><div className="login-logo">LF</div><p className="eyebrow">Employee leave management</p><h1>Time off,<br /><em>made clear.</em></h1><p>One calm place for teams to request, review, and track leave.</p></div><form className="login-card" onSubmit={submit}><div className="login-card-head"><p className="eyebrow">{isSignup ? 'New employee' : 'Welcome back'}</p><h2>{isSignup ? 'Create your account' : 'Sign in to Leaveflow'}</h2><p>{isSignup ? 'Register as an employee to request time off.' : 'Use your work account to continue.'}</p></div>{isSignup && <><label>Full name<input required minLength="2" type="text" name="name" value={form.name || ''} onChange={update} placeholder="Your full name" autoComplete="name" /></label><label>Department<input required type="text" name="department" value={form.department || ''} onChange={update} placeholder="e.g. Engineering" /></label></>}<label>Email address<input required type="email" name="email" value={form.email} onChange={update} placeholder="you@company.com" autoComplete="email" /></label><label>Password<input required minLength="8" type="password" name="password" value={form.password} onChange={update} placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'} autoComplete={isSignup ? 'new-password' : 'current-password'} /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button login-submit" disabled={loading}>{loading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create employee account' : 'Sign in')}</button><button type="button" className="auth-switch" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(''); }}>{isSignup ? 'Already have an account? Sign in' : 'New employee? Create an account'}</button><p className="login-hint">Manager accounts are configured securely by the administrator.</p></form></main>;
}

function RequestModal({ onClose, onSubmit, initialValues, title = 'New request', submitText = 'Submit request' }) {
  const [form, setForm] = useState(initialValues || { type: 'Annual leave', startDate: '', endDate: '', reason: '' }); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const update = event => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async event => { event.preventDefault(); if (!form.startDate || !form.endDate || form.endDate < form.startDate) return setError('Choose a valid date range.'); setSaving(true); try { await onSubmit(form); } catch (submitError) { setError(submitError.message); setSaving(false); } };
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">{title === 'Edit request' ? 'Update request' : 'New request'}</p><h2>{title}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Leave type<select name="type" value={form.type} onChange={update}><option>Annual leave</option><option>Sick leave</option><option>Personal day</option></select></label><div className="date-fields"><label>First day<input required type="date" name="startDate" value={form.startDate} onChange={update} /></label><label>Last day<input required type="date" name="endDate" value={form.endDate} onChange={update} /></label></div><label>Reason <span className="optional">optional</span><textarea name="reason" value={form.reason} onChange={update} placeholder="What is the time off for?" rows="3" /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button modal-submit" disabled={saving}>{saving ? 'Saving...' : submitText}</button></form></div>;
}

function AttendanceModal({ onClose, onSubmit, initialValues }) {
  const toLocalInput = value => value ? new Date(value).toISOString().slice(0, 16) : '';
  const [form, setForm] = useState({ date: initialValues.date, status: initialValues.status, punchIn: toLocalInput(initialValues.punchIn), punchOut: toLocalInput(initialValues.punchOut) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = event => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try { await onSubmit(form); } catch (submitError) { setError(submitError.message); setSaving(false); }
  };
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Update attendance</p><h2>Edit attendance</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Employee<input disabled value={initialValues.employeeName} /></label><label>Date<input required type="date" name="date" value={form.date} onChange={update} /></label><label>Status<select name="status" value={form.status} onChange={update}><option>Present</option><option>Off</option></select></label><div className="date-fields"><label>Punch in<input type="datetime-local" name="punchIn" value={form.punchIn} onChange={update} /></label><label>Punch out<input type="datetime-local" name="punchOut" value={form.punchOut} onChange={update} /></label></div>{error && <p className="form-error">{error}</p>}<button className="primary-button modal-submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></form></div>;
}

function MessageCenter({ role, employees, messages, onSend }) {
  const [form, setForm] = useState({ recipientEmail: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const update = event => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async event => { event.preventDefault(); setSending(true); setError(''); try { await onSend(form); setForm({ recipientEmail: '', subject: '', body: '' }); } catch (sendError) { setError(sendError.message); } finally { setSending(false); } };
  return <section className="message-section"><div className="section-title"><div><p className="eyebrow">Team inbox</p><h2>Messages</h2></div><span>{messages.length} conversations</span></div><div className="message-layout"><div className="message-list">{messages.length === 0 ? <div className="empty-state">No messages yet.</div> : messages.map(message => <article className="message-item" key={message.id}><div className="message-meta"><strong>{message.senderName}</strong><span>{new Date(message.createdAt).toLocaleDateString()}</span></div><h3>{message.subject}</h3><p>{message.body}</p><small>To: {message.recipientName}</small></article>)}</div><form className="message-compose" onSubmit={submit}><p className="eyebrow">New message</p>{role === 'Manager' && <label>Send to<select required name="recipientEmail" value={form.recipientEmail} onChange={update}><option value="">Choose employee</option>{employees.map(employee => <option key={employee.id} value={employee.email}>{employee.name}</option>)}</select></label>}<label>Subject<input required maxLength="120" name="subject" value={form.subject} onChange={update} placeholder="About your leave request" /></label><label>Message<textarea required maxLength="2000" name="body" value={form.body} onChange={update} placeholder="Write a message..." rows="5" /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={sending}>{sending ? 'Sending...' : 'Send message'}</button></form></div></section>;
}

export default App;
