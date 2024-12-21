const nodemailer = require('nodemailer');

// Configure nodemailer with Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Verify email configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Email configuration error:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

const logoUrl = 'https://i.ibb.co/M6yMj0N/logo.png'; // Replace with your actual logo URL

// Common email template wrapper
const getEmailTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URLShort</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
    <!-- Header -->
    <div style="background-color: #2563eb; padding: 20px; text-align: center;">
      <img src="${logoUrl}" alt="URLShort Logo" style="height: 40px; margin-bottom: 10px;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">URLShort</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 32px 24px;">
      ${content}
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #64748b; font-size: 14px;">© ${new Date().getFullYear()} URLShort. All rights reserved.</p>
      <div style="margin-top: 12px;">
        <a href="${process.env.FRONTEND_URL}/privacy" style="color: #2563eb; text-decoration: none; font-size: 14px; margin: 0 10px;">Privacy Policy</a>
        <a href="${process.env.FRONTEND_URL}/terms" style="color: #2563eb; text-decoration: none; font-size: 14px; margin: 0 10px;">Terms of Service</a>
      </div>
    </div>
  </div>
</body>
</html>
`;

// Send verification email
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  const content = `
    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin-bottom: 16px;">Welcome to URLShort!</h2>
    <p style="color: #475569; margin-bottom: 24px; line-height: 1.6;">Thank you for creating an account. To get started, please verify your email address by clicking the button below:</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationUrl}" 
         style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block; transition: background-color 0.2s;">
        Verify Email Address
      </a>
    </div>
    
    <p style="color: #475569; margin-bottom: 16px; line-height: 1.6;">If the button doesn't work, you can also click this link:</p>
    <p style="margin-bottom: 24px;">
      <a href="${verificationUrl}" style="color: #2563eb; text-decoration: none; word-break: break-all;">${verificationUrl}</a>
    </p>
    
    <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; margin-top: 24px;">
      <p style="color: #64748b; margin: 0; font-size: 14px;">This verification link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    </div>
  `;

  const mailOptions = {
    from: `"URLShort" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email Address - URLShort',
    html: getEmailTemplate(content)
  };

  await transporter.sendMail(mailOptions);
};

// Send password reset email
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  
  const content = `
    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin-bottom: 16px;">Reset Your Password</h2>
    <p style="color: #475569; margin-bottom: 24px; line-height: 1.6;">We received a request to reset your password. Click the button below to create a new password:</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" 
         style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block; transition: background-color 0.2s;">
        Reset Password
      </a>
    </div>
    
    <p style="color: #475569; margin-bottom: 16px; line-height: 1.6;">If the button doesn't work, you can also click this link:</p>
    <p style="margin-bottom: 24px;">
      <a href="${resetUrl}" style="color: #2563eb; text-decoration: none; word-break: break-all;">${resetUrl}</a>
    </p>
    
    <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 16px; margin-top: 24px;">
      <p style="color: #64748b; margin: 0; font-size: 14px;">This password reset link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
    </div>
    
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p style="color: #475569; margin: 0; font-size: 14px;">For security reasons, we recommend:</p>
      <ul style="color: #475569; font-size: 14px; margin-top: 8px; padding-left: 20px;">
        <li>Using a strong, unique password</li>
        <li>Not sharing your password with anyone</li>
        <li>Enabling two-factor authentication if available</li>
      </ul>
    </div>
  `;

  const mailOptions = {
    from: `"URLShort Security" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request - URLShort',
    html: getEmailTemplate(content)
  };

  await transporter.sendMail(mailOptions);
};

// Send welcome email after verification
const sendWelcomeEmail = async (email, name) => {
  const content = `
    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin-bottom: 16px;">Welcome to URLShort, ${name}!</h2>
    <p style="color: #475569; margin-bottom: 24px; line-height: 1.6;">Thank you for verifying your email address. Your account is now fully activated and you can start using all features of URLShort.</p>
    
    <div style="background-color: #f0fdf4; border-radius: 8px; padding: 24px; margin: 32px 0;">
      <h3 style="color: #166534; margin: 0 0 16px 0; font-size: 16px;">Here's what you can do with URLShort:</h3>
      <ul style="color: #166534; margin: 0; padding-left: 20px; line-height: 1.6;">
        <li>Create short, memorable URLs</li>
        <li>Track click analytics in real-time</li>
        <li>Customize your short links</li>
        <li>Generate QR codes automatically</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${process.env.FRONTEND_URL}/dashboard" 
         style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block; transition: background-color 0.2s;">
        Go to Dashboard
      </a>
    </div>
    
    <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-top: 32px;">
      <h3 style="color: #1e293b; margin: 0 0 12px 0; font-size: 16px;">Need Help?</h3>
      <p style="color: #475569; margin: 0; line-height: 1.6;">
        Check out our <a href="${process.env.FRONTEND_URL}/docs" style="color: #2563eb; text-decoration: none;">documentation</a> 
        or contact our <a href="${process.env.FRONTEND_URL}/support" style="color: #2563eb; text-decoration: none;">support team</a>.
      </p>
    </div>
  `;

  const mailOptions = {
    from: `"URLShort Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to URLShort! 🎉',
    html: getEmailTemplate(content)
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
}; 