# Admin Dashboard & Settings Panel

Complete guide for building the admin interface to manage SMS reviews, feedback, and settings.

---

## Dashboard Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                             │
├────────────────────────────────────────────────────────────────┤
│ 🏠 Dashboard | ⚙️ Settings | 📊 Analytics | 👥 Reviews | 🎯 Jobs│
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📍 TODAY'S METRICS                                             │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ Reviews Sent │ Responses    │ Positive (4-5)│ Negative (1-3)│ │
│  │      12      │      8       │       6       │       2      │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
│                                                                  │
│  ⚠️  PENDING ALERTS (2)                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🔴 John Doe | Rating: 2 ⭐ | Service was slow            │  │
│  │    Feedback received 2 hours ago → [View] [Respond]      │  │
│  │                                                            │  │
│  │ 🔴 Jane Smith | Rating: 1 ⭐ | Rude staff                │  │
│  │    Feedback received 30 min ago → [View] [Respond]       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📱 RECENT REVIEW RESPONSES                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Sarah Johnson | ⭐⭐⭐⭐⭐ | 5 hours ago                    │  │
│  │ → Sent Google/Yelp links                                 │  │
│  │                                                            │  │
│  │ Mike Chen | ⭐⭐⭐⭐ | 3 hours ago                          │  │
│  │ → Sent Google/Yelp links                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## 1. Admin Dashboard Page

### Main Dashboard Component

