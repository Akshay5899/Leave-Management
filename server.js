import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
const port = process.env.PORT || 4001;
const jwtSecret = process.env.JWT_SECRET || 'leaveflow-development-secret';
const managerEmail = (process.env.MANAGER_EMAIL || 'akshaykhot5899@gmail.com').toLowerCase();
const managerPassword = process.env.MANAGER_PASSWORD || 'Akshay@5899';
const employeePassword = process.env.EMPLOYEE_PASSWORD || 'leaveflow123';
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(origin => origin.trim()).filter(Boolean);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json({ limit: '1mb' }));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many login attempts. Try again later.' } });

const leaveSchema = new mongoose.Schema({
  employeeName: { type: String, required: true },
  employeeEmail: { type: String, required: true },
  type: { type: String, enum: ['Annual leave', 'Sick leave', 'Personal day'], required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  days: { type: Number, required: true },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
  submittedAt: { type: Date, default: Date.now },
  decidedAt: Date
}, { timestamps: true });
const Leave = mongoose.model('Leave', leaveSchema);

const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  role: { type: String, required: true },
  allowance: { type: Number, default: 24 },
  usedDays: { type: Number, default: 0 },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });
const Employee = mongoose.model('Employee', employeeSchema);

const messageSchema = new mongoose.Schema({
  senderName: { type: String, required: true },
  senderEmail: { type: String, required: true },
  senderRole: { type: String, enum: ['Manager', 'Employee'], required: true },
  recipientName: { type: String, required: true },
  recipientEmail: { type: String, required: true },
  subject: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 2000 },
  read: { type: Boolean, default: false }
}, { timestamps: true });
const Message = mongoose.model('Message', messageSchema);

const seed = [
  { id: 'demo-1', employeeName: 'Maya Patel', employeeEmail: 'maya.patel@northstar.co', type: 'Annual leave', startDate: '2026-09-18', endDate: '2026-09-22', days: 3, reason: 'Family trip', status: 'Pending', submittedAt: '2026-09-08T09:30:00.000Z' },
  { id: 'demo-2', employeeName: 'Jon Bell', employeeEmail: 'jon.bell@northstar.co', type: 'Sick leave', startDate: '2026-09-09', endDate: '2026-09-10', days: 2, reason: 'Recovery time', status: 'Approved', submittedAt: '2026-09-07T12:10:00.000Z' },
  { id: 'demo-3', employeeName: 'Rina Das', employeeEmail: 'rina.das@northstar.co', type: 'Personal day', startDate: '2026-09-15', endDate: '2026-09-15', days: 1, reason: 'Appointment', status: 'Rejected', submittedAt: '2026-09-04T15:00:00.000Z' },
  { id: 'demo-4', employeeName: 'Maya Patel', employeeEmail: 'maya.patel@northstar.co', type: 'Annual leave', startDate: '2026-10-05', endDate: '2026-10-09', days: 5, reason: 'Autumn break', status: 'Approved', submittedAt: '2026-08-28T10:15:00.000Z' }
];
const employeeSeed = [
  { name: 'Maya Patel', email: 'maya.patel@northstar.co', department: 'Product', role: 'Product designer', allowance: 24, usedDays: 14 },
  { name: 'Jon Bell', email: 'jon.bell@northstar.co', department: 'Engineering', role: 'Senior engineer', allowance: 24, usedDays: 9 },
  { name: 'Rina Das', email: 'rina.das@northstar.co', department: 'Operations', role: 'Operations lead', allowance: 24, usedDays: 16 },
  { name: 'Theo Morgan', email: 'theo.morgan@northstar.co', department: 'Marketing', role: 'Content strategist', allowance: 24, usedDays: 6 }
];
let memoryLeaves = [...seed];
let memoryEmployees = [...employeeSeed];
let memoryMessages = [];
const useMongo = Boolean(process.env.MONGODB_URI);

const serialize = leave => {
  const item = leave.toObject ? leave.toObject() : leave;
  return { ...item, id: item.id || item._id?.toString() };
};

