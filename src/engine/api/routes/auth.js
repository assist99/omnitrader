const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Database = require('../../db/database');
const { signToken } = require('../../utils/auth');
const { registerSchema, loginSchema, passwordSchema } = require('../../utils/validation');

const db = new Database();
db.connect().catch(() => {});

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const existing = await db.getUserByEmail(parsed.email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(parsed.password, 10);
    const user = await db.createUser(parsed.email, hash);
    const token = signToken({ id: user.id, email: user.email });

    res.json({ success: true, data: { token, user } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const user = await db.getUserByEmail(parsed.email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(parsed.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: user.id, email: user.email });
    res.json({ success: true, data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    const token = auth.split(' ')[1];
    const jwt = require('../../utils/auth');
    const payload = jwt.verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid token' });

    const user = await db.getUserById(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, data: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  // Token invalidation not implemented; clients should discard token
  res.json({ success: true });
});

router.patch('/password', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    const token = auth.split(' ')[1];
    const jwt = require('../../utils/auth');
    const payload = jwt.verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid token' });

    const parsed = passwordSchema.parse(req.body);
    const user = await db.getUserById(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newHash = await bcrypt.hash(parsed.newPassword, 10);
    await db.updateUserPassword(user.id, newHash);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
