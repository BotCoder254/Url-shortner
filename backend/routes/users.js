const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Url = require('../models/Url');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { check, validationResult } = require('express-validator');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profiles';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// @route   GET /api/users/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    console.log('Fetching user profile for ID:', req.user.id);
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/me
// @desc    Update current user profile
// @access  Private
router.put('/me', [auth, upload.single('profileImage')], async (req, res) => {
  try {
    let user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Handle profile image upload
    if (req.file) {
      // Delete old profile image if it exists
      if (user.profileImage) {
        const oldImagePath = path.join(__dirname, '..', user.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      user.profileImage = '/uploads/profiles/' + req.file.filename;
    }

    // Update user fields if provided
    const { name, email, company, website } = req.body;
    if (name) user.name = name;
    if (email) {
      // Check if email is already in use by another user
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }
    if (company) user.company = company;
    if (website) user.website = website;

    user.updatedAt = Date.now();
    await user.save();

    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    res.json(userResponse);
  } catch (err) {
    console.error('Error updating user profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/me/image
// @desc    Delete current user's profile image
// @access  Private
router.delete('/me/image', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.profileImage) {
      const imagePath = path.join(__dirname, '..', user.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      user.profileImage = '';
      await user.save();
    }

    res.json({ message: 'Profile image removed' });
  } catch (err) {
    console.error('Error deleting profile image:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/me/stats
// @desc    Get current user's stats
// @access  Private
router.get('/me/stats', auth, async (req, res) => {
  try {
    const stats = await Url.aggregate([
      { $match: { user: req.user.id } },
      {
        $group: {
          _id: null,
          totalUrls: { $sum: 1 },
          totalClicks: { $sum: '$clicks' },
          activeUrls: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$expiresAt', null] },
                  { $gt: ['$expiresAt', new Date()] }
                ]},
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      totalUrls: stats[0]?.totalUrls || 0,
      totalClicks: stats[0]?.totalClicks || 0,
      activeUrls: stats[0]?.activeUrls || 0
    });
  } catch (err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 