const authenticate = (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Login required.' });
  try { req.user = jwt.verify(token, jwtSecret); next(); }
  catch { return res.status(401).json({ message: 'Your session has expired. Please log in again.' }); }
};
const requireManager = (req, res, next) => {
  if (req.user.role !== 'Manager') return res.status(403).json({ message: 'Only managers can perform this action.' });
  next();
};
const requireEmployee = (req, res, next) => {
  if (req.user.role !== 'Employee' || !req.user.email) return res.status(403).json({ message: 'Only an authenticated employee can submit leave.' });
  next();
};

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (email === managerEmail && password === managerPassword) {
      const user = { name: 'Manager', email: managerEmail, role: 'Manager' };
      return res.json({ token: jwt.sign(user, jwtSecret, { expiresIn: '8h' }), user });
    }
    const employee = useMongo
      ? await Employee.findOne({ email }).select('+passwordHash').lean()
      : memoryEmployees.find(item => item.email === email);
    const valid = employee && (useMongo ? await bcrypt.compare(password, employee.passwordHash) : password === employeePassword);
    if (!valid) return res.status(401).json({ message: 'Invalid email or password.' });
    const user = { name: employee.name, email: employee.email, role: 'Employee' };
    res.json({ token: jwt.sign(user, jwtSecret, { expiresIn: '8h' }), user });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', loginLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const department = String(req.body.department || 'General').trim();
    if (name.length < 2 || !email.includes('@') || password.length < 8) return res.status(400).json({ message: 'Enter a name, valid email, and password of at least 8 characters.' });
    if (email === managerEmail) return res.status(409).json({ message: 'That email is reserved for manager access.' });
    if (useMongo) {
      if (await Employee.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });
      const employee = await Employee.create({ name, email, department, role: 'Employee', allowance: 24, usedDays: 0, passwordHash: await bcrypt.hash(password, 10) });
      const user = { name: employee.name, email: employee.email, role: 'Employee' };
      return res.status(201).json({ token: jwt.sign(user, jwtSecret, { expiresIn: '8h' }), user });
    }
    if (memoryEmployees.some(employee => employee.email === email)) return res.status(409).json({ message: 'An account with this email already exists.' });
    const employee = { name, email, department, role: 'Employee', allowance: 24, usedDays: 0 };
    memoryEmployees = [...memoryEmployees, employee];
    const user = { name, email, role: 'Employee' };
    res.status(201).json({ token: jwt.sign(user, jwtSecret, { expiresIn: '8h' }), user });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    next(error);
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, database: useMongo && mongoose.connection.readyState === 1 ? 'mongodb' : 'demo-memory' }));
app.get('/api/leaves', authenticate, async (req, res, next) => {
  try {
    const isEmployee = req.user.role === 'Employee';
    const leaves = useMongo
      ? await Leave.find(isEmployee ? { employeeEmail: req.user.email } : {}).sort({ submittedAt: -1 }).lean()
      : memoryLeaves.filter(leave => !isEmployee || leave.employeeEmail.toLowerCase() === req.user.email);
    res.json(leaves.map(serialize));
  } catch (error) { next(error); }
});
app.get('/api/employees', authenticate, requireManager, async (_req, res, next) => {
  try {
    const employees = useMongo ? await Employee.find().sort({ name: 1 }).lean() : memoryEmployees;
    res.json(employees.map(serialize));
  } catch (error) { next(error); }
});

app.get('/api/profile', authenticate, async (req, res, next) => {
  try {
    const employee = useMongo
      ? await Employee.findOne({ email: req.user.email }).lean()
      : memoryEmployees.find(item => item.email === req.user.email);
    if (!employee) return res.status(404).json({ message: 'Employee profile not found.' });
    res.json(serialize(employee));
  } catch (error) { next(error); }
});

app.get('/api/messages', authenticate, async (req, res, next) => {
  try {
    const filter = req.user.role === 'Manager'
      ? {}
      : { $or: [{ senderEmail: req.user.email }, { recipientEmail: req.user.email }] };
    const messages = useMongo
      ? await Message.find(filter).sort({ createdAt: -1 }).lean()
      : memoryMessages.filter(message => req.user.role === 'Manager' || message.senderEmail === req.user.email || message.recipientEmail === req.user.email).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(messages.map(serialize));
  } catch (error) { next(error); }
});

