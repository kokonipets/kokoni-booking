# Admin Controller - Backend Logic

Complete backend implementation for all admin operations.

---

## File: src/controllers/adminController.js

```javascript
const db = require('../db');
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ============================================
// METRICS & DASHBOARD
// ============================================

exports.getTodayMetrics = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all metrics for today
    const [metrics] = await db.query(`
      SELECT
        COUNT(CASE WHEN status IN ('positive', 'waiting_feedback', 'feedback_received') THEN 1 END) as totalReviewsSent,
        COUNT(CASE WHEN initialRating IS NOT NULL THEN 1 END) as responsesReceived,
        COUNT(CASE WHEN initialRating >= 4 THEN 1 END) as positiveReviews,
        COUNT(CASE WHEN initialRating < 4 THEN 1 END) as negativeReviews
      FROM reviews
      WHERE DATE(createdAt) = DATE(?)
    `, [today]);

    res.json(metrics[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMetricsChart = async (req, res) => {
  try {
    const period = req.query.period || '7days';
    let days = 7;

    if (period === '30days') days = 30;
    if (period === '90days') days = 90;

    const [data] = await db.query(`
      SELECT
        DATE_FORMAT(createdAt, '%Y-%m-%d') as date,
        COUNT(CASE WHEN initialRating >= 4 THEN 1 END) as positive,
        COUNT(CASE WHEN initialRating < 4 THEN 1 END) as negative
      FROM reviews
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `, [days]);

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// ALERTS MANAGEMENT
// ============================================

exports.getPendingAlerts = async (req, res) => {
  try {
    const [alerts] = await db.query(`
      SELECT
        aa.id,
        r.id as reviewId,
        a.customerName,
        a.customerPhone,
        r.initialRating as rating,
        r.feedback,
        aa.createdAt,
        TIMESTAMPDIFF(MINUTE, aa.createdAt, NOW()) as minutesAgo
      FROM admin_alerts aa
      JOIN reviews r ON aa.reviewId = r.id
      JOIN appointments a ON r.appointmentId = a.id
      WHERE aa.status = 'pending'
      AND r.initialRating < 4
      ORDER BY aa.createdAt DESC
    `);

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.dismissAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    await db.query(`
      UPDATE admin_alerts
      SET status = 'dismissed', dismissedAt = NOW()
      WHERE id = ?
    `, [id]);

    // Log activity
    await db.query(`
      INSERT INTO admin_activity_log (adminId, action, details)
      VALUES (?, 'dismiss_alert', JSON_OBJECT('alertId', ?))
    `, [adminId, id]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// REVIEWS MANAGEMENT
// ============================================

exports.getRecentReviews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const [reviews] = await db.query(`
      SELECT
        r.id,
        a.customerName,
        r.initialRating as rating,
        r.status,
        r.createdAt,
        r.feedback,
        r.reviewLinksSent
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      ORDER BY r.createdAt DESC
      LIMIT ?
    `, [limit]);

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getReviewDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const [reviews] = await db.query(`
      SELECT
        r.*,
        a.customerName,
        a.customerPhone,
        a.petName,
        a.serviceType,
        a.appointmentDate
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE r.id = ?
    `, [id]);

    if (reviews.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(reviews[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.respondToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, isAutomatic = false } = req.body;
    const adminId = req.user.id;

    // Get review details
    const [reviews] = await db.query(`
      SELECT r.*, a.customerPhone
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE r.id = ?
    `, [id]);

    if (reviews.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviews[0];

    // Send SMS response
    try {
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: review.customerPhone,
      });

      // Update review with response
      await db.query(`
        UPDATE reviews
        SET
          adminResponse = ?,
          responseStatus = 'sent',
          respondedAt = NOW(),
          status = 'admin_responded'
        WHERE id = ?
      `, [message, id]);

      // Log activity
      await db.query(`
        INSERT INTO admin_activity_log (adminId, action, details)
        VALUES (?, 'respond_to_review', JSON_OBJECT(
          'reviewId', ?,
          'message', ?,
          'isAutomatic', ?
        ))
      `, [adminId, id, message, isAutomatic ? 1 : 0]);

      res.json({ success: true, message: 'Response sent' });
    } catch (smsError) {
      res.status(500).json({ error: 'Failed to send SMS: ' + smsError.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SETTINGS MANAGEMENT
// ============================================

exports.getSettings = async (req, res) => {
  try {
    const [settings] = await db.query(`
      SELECT * FROM admin_settings LIMIT 1
    `);

    if (settings.length === 0) {
      // Return defaults if no settings exist
      return res.json({
        smsTemplates: {
          reviewRequest: 'Hi {{customerName}}! Thanks for visiting us today! How would you rate your experience? Reply with 1-5.',
          positiveResponse: 'Thank you! 🎉 Please share your experience:\n\nGoogle: [link]\n\nYelp: [link]',
          feedbackRequest: 'We\'re sorry to hear that! 😟 What could we have done better?',
          feedbackConfirm: 'Thank you for your feedback. Our team will review this and follow up with you shortly.',
        },
        reviewUrls: {
          googlePlaceId: '',
          yelpUrl: '',
          facebookUrl: '',
        },
        adminPhone: '',
        reviewTimeHour: 18,
        reviewTimeMinute: 0,
      });
    }

    res.json({
      smsTemplates: {
        reviewRequest: settings[0].smsTemplateReviewRequest,
        positiveResponse: settings[0].smsTemplatePositiveResponse,
        feedbackRequest: settings[0].smsTemplateFeedbackRequest,
        feedbackConfirm: settings[0].smsTemplateFeedbackConfirm,
      },
      reviewUrls: {
        googlePlaceId: settings[0].googlePlaceId,
        yelpUrl: settings[0].yelpUrl,
        facebookUrl: settings[0].facebookUrl,
      },
      adminPhone: settings[0].adminPhone,
      reviewTimeHour: settings[0].reviewTimeHour,
      reviewTimeMinute: settings[0].reviewTimeMinute,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { smsTemplates, reviewUrls, adminPhone, reviewTimeHour, reviewTimeMinute } = req.body;
    const adminId = req.user.id;

    // Check if settings exist
    const [existing] = await db.query('SELECT id FROM admin_settings LIMIT 1');

    if (existing.length === 0) {
      // Insert new settings
      await db.query(`
        INSERT INTO admin_settings (
          smsTemplateReviewRequest,
          smsTemplatePositiveResponse,
          smsTemplateFeedbackRequest,
          smsTemplateFeedbackConfirm,
          googlePlaceId,
          yelpUrl,
          facebookUrl,
          adminPhone,
          reviewTimeHour,
          reviewTimeMinute
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        smsTemplates.reviewRequest,
        smsTemplates.positiveResponse,
        smsTemplates.feedbackRequest,
        smsTemplates.feedbackConfirm,
        reviewUrls.googlePlaceId,
        reviewUrls.yelpUrl,
        reviewUrls.facebookUrl,
        adminPhone,
        reviewTimeHour,
        reviewTimeMinute,
      ]);
    } else {
      // Update existing settings
      await db.query(`
        UPDATE admin_settings SET
          smsTemplateReviewRequest = ?,
          smsTemplatePositiveResponse = ?,
          smsTemplateFeedbackRequest = ?,
          smsTemplateFeedbackConfirm = ?,
          googlePlaceId = ?,
          yelpUrl = ?,
          facebookUrl = ?,
          adminPhone = ?,
          reviewTimeHour = ?,
          reviewTimeMinute = ?
        WHERE id = ?
      `, [
        smsTemplates.reviewRequest,
        smsTemplates.positiveResponse,
        smsTemplates.feedbackRequest,
        smsTemplates.feedbackConfirm,
        reviewUrls.googlePlaceId,
        reviewUrls.yelpUrl,
        reviewUrls.facebookUrl,
        adminPhone,
        reviewTimeHour,
        reviewTimeMinute,
        existing[0].id,
      ]);
    }

    // Log activity
    await db.query(`
      INSERT INTO admin_activity_log (adminId, action, details)
      VALUES (?, 'update_settings', JSON_OBJECT(
        'adminPhone', ?,
        'reviewTimeHour', ?,
        'reviewTimeMinute', ?
      ))
    `, [adminId, adminPhone, reviewTimeHour, reviewTimeMinute]);

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// BULK ACTIONS
// ============================================

