const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Url = require('../models/Url');
const QRCode = require('qrcode');
const useragent = require('express-useragent');
const rateLimit = require('express-rate-limit');

// Rate limiting for URL creation
const createUrlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10 // limit each IP to 10 URL creations per windowMs
});

// Create short URL
router.post('/', auth, createUrlLimiter, async (req, res) => {
  try {
    const { originalUrl, customAlias, title, description, tags, expiresAt, settings } = req.body;

    // Validate URL
    try {
      new URL(originalUrl);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Check if custom alias is available
    if (customAlias) {
      const existingUrl = await Url.findOne({ 
        $or: [{ shortCode: customAlias }, { customAlias }]
      });
      if (existingUrl) {
        return res.status(400).json({ error: 'Custom alias already taken' });
      }
    }

    // Create URL document
    const url = new Url({
      originalUrl,
      user: req.user.id,
      shortCode: customAlias || undefined,
      customAlias,
      title,
      description,
      tags: tags?.split(',').map(tag => tag.trim()),
      expiresAt: expiresAt || undefined,
      settings: {
        ...settings,
        redirectType: settings?.redirectType || 'direct',
        redirectDelay: settings?.redirectDelay || 0
      }
    });

    await url.save();
    res.json(url);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all URLs for user with pagination and filters
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || '-createdAt';
    const filter = req.query.filter || 'all';
    const search = req.query.search || '';
    const timeRange = req.query.timeRange || '7d';

    // Build query
    const query = { user: req.user.id };

    // Apply filters
    if (filter !== 'all') {
      query.status = filter;
    }

    // Apply search
    if (search) {
      query.$or = [
        { originalUrl: { $regex: search, $options: 'i' } },
        { shortCode: { $regex: search, $options: 'i' } },
        { customAlias: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Apply time range
    if (timeRange) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(timeRange));
      query.createdAt = { $gte: date };
    }

    // Execute query with pagination
    const urls = await Url.find(query)
      .sort(sortBy)
      .skip((page - 1) * limit)
      .limit(limit);

    // Get total count
    const total = await Url.countDocuments(query);

    // Get analytics summary for each URL
    const urlsWithAnalytics = await Promise.all(
      urls.map(async (url) => {
        const analytics = await url.getAnalyticsSummary(parseInt(timeRange));
        return {
          ...url.toObject(),
          analytics
        };
      })
    );

    res.json({
      urls: urlsWithAnalytics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single URL with analytics
router.get('/:id', auth, async (req, res) => {
  try {
    const url = await Url.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const analytics = await url.getAnalyticsSummary();
    res.json({
      ...url.toObject(),
      analytics
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update URL
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, description, tags, status, expiresAt, settings } = req.body;
    const url = await Url.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Update fields
    if (title) url.title = title;
    if (description) url.description = description;
    if (tags) url.tags = tags.split(',').map(tag => tag.trim());
    if (status) url.status = status;
    if (expiresAt) url.expiresAt = expiresAt;
    if (settings) {
      url.settings = {
        ...url.settings,
        ...settings
      };
    }

    await url.save();
    res.json(url);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete URL
router.delete('/:id', auth, async (req, res) => {
  try {
    const url = await Url.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    res.json({ message: 'URL deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Regenerate QR code
router.post('/:id/qr', auth, async (req, res) => {
  try {
    const url = await Url.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const fullUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/${url.shortCode}`;
    url.qrCode = await QRCode.toDataURL(fullUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    await url.save();
    res.json({ qrCode: url.qrCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Handle URL redirection and analytics
router.get('/:shortCode', async (req, res) => {
  try {
    const url = await Url.findOne({
      $or: [
        { shortCode: req.params.shortCode },
        { customAlias: req.params.shortCode }
      ]
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Check if URL is expired
    if (url.checkExpiration()) {
      return res.status(410).json({ error: 'URL has expired' });
    }

    // Parse user agent
    const ua = useragent.parse(req.headers['user-agent']);

    // Record analytics
    const analyticsData = {
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || '',
      device: ua.isMobile ? 'mobile' : ua.isTablet ? 'tablet' : 'desktop',
      browser: ua.browser,
      browserVersion: ua.version,
      os: ua.os,
      platform: ua.platform,
      language: req.headers['accept-language']?.split(',')[0] || 'unknown',
      timeOnPage: req.query.timeOnPage ? parseInt(req.query.timeOnPage) : undefined,
      exitPage: req.query.exitPage
    };

    // Record click asynchronously
    url.recordClick(analyticsData).catch(console.error);

    // Handle redirect based on settings
    if (url.settings.redirectType === 'delayed') {
      res.send(`
        <html>
          <head>
            <meta http-equiv="refresh" content="${url.settings.redirectDelay};url=${url.originalUrl}">
            <style>
              body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .container { text-align: center; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Redirecting in ${url.settings.redirectDelay} seconds...</h1>
              <p>Click <a href="${url.originalUrl}">here</a> if you're not redirected automatically.</p>
            </div>
          </body>
        </html>
      `);
    } else {
      res.redirect(url.originalUrl);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add this route before the other routes
// Get URL statistics summary
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const urls = await Url.find({ user: req.user.id });
    
    // Calculate total stats
    const totalUrls = urls.length;
    const totalClicks = urls.reduce((sum, url) => sum + url.clicks, 0);
    const activeUrls = urls.filter(url => url.status === 'active').length;

    // Calculate growth rates
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const urlsLastMonth = urls.filter(url => url.createdAt >= lastMonth);
    const urlGrowth = totalUrls ? (urlsLastMonth.length / totalUrls) * 100 : 0;

    const clicksLastMonth = urls.reduce((sum, url) => {
      const recentClicks = url.analytics.filter(a => new Date(a.timestamp) >= lastMonth).length;
      return sum + recentClicks;
    }, 0);
    const clickGrowth = totalClicks ? (clicksLastMonth / totalClicks) * 100 : 0;

    // Get top performing URLs
    const topUrls = [...urls]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map(url => ({
        shortCode: url.shortCode,
        originalUrl: url.originalUrl,
        clicks: url.clicks,
        uniqueClicks: url.uniqueClicks
      }));

    // Calculate device and browser stats
    const deviceStats = {};
    const browserStats = {};
    const countryStats = {};

    urls.forEach(url => {
      url.analytics.forEach(analytic => {
        // Device stats
        deviceStats[analytic.device] = (deviceStats[analytic.device] || 0) + 1;
        
        // Browser stats
        browserStats[analytic.browser] = (browserStats[analytic.browser] || 0) + 1;
        
        // Country stats
        if (analytic.country) {
          countryStats[analytic.country] = (countryStats[analytic.country] || 0) + 1;
        }
      });
    });

    res.json({
      totalUrls,
      totalClicks,
      activeUrls,
      urlGrowth: Math.round(urlGrowth * 100) / 100,
      clickGrowth: Math.round(clickGrowth * 100) / 100,
      topUrls,
      deviceStats,
      browserStats,
      countryStats,
      averageClicksPerUrl: totalUrls ? Math.round(totalClicks / totalUrls) : 0,
      conversionRate: totalClicks ? Math.round((urls.reduce((sum, url) => sum + url.uniqueClicks, 0) / totalClicks) * 100) : 0
    });
  } catch (error) {
    console.error('Stats summary error:', error);
    res.status(500).json({ message: 'Error fetching stats summary', error: error.message });
  }
});

module.exports = router;