**File: src/pages/AdminDashboard.jsx**

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState({
    totalReviewsSent: 0,
    responsesReceived: 0,
    positiveReviews: 0,
    negativeReviews: 0,
  });
  
  const [alerts, setAlerts] = useState([]);
  const [recentResponses, setRecentResponses] = useState([]);
  const [chartData, setChartData] = useState([]);
  
  useEffect(() => {
    fetchDashboardData();
  }, []);
  
  const fetchDashboardData = async () => {
    try {
      const [metricsRes, alertsRes, responsesRes, chartRes] = await Promise.all([
        axios.get('/api/admin/metrics/today'),
        axios.get('/api/admin/alerts/pending'),
        axios.get('/api/admin/reviews/recent?limit=5'),
        axios.get('/api/admin/metrics/chart?period=7days'),
      ]);
      
      setMetrics(metricsRes.data);
      setAlerts(alertsRes.data);
      setRecentResponses(responsesRes.data);
      setChartData(chartRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };
  
  const handleDismissAlert = async (alertId) => {
    try {
      await axios.post(`/api/admin/alerts/${alertId}/dismiss`);
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (error) {
      console.error('Error dismissing alert:', error);
    }
  };
  
  return (
    <div className="admin-dashboard">
      <h1>Review Management Dashboard</h1>
      
      {/* Key Metrics */}
      <div className="metrics-grid">
        <MetricCard
          title="Reviews Sent Today"
          value={metrics.totalReviewsSent}
          icon="📤"
          color="blue"
        />
        <MetricCard
          title="Responses Received"
          value={metrics.responsesReceived}
          icon="📬"
          color="green"
        />
        <MetricCard
          title="Positive Reviews (4-5)"
          value={metrics.positiveReviews}
          icon="😊"
          color="green"
        />
        <MetricCard
          title="Negative Reviews (1-3)"
          value={metrics.negativeReviews}
          icon="😞"
          color="red"
        />
      </div>
      
      {/* Pending Alerts Section */}
      <div className="alerts-section">
        <h2>⚠️ Pending Alerts ({alerts.length})</h2>
        {alerts.length === 0 ? (
          <p className="no-alerts">No pending alerts</p>
        ) : (
          <div className="alerts-list">
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={handleDismissAlert}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Charts Section */}
      <div className="charts-grid">
        <div className="chart-container">
          <h3>Reviews Over 7 Days</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="positive" fill="#10b981" name="Positive (4-5)" />
              <Bar dataKey="negative" fill="#ef4444" name="Negative (1-3)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="chart-container">
          <h3>Response Rate</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Responses', value: metrics.responsesReceived },
                  { name: 'No Response', value: metrics.totalReviewsSent - metrics.responsesReceived }
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
              >
                <Cell fill="#3b82f6" />
                <Cell fill="#d1d5db" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Recent Responses */}
      <div className="recent-section">
        <h2>Recent Review Responses</h2>
        <ReviewResponsesTable reviews={recentResponses} />
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value, icon, color }) {
  return (
    <div className={`metric-card metric-${color}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <h3>{title}</h3>
        <p className="metric-value">{value}</p>
      </div>
    </div>
  );
}

// Alert Card Component
function AlertCard({ alert, onDismiss }) {
  return (
    <div className="alert-card alert-negative">
      <div className="alert-header">
        <span className="alert-rating">⭐ {alert.rating}/5</span>
        <span className="alert-customer">{alert.customerName}</span>
        <span className="alert-time">{formatTime(alert.createdAt)}</span>
      </div>
      <div className="alert-feedback">
        <p>"{alert.feedback}"</p>
      </div>
      <div className="alert-actions">
        <button className="btn btn-primary">Respond</button>
        <button
          className="btn btn-secondary"
          onClick={() => onDismiss(alert.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Review Responses Table
function ReviewResponsesTable({ reviews }) {
  return (
    <table className="reviews-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Rating</th>
          <th>Time</th>
          <th>Action Taken</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {reviews.map(review => (
          <tr key={review.id}>
            <td>{review.customerName}</td>
            <td>{renderStars(review.rating)}</td>
            <td>{formatTime(review.createdAt)}</td>
            <td>{getActionLabel(review)}</td>
            <td>
              <span className={`status-badge status-${review.status}`}>
                {review.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderStars(rating) {
  return '⭐'.repeat(rating);
}

function getActionLabel(review) {
  if (review.status === 'positive') return '✅ Review links sent';
  if (review.status === 'feedback_received') return '⚠️ Feedback logged';
  return '-';
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}
```

---

## 2. Admin Settings Panel

### Settings Configuration Page

**File: src/pages/AdminSettings.jsx**

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    smsTemplates: {},
    reviewUrls: {},
    adminPhone: '',
    reviewTimeHour: 18,
    reviewTimeMinute: 0,
  });
  
  const [activeTab, setActiveTab] = useState('templates');
  const [saveStatus, setSaveStatus] = useState('');
  
  useEffect(() => {
    fetchSettings();
  }, []);
  
  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/admin/settings');
      setSettings(res.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };
  
  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      await axios.put('/api/admin/settings', settings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('error');
      console.error('Error saving settings:', error);
    }
  };
  
  return (
    <div className="admin-settings">
      <h1>Admin Settings</h1>
      
      <div className="settings-tabs">
        <button
          className={`tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          📱 SMS Templates
        </button>
        <button
          className={`tab ${activeTab === 'urls' ? 'active' : ''}`}
          onClick={() => setActiveTab('urls')}
        >
          🔗 Review URLs
        </button>
        <button
          className={`tab ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          🔔 Notifications
        </button>
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          ⏰ Schedule
        </button>
      </div>
      
      {/* SMS Templates Tab */}
      {activeTab === 'templates' && (
        <TemplatesTab settings={settings} setSettings={setSettings} />
      )}
      
      {/* Review URLs Tab */}
      {activeTab === 'urls' && (
        <ReviewUrlsTab settings={settings} setSettings={setSettings} />
      )}
      
      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <NotificationsTab settings={settings} setSettings={setSettings} />
      )}
      
      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <ScheduleTab settings={settings} setSettings={setSettings} />
      )}
      
      {/* Save Button */}
      <div className="settings-footer">
        <button
          className="btn btn-primary btn-large"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
        </button>
        {saveStatus === 'saved' && <p className="success">✅ Settings saved!</p>}
        {saveStatus === 'error' && <p className="error">❌ Error saving settings</p>}
      </div>
    </div>
  );
}

// SMS Templates Tab
function TemplatesTab({ settings, setSettings }) {
  const handleTemplateChange = (templateKey, value) => {
    setSettings({
      ...settings,
      smsTemplates: {
        ...settings.smsTemplates,
        [templateKey]: value,
      },
    });
  };
  
  return (
    <div className="tab-content">
      <h2>📱 SMS Message Templates</h2>
      
      <div className="template-form">
        <div className="form-group">
          <label>Initial Review Request</label>
          <textarea
            value={settings.smsTemplates.reviewRequest || ''}
            onChange={(e) => handleTemplateChange('reviewRequest', e.target.value)}
            placeholder="Hi {{customerName}}! Thanks for visiting..."
            rows="3"
          />
          <small>Available: {{customerName}}, {{businessName}}</small>
        </div>
        
        <div className="form-group">
          <label>Positive Review Response (4-5 stars)</label>
          <textarea
            value={settings.smsTemplates.positiveResponse || ''}
            onChange={(e) => handleTemplateChange('positiveResponse', e.target.value)}
            placeholder="Thank you! 🎉 Please share..."
            rows="3"
          />
        </div>
        
        <div className="form-group">
          <label>Negative Review - Request Feedback (1-3 stars)</label>
          <textarea
            value={settings.smsTemplates.feedbackRequest || ''}
            onChange={(e) => handleTemplateChange('feedbackRequest', e.target.value)}
            placeholder="We're sorry to hear that! 😟..."
            rows="3"
          />
        </div>
        
        <div className="form-group">
          <label>Feedback Received - Confirmation</label>
          <textarea
            value={settings.smsTemplates.feedbackConfirm || ''}
            onChange={(e) => handleTemplateChange('feedbackConfirm', e.target.value)}
            placeholder="Thank you for your feedback..."
            rows="3"
          />
        </div>
      </div>
    </div>
  );
}

