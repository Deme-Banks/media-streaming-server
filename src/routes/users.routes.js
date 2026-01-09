/**
 * Users Routes
 */

const express = require('express');
const router = express.Router();
const UserService = require('../services/userService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const userService = new UserService();

// Get all users (admin or household members list)
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const users = await userService.getAllUsers();
  res.json(users);
}));

module.exports = router;