exports.exportReviews = async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.body;

    const [reviews] = await db.query(`
      SELECT
        r.id,
        a.customerName,
        a.customerPhone,
        r.initialRating as rating,
        r.feedback,
        r.status,
        r.createdAt
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE DATE(r.createdAt) BETWEEN ? AND ?
      ORDER BY r.createdAt DESC
    `, [startDate, endDate]);

    if (format === 'csv') {
      // Convert to CSV
      const csv = convertToCSV(reviews);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=reviews.csv');
      res.send(csv);
    } else if (format === 'json') {
      res.json(reviews);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.sendBulkMessage = async (req, res) => {
  try {
    const { reviewIds, message, autoResponse = false } = req.body;
    const adminId = req.user.id;

    // Get all phone numbers for these reviews
    const [reviews] = await db.query(`
      SELECT r.id, a.customerPhone
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE r.id IN (?)
    `, [reviewIds]);

    let successCount = 0;
    let failureCount = 0;

    // Send messages
    for (const review of reviews) {
      try {
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: review.customerPhone,
        });
        successCount++;
      } catch (smsError) {
        failureCount++;
      }
    }

    // Log activity
    await db.query(`
      INSERT INTO admin_activity_log (adminId, action, details)
      VALUES (?, 'send_bulk_message', JSON_OBJECT(
        'reviewCount', ?,
        'successCount', ?,
        'failureCount', ?
      ))
    `, [adminId, reviews.length, successCount, failureCount]);

    res.json({
      success: true,
      totalSent: reviews.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function convertToCSV(data) {
  if (data.length === 0) return 'No data';

  const headers = Object.keys(data[0]);
  const headerString = headers.join(',');

  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(',');
  });

  return headerString + '\n' + rows.join('\n');
}

module.exports = exports;
```

---

## Complete Admin Features Summary

| Feature | Status | Details |
|---------|--------|---------|
| **Dashboard** | ✅ | Real-time metrics, alerts, recent responses |
| **SMS Templates** | ✅ | Customize all 4 message types |
| **Review URLs** | ✅ | Configure Google, Yelp, Facebook |
| **Admin Alerts** | ✅ | Real-time alerts for negative reviews |
| **Schedule** | ✅ | Set time for daily review requests |
| **Review Response** | ✅ | Respond to reviews directly from dashboard |
| **Data Export** | ✅ | Export to CSV or JSON |
| **Bulk Actions** | ✅ | Send messages to multiple customers |
| **Activity Log** | ✅ | Track all admin actions |
| **Analytics** | ✅ | 7/30/90 day charts |

---

## Quick Integration Checklist

- [ ] Add `admin_settings` table to database
- [ ] Add `admin_alerts` table to database
- [ ] Add `admin_activity_log` table to database
- [ ] Create admin routes file
- [ ] Implement admin controller
- [ ] Create React dashboard component
- [ ] Create React settings component
- [ ] Add admin CSS styles
- [ ] Add authentication middleware
- [ ] Test all endpoints
- [ ] Connect Twilio webhook for SMS responses