// Review URLs Tab
function ReviewUrlsTab({ settings, setSettings }) {
  const handleUrlChange = (platform, value) => {
    setSettings({
      ...settings,
      reviewUrls: {
        ...settings.reviewUrls,
        [platform]: value,
      },
    });
  };
  
  return (
    <div className="tab-content">
      <h2>🔗 Review Platform URLs</h2>
      
      <div className="urls-form">
        <div className="form-group">
          <label>Google Business Place ID</label>
          <input
            type="text"
            value={settings.reviewUrls.googlePlaceId || ''}
            onChange={(e) => handleUrlChange('googlePlaceId', e.target.value)}
            placeholder="Find at google.com/business"
          />
          <p className="preview">
            Preview: https://search.google.com/local/writereview?placeid=
            <strong>{settings.reviewUrls.googlePlaceId || 'YOUR_ID'}</strong>
          </p>
        </div>
        
        <div className="form-group">
          <label>Yelp Business URL</label>
          <input
            type="url"
            value={settings.reviewUrls.yelpUrl || ''}
            onChange={(e) => handleUrlChange('yelpUrl', e.target.value)}
            placeholder="https://www.yelp.com/biz/your-business"
          />
          <p className="preview">
            {settings.reviewUrls.yelpUrl}
          </p>
        </div>
        
        <div className="form-group">
          <label>Facebook Business URL (Optional)</label>
          <input
            type="url"
            value={settings.reviewUrls.facebookUrl || ''}
            onChange={(e) => handleUrlChange('facebookUrl', e.target.value)}
            placeholder="https://www.facebook.com/your-business"
          />
        </div>
      </div>
    </div>
  );
}

// Notifications Tab
function NotificationsTab({ settings, setSettings }) {
  const handleAdminPhoneChange = (value) => {
    setSettings({
      ...settings,
      adminPhone: value,
    });
  };
  
  return (
    <div className="tab-content">
      <h2>🔔 Admin Notifications</h2>
      
      <div className="notification-form">
        <div className="form-group">
          <label>Admin Phone Number (for alerts)</label>
          <input
            type="tel"
            value={settings.adminPhone}
            onChange={(e) => handleAdminPhoneChange(e.target.value)}
            placeholder="+1234567890"
          />
          <small>Receives SMS alerts for negative reviews (1-3 stars)</small>
        </div>
        
        <div className="checkbox-group">
          <label>
            <input type="checkbox" defaultChecked /> Send SMS for 1-2 star reviews
          </label>
          <label>
            <input type="checkbox" /> Send SMS for 3 star reviews
          </label>
          <label>
            <input type="checkbox" defaultChecked /> Send email notification
          </label>
          <label>
            <input type="checkbox" /> Send push notification
          </label>
        </div>
      </div>
    </div>
  );
}

