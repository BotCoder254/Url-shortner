const mongoose = require('mongoose');
const shortid = require('shortid');
const geoip = require('geoip-lite');
const QRCode = require('qrcode');

const analyticsSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String,
    default: '',
  },
  userAgent: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  referrer: {
    type: String,
    default: '',
  },
  country: {
    type: String,
    default: '',
  },
  city: {
    type: String,
    default: '',
  },
  region: {
    type: String,
    default: '',
  },
  timezone: {
    type: String,
    default: '',
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'other'],
    default: 'other'
  },
  browser: {
    type: String,
    default: '',
  },
  browserVersion: {
    type: String,
    default: '',
  },
  os: {
    type: String,
    default: '',
  },
  platform: {
    type: String,
    default: '',
  },
  language: {
    type: String,
    default: '',
  },
  timeOnPage: {
    type: Number,
    default: 0,
  },
  exitPage: {
    type: String,
    default: '',
  },
  clickPath: [String]
});

const urlSchema = new mongoose.Schema({
  originalUrl: {
    type: String,
    required: [true, 'Please provide the URL to shorten'],
    trim: true
  },
  shortCode: {
    type: String,
    unique: true,
    default: shortid.generate
  },
  qrCode: {
    type: String
  },
  customAlias: {
    type: String,
    sparse: true,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^[a-zA-Z0-9-_]+$/.test(v);
      },
      message: 'Custom alias can only contain letters, numbers, hyphens, and underscores'
    }
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  title: String,
  description: String,
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  customDomain: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired', 'blocked'],
    default: 'active'
  },
  expiresAt: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > new Date();
      },
      message: 'Expiration date must be in the future'
    }
  },
  isExpired: {
    type: Boolean,
    default: false
  },
  password: String,
  clicks: {
    type: Number,
    default: 0
  },
  uniqueClicks: {
    type: Number,
    default: 0
  },
  analytics: [analyticsSchema],
  dailyStats: [{
    date: Date,
    clicks: Number,
    uniqueVisitors: Number,
    countries: Map,
    devices: Map,
    browsers: Map,
    referrers: Map,
    timeOnPage: {
      total: Number,
      count: Number
    },
    bounceRate: Number
  }],
  uniqueVisitors: [{
    ipAddress: String,
    firstVisit: Date,
    lastVisit: Date,
    totalVisits: Number,
    averageTimeOnPage: Number
  }],
  settings: {
    trackReferrer: {
      type: Boolean,
      default: true
    },
    trackLocation: {
      type: Boolean,
      default: true
    },
    trackDeviceInfo: {
      type: Boolean,
      default: true
    },
    redirectType: {
      type: String,
      enum: ['direct', 'delayed', 'interstitial'],
      default: 'direct'
    },
    redirectDelay: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for faster queries
urlSchema.index({ shortCode: 1 });
urlSchema.index({ user: 1, createdAt: -1 });
urlSchema.index({ status: 1 });
urlSchema.index({ tags: 1 });
urlSchema.index({ 'analytics.timestamp': 1 });
urlSchema.index({ 'analytics.country': 1 });
urlSchema.index({ 'analytics.device': 1 });
urlSchema.index({ 'analytics.browser': 1 });

// Generate QR code before saving
urlSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  
  // Update isExpired status
  if (this.expiresAt) {
    this.isExpired = new Date() > this.expiresAt;
    if (this.isExpired) {
      this.status = 'expired';
    }
  }

  // Generate QR code if not exists
  if (!this.qrCode) {
    try {
      const fullUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/${this.shortCode}`;
      this.qrCode = await QRCode.toDataURL(fullUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (error) {
      console.error('QR Code generation error:', error);
    }
  }
  
  next();
});

// Virtual for full short URL
urlSchema.virtual('shortUrl').get(function() {
  return `${process.env.BASE_URL || 'http://localhost:5000'}/${this.shortCode}`;
});

// Method to update click analytics
urlSchema.methods.recordClick = async function(data) {
  const startTime = Date.now();

  // Get geolocation data
  if (data.ipAddress && this.settings.trackLocation) {
    const geo = geoip.lookup(data.ipAddress);
    if (geo) {
      data.country = geo.country;
      data.city = geo.city;
      data.region = geo.region;
      data.timezone = geo.timezone;
      data.location = {
        type: 'Point',
        coordinates: [geo.ll[1], geo.ll[0]] // [longitude, latitude]
      };
    }
  }

  // Update click count
  this.clicks += 1;

  // Check if this is a unique visitor
  const visitorIndex = this.uniqueVisitors.findIndex(v => v.ipAddress === data.ipAddress);
  if (visitorIndex === -1) {
    this.uniqueClicks += 1;
    this.uniqueVisitors.push({
      ipAddress: data.ipAddress,
      firstVisit: new Date(),
      lastVisit: new Date(),
      totalVisits: 1,
      averageTimeOnPage: 0
    });
  } else {
    this.uniqueVisitors[visitorIndex].lastVisit = new Date();
    this.uniqueVisitors[visitorIndex].totalVisits += 1;
  }

  // Update daily stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let dailyStat = this.dailyStats.find(stat => 
    stat.date.getTime() === today.getTime()
  );

  if (!dailyStat) {
    dailyStat = {
      date: today,
      clicks: 0,
      uniqueVisitors: 0,
      countries: new Map(),
      devices: new Map(),
      browsers: new Map(),
      referrers: new Map(),
      timeOnPage: {
        total: 0,
        count: 0
      },
      bounceRate: 0
    };
    this.dailyStats.push(dailyStat);
  }

  dailyStat.clicks += 1;
  if (visitorIndex === -1) dailyStat.uniqueVisitors += 1;

  // Update maps
  if (data.country) {
    dailyStat.countries.set(
      data.country,
      (dailyStat.countries.get(data.country) || 0) + 1
    );
  }
  if (data.device) {
    dailyStat.devices.set(
      data.device,
      (dailyStat.devices.get(data.device) || 0) + 1
    );
  }
  if (data.browser) {
    dailyStat.browsers.set(
      data.browser,
      (dailyStat.browsers.get(data.browser) || 0) + 1
    );
  }
  if (data.referrer) {
    dailyStat.referrers.set(
      data.referrer,
      (dailyStat.referrers.get(data.referrer) || 0) + 1
    );
  }

  // Update time on page
  if (data.timeOnPage) {
    dailyStat.timeOnPage.total += data.timeOnPage;
    dailyStat.timeOnPage.count += 1;
  }

  // Add analytics entry
  this.analytics.push(data);
  
  // Keep only last 1000 analytics entries
  if (this.analytics.length > 1000) {
    this.analytics = this.analytics.slice(-1000);
  }

  // Keep only last 30 days of daily stats
  if (this.dailyStats.length > 30) {
    this.dailyStats = this.dailyStats.slice(-30);
  }
  
  return this.save();
};

// Method to get analytics summary
urlSchema.methods.getAnalyticsSummary = function(days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentStats = this.dailyStats.filter(stat => 
    stat.date >= cutoffDate
  );

  const summary = {
    totalClicks: this.clicks,
    uniqueClicks: this.uniqueClicks,
    recentClicks: recentStats.reduce((sum, stat) => sum + stat.clicks, 0),
    clicksByDay: recentStats.map(stat => ({
      date: stat.date,
      clicks: stat.clicks,
      uniqueVisitors: stat.uniqueVisitors,
      averageTimeOnPage: stat.timeOnPage.count ? 
        stat.timeOnPage.total / stat.timeOnPage.count : 0,
      bounceRate: stat.bounceRate
    })),
    topCountries: this.getTopFromMaps(recentStats, 'countries'),
    topDevices: this.getTopFromMaps(recentStats, 'devices'),
    topBrowsers: this.getTopFromMaps(recentStats, 'browsers'),
    topReferrers: this.getTopFromMaps(recentStats, 'referrers'),
    averageTimeOnPage: recentStats.reduce((sum, stat) => {
      return sum + (stat.timeOnPage.count ? 
        stat.timeOnPage.total / stat.timeOnPage.count : 0);
    }, 0) / recentStats.length,
    averageClicksPerDay: recentStats.length ? 
      recentStats.reduce((sum, stat) => sum + stat.clicks, 0) / recentStats.length : 0,
    conversionRate: this.uniqueClicks ? 
      (this.clicks / this.uniqueClicks).toFixed(2) : 0
  };

  return summary;
};

// Helper method to aggregate map data
urlSchema.methods.getTopFromMaps = function(stats, key, limit = 10) {
  const aggregated = new Map();
  
  stats.forEach(stat => {
    stat[key].forEach((value, name) => {
      aggregated.set(name, (aggregated.get(name) || 0) + value);
    });
  });

  return Array.from(aggregated.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
};

// Method to check if URL is expired
urlSchema.methods.checkExpiration = function() {
  if (!this.expiresAt) return false;
  const isExpired = new Date() > this.expiresAt;
  if (isExpired && !this.isExpired) {
    this.isExpired = true;
    this.status = 'expired';
    this.save();
  }
  return isExpired;
};

const Url = mongoose.model('Url', urlSchema);
module.exports = Url;
