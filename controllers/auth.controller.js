const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { log } = require('../services/logger');
const { logActivity } = require('../services/activityLogger');
const planLimits = require('../config/planLimits');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'placeholder');

const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // First user is ADMIN
    const count = await User.countDocuments();
    const role = count === 0 ? 'ADMIN' : 'USER';
    
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      status: 'APPROVED',
      plan: 'FREEMIUM',
      approvedAt: new Date(),
      approvedBy: null
    });

    log('signup', {
      email: user.email,
      userId: user._id,
      status: 'success',
      plan: user.plan
    });

    logActivity(user._id, 'signup', { plan: user.plan, autoApproved: true });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Account created! You can login now.',
      token,
      user: { id: user._id, name: user.name, email: user.email, status: user.status, role: user.role, plan: user.plan }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, error: 'Server error during signup' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, error: 'Please sign in with Google' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid email or password' });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ success: false, error: 'Your account has been rejected. Please contact support.' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    log('login', {
      email: user.email,
      userId: user._id,
      status: 'success'
    });

    logActivity(user._id, 'login', { ip: req.ip });

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, status: user.status, role: user.role, plan: user.plan }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
};

const getMe = async (req, res) => {
  const planDetails = {
    maxMessagesPerDay: req.user.dailyMessageLimit || 50,
    maxAccounts: req.user.plan === 'PREMIUM' ? 999 : 1,
    maxCampaignsPerDay: req.user.plan === 'PREMIUM' ? 999 : 1,
    maxContacts: req.user.plan === 'PREMIUM' ? 999999 : 500
  };
  
  res.json({
    success: true,
    user: { 
      id: req.user.id, 
      name: req.user.name, 
      email: req.user.email, 
      status: req.user.status, 
      role: req.user.role,
      plan: req.user.plan,
      planDetails
    }
  });
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please provide both current and new password' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect current password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    logActivity(user._id, 'password_changed', { ip: req.ip });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error while updating password' });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { token: googleToken } = req.body;
    
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID || 'placeholder'
    }).catch(err => {
      console.error('verifyIdToken failed:', err);
      return null;
    });

    if (!ticket) {
      return res.status(400).json({ success: false, error: 'Invalid Google token' });
    }
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;
    
    let user = await User.findOne({ email });
    
    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.googleEmail = email;
        await user.save();
      }
    } else {
      const count = await User.countDocuments();
      const role = count === 0 ? 'ADMIN' : 'USER';
      
      user = await User.create({
        name,
        email,
        googleId,
        googleEmail: email,
        role,
        status: 'APPROVED',
        plan: 'FREEMIUM',
        approvedAt: new Date(),
        approvedBy: null
      });
      
      logActivity(user._id, 'signup_google', { plan: user.plan, autoApproved: true });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ success: false, error: 'Your account has been rejected. Please contact support.' });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    logActivity(user._id, 'login_google', { ip: req.ip });
    
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, status: user.status, role: user.role, plan: user.plan }
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
};

const addWhatsApp = async (req, res) => {
  try {
    const { countryCode, whatsappNumber } = req.body;
    
    if (!whatsappNumber) {
      return res.status(400).json({ success: false, error: 'WhatsApp number is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.countryCode = countryCode;
    user.whatsappNumber = whatsappNumber;
    await user.save();

    res.json({ success: true, message: 'WhatsApp number saved successfully' });
  } catch (error) {
    console.error('Add WhatsApp error:', error);
    res.status(500).json({ success: false, error: 'Failed to save WhatsApp number' });
  }
};

module.exports = { signup, login, getMe, changePassword, googleLogin, addWhatsApp };
