# Complete Admin System Integration Guide

Step-by-step guide to integrate all SMS review automation components into your Kokoni Booking system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      UNICORN BOOKING APP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           FRONTEND (React/Vue)                           │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  📊 Admin Dashboard    │ ⚙️ Settings    │ 📱 Reviews    │   │
│  │  • Metrics             │ SMS Templates  │ Customer DB   │   │
│  │  • Alerts              │ Review URLs    │ History       │   │
│  │  • Response Table      │ Schedule       │              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↓ (REST API)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           BACKEND (Node.js/Express)                      │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  📊 Admin Routes                                         │   │
│  │  • GET  /admin/metrics/today                             │   │
│  │  • GET  /admin/metrics/chart                             │   │
│  │  • GET  /admin/alerts/pending                            │   │
│  │  • POST /admin/alerts/:id/dismiss                        │   │
│  │  • GET  /admin/reviews/recent                            │   │
│  │  • GET  /admin/reviews/:id                               │   │
│  │  • POST /admin/reviews/:id/respond                       │   │
│  │  • GET  /admin/settings                                  │   │
│  │  • PUT  /admin/settings                                  │   │
│  │  • POST /admin/reviews/bulk/export                       │   │
│  │  • POST /admin/messages/bulk/send                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↓                                       │
│  ┌────────────────┬──────────────────┬──────────────────────┐   │
│  │  DATABASE      │  SMS SERVICE     │  SCHEDULED TASKS     │   │
│  ├────────────────┼──────────────────┼──────────────────────┤   │
│  │ • reviews      │ Twilio API       │ Cron Job (6 PM)      │   │
│  │ • admin_      │                  │                      │   │
│  │   settings    │ • Send SMS       │ • Check for          │   │
│  │ • admin_      │ • Receive SMS    │   completed appts    │   │
│  │   alerts      │ • Webhook        │ • Send review SMS    │   │
│  │ • admin_      │   receiver       │ • Create alerts      │   │
│  │   activity_   │                  │                      │   │
│  │   log         │                  │                      │   │
│  └────────────────┴──────────────────┴──────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Database Setup

Create all required tables:

```sql
-- Reviews table (already created in SMS guide)
CREATE TABLE reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  appointmentId INT NOT NULL,
  customerPhone VARCHAR(20),
  initialRating INT,
  feedback TEXT,
  status ENUM('pending', 'positive', 'waiting_feedback', 'feedback_received', 'admin_responded') DEFAULT 'pending',
  adminResponse TEXT,
  responseStatus VARCHAR(20),
  reviewLinksSent BOOLEAN DEFAULT FALSE,
  respondedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (appointmentId) REFERENCES appointments(id)
);

-- Admin settings table
CREATE TABLE admin_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  smsTemplateReviewRequest TEXT,
  smsTemplatePositiveResponse TEXT,
  smsTemplateFeedbackRequest TEXT,
  smsTemplateFeedbackConfirm TEXT,
  googlePlaceId VARCHAR(255),
  yelpUrl VARCHAR(500),
  facebookUrl VARCHAR(500),
  adminPhone VARCHAR(20),
  reviewTimeHour INT DEFAULT 18,
  reviewTimeMinute INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin alerts table
CREATE TABLE admin_alerts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reviewId INT NOT NULL,
  alertType ENUM('negative_review', 'system_error', 'sms_failure') DEFAULT 'negative_review',
  status ENUM('pending', 'dismissed', 'resolved') DEFAULT 'pending',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dismissedAt TIMESTAMP,
  FOREIGN KEY (reviewId) REFERENCES reviews(id),
  KEY (status, createdAt)
);

-- Admin activity log
CREATE TABLE admin_activity_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  adminId INT NOT NULL,
  action VARCHAR(255),
  details JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (adminId) REFERENCES users(id),
  KEY (createdAt)
);
```

---

## Step 2: Backend Setup

### 2.1 Update your main server file

**File: src/server.js**

```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
const authMiddleware = require('./middleware/auth');

// Routes
app.use('/api/admin', authMiddleware.requireAdmin, require('./api/admin.routes'));
app.use('/api/sms-webhook', require('./api/sms-webhook.routes'));
app.use('/api/appointments', require('./api/appointments.routes'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 2.2 File Structure

```
src/
├── server.js
├── api/
│   ├── admin.routes.js           (✅ Already created)
│   └── sms-webhook.routes.js     (From SMS guide)
├── controllers/
│   ├── adminController.js         (✅ Already created)
│   └── reviewController.js
├── middleware/
│   ├── auth.js                   (Authentication)
│   └── validation.js
├── services/
│   ├── smsService.js             (Twilio integration)
│   └── notificationService.js    (Admin alerts)
└── utils/
    └── database.js
```

---

## Step 3: Frontend Setup

### 3.1 Project Structure

```
src/
├── pages/
│   ├── AdminDashboard.jsx         (✅ Already created)
│   ├── AdminSettings.jsx          (✅ Already created)
│   ├── ReviewsList.jsx
│   └── LoginPage.jsx
├── components/
│   ├── MetricCard.jsx
│   ├── AlertCard.jsx
│   ├── ReviewTable.jsx
│   └── Layout.jsx
├── hooks/
│   ├── useAdmin.js                (Custom hook for admin data)
│   └── useSms.js                  (Custom hook for SMS)
├── api/
│   └── adminAPI.js                (API client)
├── styles/
│   ├── admin.css                  (✅ Already created)
│   ├── dashboard.css
│   └── index.css
└── App.jsx
```

### 3.2 Custom Hook for Admin Data

**File: src/hooks/useAdmin.js**

```javascript
import { useState, useEffect } from 'react';
import axios from 'axios';

