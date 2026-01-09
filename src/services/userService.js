const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

/**
 * User Service
 * Manages user accounts and authentication for household members
 */
class UserService {
  constructor() {
    this.usersDir = path.join(__dirname, '../../.data');
    this.usersFile = path.join(this.usersDir, 'users.json');
    this.initializeStorage();
  }

  /**
   * Initialize storage directory and file
   */
  async initializeStorage() {
    await fs.ensureDir(this.usersDir);
    if (!await fs.pathExists(this.usersFile)) {
      await fs.writeJson(this.usersFile, []);
    }
  }

  /**
   * Load users from file
   */
  async loadUsers() {
    try {
      const data = await fs.readJson(this.usersFile);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  /**
   * Save users to file
   */
  async saveUsers(users) {
    try {
      await fs.writeJson(this.usersFile, users, { spaces: 2 });
    } catch (error) {
      console.error('Error saving users:', error);
      throw error;
    }
  }

  /**
   * Register a new user
   */
  async register(username, password, displayName = null) {
    const users = await this.loadUsers();

    // Check if username already exists
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username already exists');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const newUser = {
      id: uuidv4(),
      username: username.toLowerCase(),
      displayName: displayName || username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      role: 'user' // Can be 'admin' or 'user'
    };

    users.push(newUser);
    await this.saveUsers(users);

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  /**
   * Authenticate user
   */
  async authenticate(username, password) {
    const users = await this.loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
      throw new Error('Invalid username or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid username or password');
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const users = await this.loadUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return null;
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    const users = await this.loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
      return null;
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get all users (admin function)
   */
  async getAllUsers() {
    const users = await this.loadUsers();
    return users.map(user => {
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  /**
   * Update user profile
   */
  async updateUser(userId, updates) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    // Don't allow updating password or id through this method
    const { password, id, ...allowedUpdates } = updates;

    users[userIndex] = {
      ...users[userIndex],
      ...allowedUpdates,
      updatedAt: new Date().toISOString()
    };

    await this.saveUsers(users);

    const { password: _, ...userWithoutPassword } = users[userIndex];
    return userWithoutPassword;
  }

  /**
   * Delete user
   */
  async deleteUser(userId) {
    const users = await this.loadUsers();
    const filteredUsers = users.filter(u => u.id !== userId);

    if (filteredUsers.length === users.length) {
      throw new Error('User not found');
    }

    await this.saveUsers(filteredUsers);
    return true;
  }
}

module.exports = UserService;