app.post('/api/messages', authenticate, async (req, res, next) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    if (!subject || !body) return res.status(400).json({ message: 'Subject and message are required.' });
    let recipientEmail = managerEmail;
    let recipientName = 'Manager';
    if (req.user.role === 'Manager') {
      recipientEmail = String(req.body.recipientEmail || '').trim().toLowerCase();
      const employee = useMongo ? await Employee.findOne({ email: recipientEmail }).lean() : memoryEmployees.find(item => item.email === recipientEmail);
      if (!employee) return res.status(404).json({ message: 'Employee recipient not found.' });
      recipientName = employee.name;
    }
    const payload = { senderName: req.user.name, senderEmail: req.user.email, senderRole: req.user.role, recipientName, recipientEmail, subject, body, read: false };
    const message = useMongo ? await Message.create(payload) : { ...payload, id: randomUUID(), createdAt: new Date().toISOString() };
    if (!useMongo) memoryMessages = [message, ...memoryMessages];
    res.status(201).json(serialize(message));
  } catch (error) { next(error); }
});

app.post('/api/leaves', authenticate, requireEmployee, async (req, res, next) => {
  try {
    const payload = { ...req.body, employeeName: req.user.name, employeeEmail: req.user.email };
    const leave = { ...payload, id: randomUUID(), status: 'Pending', submittedAt: new Date().toISOString() };
    if (useMongo) res.status(201).json(serialize(await Leave.create(payload)));
    else { memoryLeaves = [leave, ...memoryLeaves]; res.status(201).json(leave); }
  } catch (error) { next(error); }
});

async function transition(req, res, next, nextStatus) {
  try {
    if (nextStatus === 'Cancelled' && req.user.role !== 'Employee') return res.status(403).json({ message: 'Only employees can cancel their own leave.' });
    if (useMongo) {
      const filter = { _id: req.params.id, status: 'Pending' };
      if (nextStatus === 'Cancelled') filter.employeeEmail = req.user.email;
      const updated = await Leave.findOneAndUpdate(filter, { $set: { status: nextStatus, decidedAt: new Date() } }, { new: true });
      if (!updated) return res.status(409).json({ message: 'This request is no longer pending.' });
      return res.json(serialize(updated));
    }
    const index = memoryLeaves.findIndex(leave => leave.id === req.params.id && leave.status === 'Pending' && (nextStatus !== 'Cancelled' || leave.employeeEmail.toLowerCase() === req.user.email));
    if (index === -1) return res.status(409).json({ message: 'This request is no longer pending.' });
    memoryLeaves[index] = { ...memoryLeaves[index], status: nextStatus, decidedAt: new Date().toISOString() };
    return res.json(memoryLeaves[index]);
  } catch (error) { return next(error); }
}
app.post('/api/leaves/:id/approve', authenticate, requireManager, (req, res, next) => transition(req, res, next, 'Approved'));
app.post('/api/leaves/:id/reject', authenticate, requireManager, (req, res, next) => transition(req, res, next, 'Rejected'));
app.post('/api/leaves/:id/cancel', authenticate, requireEmployee, (req, res, next) => transition(req, res, next, 'Cancelled'));

app.use((error, _req, res, _next) => res.status(500).json({ message: error.message || 'Unexpected server error' }));

async function start() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production.');
  if (useMongo) {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash(employeePassword, 10);
    if (await Employee.countDocuments() === 0) await Employee.insertMany(employeeSeed.map(employee => ({ ...employee, passwordHash })));
    else await Employee.updateMany({ passwordHash: { $exists: false } }, { $set: { passwordHash } });
    console.log('Connected to MongoDB Atlas');
  } else console.log('MONGODB_URI not set; using demo memory data');
  const server = app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port}`));
  const shutdown = async signal => { console.log(`${signal}: shutting down`); await mongoose.disconnect(); server.close(() => process.exit(0)); };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
start().catch(error => { console.error('Could not start API:', error); process.exit(1); });