// Schedule Tab
function ScheduleTab({ settings, setSettings }) {
  const handleTimeChange = (field, value) => {
    setSettings({
      ...settings,
      [field]: parseInt(value),
    });
  };
  
  return (
    <div className="tab-content">
      <h2>⏰ Review Request Schedule</h2>
      
      <div className="schedule-form">
        <div className="time-picker">
          <label>Send review requests at:</label>
          <div className="time-inputs">
            <input
              type="number"
              min="0"
              max="23"
              value={settings.reviewTimeHour}
              onChange={(e) => handleTimeChange('reviewTimeHour', e.target.value)}
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              max="59"
              value={String(settings.reviewTimeMinute).padStart(2, '0')}
              onChange={(e) => handleTimeChange('reviewTimeMinute', e.target.value)}
            />
          </div>
          <p className="schedule-display">
            📅 Every day at{' '}
            <strong>
              {String(settings.reviewTimeHour).padStart(2, '0')}:
              {String(settings.reviewTimeMinute).padStart(2, '0')}
            </strong>
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## 3. CSS Styling

**File: src/styles/admin.css**

```css
/* Dashboard Metrics */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.metric-card {
  padding: 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.metric-blue { background: #dbeafe; }
.metric-green { background: #dcfce7; }
.metric-red { background: #fee2e2; }

.metric-icon {
  font-size: 2rem;
}

.metric-value {
  font-size: 1.75rem;
  font-weight: bold;
  margin: 0;
}

/* Alerts */
.alerts-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.alert-card {
  padding: 1rem;
  border-left: 4px solid;
  border-radius: 4px;
  background: #fff9f0;
  border-color: #f97316;
}

.alert-card.alert-negative {
  background: #fee2e2;
  border-color: #ef4444;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.alert-rating {
  font-size: 0.9rem;
  background: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.alert-feedback {
  margin: 0.5rem 0;
  font-style: italic;
  color: #333;
}

.alert-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

/* Settings Tabs */
.settings-tabs {
  display: flex;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 2rem;
  gap: 0;
}

.tab {
  padding: 1rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  border-bottom: 3px solid transparent;
  color: #666;
  transition: all 0.3s;
}

.tab:hover {
  color: #333;
}

.tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

/* Forms */
.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  font-size: 1rem;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #666;
  font-size: 0.875rem;
}

.preview {
  background: #f3f4f6;
  padding: 0.5rem;
  border-radius: 4px;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  word-break: break-all;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #e5e7eb;
  color: #333;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-large {
  padding: 1rem 2rem;
  font-size: 1.1rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Status Messages */
.success {
  color: #059669;
  background: #dcfce7;
  padding: 0.75rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.error {
  color: #dc2626;
  background: #fee2e2;
  padding: 0.75rem;
  border-radius: 4px;
  margin: 1rem 0;
}

/* Tables */
.reviews-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

.reviews-table th {
  background: #f3f4f6;
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #e5e7eb;
}

.reviews-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.reviews-table tr:hover {
  background: #f9fafb;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  font-size: 0.875rem;
  font-weight: 500;
}

.status-positive {
  background: #dcfce7;
  color: #059669;
}

.status-feedback_received {
  background: #fef3c7;
  color: #d97706;
}

/* Charts */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin: 2rem 0;
}

.chart-container {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.chart-container h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
}
```

---

## 4. Backend API Endpoints

**File: src/api/admin.routes.js**

```javascript
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');

// Protect all admin routes
router.use(authMiddleware.requireAdmin);

// Dashboard metrics
router.get('/metrics/today', adminController.getTodayMetrics);
router.get('/metrics/chart', adminController.getMetricsChart);

// Alerts
router.get('/alerts/pending', adminController.getPendingAlerts);
router.post('/alerts/:id/dismiss', adminController.dismissAlert);

// Reviews
router.get('/reviews/recent', adminController.getRecentReviews);
router.get('/reviews/:id', adminController.getReviewDetails);
router.post('/reviews/:id/respond', adminController.respondToReview);

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Bulk Actions
router.post('/reviews/bulk/export', adminController.exportReviews);
router.post('/messages/bulk/send', adminController.sendBulkMessage);

module.exports = router;
```

---

## 5. Database Schema Updates

```sql
-- Settings table
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
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin alerts table
CREATE TABLE admin_alerts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reviewId INT NOT NULL,
  alertType ENUM('negative_review', 'system_error', 'sms_failure'),
  status ENUM('pending', 'dismissed', 'resolved') DEFAULT 'pending',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dismissedAt TIMESTAMP,
  FOREIGN KEY (reviewId) REFERENCES reviews(id)
);

-- Admin activity log
CREATE TABLE admin_activity_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  adminId INT NOT NULL,
  action VARCHAR(255),
  details JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (adminId) REFERENCES users(id)
);
```

---

## Feature Checklist

Admin Dashboard:
- [ ] Real-time metrics display
- [ ] Pending alerts section
- [ ] Charts (7-day review trends)
- [ ] Recent responses table

Admin Settings:
- [ ] Customize SMS templates
- [ ] Configure review URLs (Google, Yelp, Facebook)
- [ ] Set admin alert phone number
- [ ] Schedule review request time

Admin Actions:
- [ ] Respond to negative reviews
- [ ] Dismiss alerts
- [ ] Export review data
- [ ] View full customer feedback