export const useAdmin = () => {
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAdminData();
    // Refresh data every 30 seconds
    const interval = setInterval(fetchAdminData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [metricsRes, alertsRes] = await Promise.all([
        axios.get('/api/admin/metrics/today'),
        axios.get('/api/admin/alerts/pending'),
      ]);
      setMetrics(metricsRes.data);
      setAlerts(alertsRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { metrics, alerts, loading, error, refetch: fetchAdminData };
};
```

### 3.3 API Client

**File: src/api/adminAPI.js**

```javascript
import axios from 'axios';

const API_BASE = '/api/admin';

export const adminAPI = {
  // Metrics
  getTodayMetrics: () => axios.get(`${API_BASE}/metrics/today`),
  getMetricsChart: (period) => axios.get(`${API_BASE}/metrics/chart`, { params: { period } }),

  // Alerts
  getPendingAlerts: () => axios.get(`${API_BASE}/alerts/pending`),
  dismissAlert: (id) => axios.post(`${API_BASE}/alerts/${id}/dismiss`),

  // Reviews
  getRecentReviews: (limit) => axios.get(`${API_BASE}/reviews/recent`, { params: { limit } }),
  getReviewDetails: (id) => axios.get(`${API_BASE}/reviews/${id}`),
  respondToReview: (id, message) => 
    axios.post(`${API_BASE}/reviews/${id}/respond`, { message }),

  // Settings
  getSettings: () => axios.get(`${API_BASE}/settings`),
  updateSettings: (settings) => axios.put(`${API_BASE}/settings`, settings),

  // Bulk Actions
  exportReviews: (startDate, endDate) =>
    axios.post(`${API_BASE}/reviews/bulk/export`, { startDate, endDate }),
  sendBulkMessage: (reviewIds, message) =>
    axios.post(`${API_BASE}/messages/bulk/send`, { reviewIds, message }),
};
```

---

## Step 4: Authentication Middleware

**File: src/middleware/auth.js**

```javascript
const jwt = require('jsonwebtoken');

exports.requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is admin
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

exports.requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

---

## Step 5: Complete Integration Checklist

### Database
- [ ] Create `reviews` table
- [ ] Create `admin_settings` table
- [ ] Create `admin_alerts` table
- [ ] Create `admin_activity_log` table
- [ ] Add indexes to frequently queried columns

### Backend
- [ ] Create admin routes file
- [ ] Implement admin controller
- [ ] Add authentication middleware
- [ ] Set up Twilio integration
- [ ] Create SMS webhook handler
- [ ] Set up scheduled tasks (cron)
- [ ] Test all API endpoints

### Frontend
- [ ] Create admin dashboard page
- [ ] Create admin settings page
- [ ] Create review management page
- [ ] Add admin CSS styles
- [ ] Create custom hooks
- [ ] Create API client
- [ ] Test all pages locally

### Integration Tests
- [ ] Test sending review SMS
- [ ] Test receiving SMS responses
- [ ] Test positive review routing
- [ ] Test negative review routing
- [ ] Test admin alert creation
- [ ] Test settings updates
- [ ] Test metrics calculations

---

## Step 6: Environment Variables

**File: .env**

```env
# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Database
DATABASE_URL=mysql://user:password@localhost/kokoni_booking

# Admin
ADMIN_PHONE=+1234567890
JWT_SECRET=your_jwt_secret_key

# Server
PORT=3000
NODE_ENV=production
```

---

## Step 7: Testing Endpoints

Use Postman or curl to test:

```bash
# Get today's metrics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/metrics/today

# Get pending alerts
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/alerts/pending

# Get settings
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/settings

# Update settings
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "smsTemplates": {
      "reviewRequest": "Hi {{customerName}}!..."
    },
    "reviewUrls": {
      "googlePlaceId": "YOUR_ID"
    }
  }' \
  http://localhost:3000/api/admin/settings
```

---

## Step 8: Deployment

### Using Docker

**File: Dockerfile**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
```

**File: docker-compose.yml**

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_DATABASE: kokoni_booking
      MYSQL_ROOT_PASSWORD: root_password
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: mysql://root:root_password@mysql/kokoni_booking
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER}
    depends_on:
      - mysql

volumes:
  mysql_data:
```

---

## Features Implemented

✅ **SMS Review System**
- Automatic review requests
- Response routing (positive vs negative)
- Feedback collection

✅ **Admin Dashboard**
- Real-time metrics
- Pending alerts
- Recent responses
- 7-30-90 day charts

✅ **Admin Settings**
- SMS template customization
- Review URL configuration
- Schedule management
- Admin notification settings

✅ **Admin Actions**
- Respond to reviews
- Dismiss alerts
- Export data
- Bulk messaging

✅ **Monitoring**
- Activity logs
- Error tracking
- SMS delivery status

---

## Next Steps

1. **Set up Twilio account** and get credentials
2. **Create database** and run migration scripts
3. **Configure environment variables**
4. **Build and test backend** endpoints
5. **Build frontend** components
6. **Deploy to production**
7. **Monitor and optimize** based on usage

---

## Support & Troubleshooting

**SMS not being sent?**
- Check Twilio credentials in .env
- Verify Twilio phone number is active
- Check logs for errors

**Alerts not appearing?**
- Verify admin_alerts table exists
- Check database connection
- Test with manual insert

**Dashboard metrics incorrect?**
- Check database queries
- Verify dates are in correct format
- Test with sample data

