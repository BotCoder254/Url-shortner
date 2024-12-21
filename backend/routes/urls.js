const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Url = require('../models/Url');
const { nanoid } = require('nanoid');

// Get all URLs for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const urls = await Url.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(urls);
  } catch (error) {
    console.error('Error fetching URLs:', error);
    res.status(500).json({ error: 'Error fetching URLs' });
  }
});

// Get URL stats summary
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get total URLs
    const totalUrls = await Url.countDocuments({ user: userId });

    // Get total clicks
    const urls = await Url.find({ user: userId });
    const totalClicks = urls.reduce((sum, url) => sum + url.clicks, 0);

    // Get active URLs (URLs with clicks in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUrls = await Url.countDocuments({
      user: userId,
      lastClickedAt: { $gte: thirtyDaysAgo }
    });

    // Calculate growth percentages
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const lastMonthUrls = await Url.countDocuments({
      user: userId,
      createdAt: { $lte: lastMonth }
    });

    const lastMonthClicks = await Url.aggregate([
      {
        $match: {
          user: userId,
          createdAt: { $lte: lastMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: '$clicks' }
        }
      }
    ]);

    const urlsGrowth = lastMonthUrls === 0 ? 100 : ((totalUrls - lastMonthUrls) / lastMonthUrls) * 100;
    const clicksGrowth = lastMonthClicks.length === 0 ? 100 : 
      ((totalClicks - lastMonthClicks[0]?.totalClicks || 0) / (lastMonthClicks[0]?.totalClicks || 1)) * 100;

    res.json({
      totalUrls,
      totalClicks,
      activeUrls,
      urlsGrowth: Math.round(urlsGrowth * 100) / 100,
      clicksGrowth: Math.round(clicksGrowth * 100) / 100
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

// Get analytics for a specific URL
router.get('/:id/analytics', auth, async (req, res) => {
  try {
    const url = await Url.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Get analytics data for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = url.analytics.filter(item => 
      new Date(item.timestamp) >= thirtyDaysAgo
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching URL analytics:', error);
    res.status(500).json({ error: 'Error fetching URL analytics' });
  }
});

// Create a new short URL
router.post('/', auth, async (req, res) => {
  try {
    const { originalUrl, customAlias, expiresAt } = req.body;

    // Validate URL
    try {
      new URL(originalUrl);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Check if custom alias is available
    if (customAlias) {
      const existingUrl = await Url.findOne({ shortUrl: customAlias });
      if (existingUrl) {
        return res.status(400).json({ error: 'Custom alias already in use' });
      }
    }

    const shortUrl = customAlias || nanoid(8);
    const url = new Url({
      originalUrl,
      shortUrl,
      user: req.user._id,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    await url.save();
    res.status(201).json(url);
  } catch (error) {
    console.error('Error creating URL:', error);
    res.status(500).json({ error: 'Error creating URL' });
  }
});

// Update URL click count and analytics
router.post('/:shortUrl/click', async (req, res) => {
  try {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    
    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Check if URL has expired
    if (url.expiresAt && new Date() > url.expiresAt) {
      return res.status(410).json({ error: 'URL has expired' });
    }

    // Update click count and analytics
    url.clicks += 1;
    url.lastClickedAt = new Date();
    
    // Add analytics data
    url.analytics.push({
      timestamp: new Date(),
      visits: 1,
      referrer: req.get('Referrer') || 'Direct',
      userAgent: req.get('User-Agent')
    });

    await url.save();
    res.json({ originalUrl: url.originalUrl });
  } catch (error) {
    console.error('Error updating click count:', error);
    res.status(500).json({ error: 'Error updating click count' });
  }
});

module.exports = router;
