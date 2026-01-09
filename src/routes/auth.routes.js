/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const UserService = require('../services/userService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const userService = new UserService();

// Register new user
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, displayName } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const user = await userService.register(username, password, displayName);
  req.session.userId = user.id;
  req.session.username = user.username;

  res.status(201).json({ message: 'User registered successfully', user });
}));

// Login
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = await userService.authenticate(username, password);
  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({ message: 'Login successful', user });
}));

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Get current user
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
}));

module.exports = router;
