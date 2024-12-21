const path = require('path');
process.chdir(path.dirname(require.main.filename));
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const useragent = require('express-useragent');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// General middleware
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(useragent.express());

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection with retry logic
const connectDB = async () => {
  const retryInterval = 5000; // 5 seconds
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('Connected to MongoDB');
      break;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      retries++;
      if (retries === maxRetries) {
        console.error('Failed to connect to MongoDB after maximum retries');
        process.exit(1);
      }
      console.log(`Retrying in ${retryInterval/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
};

connectDB();

// Import routes
const authRoutes = require('./routes/auth');
const urlRoutes = require('./routes/urls');
const userRoutes = require('./routes/users');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/urls', urlRoutes);

// URL Shortener redirect route (must be after API routes)
app.get('/:shortCode', async (req, res, next) => {
  try {
    const url = await require('./models/Url').findOne({ shortCode: req.params.shortCode });
    if (url) {
      url.clicks += 1;
      
      // Extract relevant user agent information
      const ua = req.useragent;
      const userAgent = {
        browser: ua.browser,
        version: ua.version,
        os: ua.os,
        platform: ua.platform,
        source: ua.source,
        isMobile: ua.isMobile,
        isDesktop: ua.isDesktop,
        isBot: ua.isBot
      };

      url.analytics.push({
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent,
        referrer: req.get('Referrer') || '',
        device: ua.isMobile ? 'mobile' : ua.isTablet ? 'tablet' : 'desktop'
      });

      await url.save();
      return res.redirect(url.originalUrl);
    }
    next();
  } catch (error) {
    console.error('URL redirect error:', error);
    next(error);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    nodeVersion: process.version
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
}); 