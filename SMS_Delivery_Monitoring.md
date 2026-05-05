# SMS Delivery Monitoring & Logs

Complete SMS tracking dashboard showing delivery status, logs, and troubleshooting.

---

## Overview

Monitor all SMS activity:
- SMS delivery status (sent, delivered, failed, bounced)
- Real-time log viewer
- Failure analysis & retry queue
- Twilio integration metrics
- SMS cost tracking

---

## Database Schema

```sql
-- SMS Logs table
CREATE TABLE sms_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reviewId INT,
  appointmentId INT,
  customerPhone VARCHAR(20),
  messageType ENUM('review_request', 'positive_response', 'feedback_request', 'feedback_confirm', 'admin_alert', 'bulk_message'),
  messageBody TEXT,
  direction ENUM('outbound', 'inbound'),
  twilioSid VARCHAR(100) UNIQUE,
  status ENUM('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'received') DEFAULT 'queued',
  deliveryStatus VARCHAR(50),
  deliveryDate TIMESTAMP,
  failureReason TEXT,
  failureCode VARCHAR(10),
  cost DECIMAL(10, 4),
  retryCount INT DEFAULT 0,
  maxRetries INT DEFAULT 3,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewId) REFERENCES reviews(id),
  FOREIGN KEY (appointmentId) REFERENCES appointments(id),
  KEY (status),
  KEY (customerPhone),
  KEY (createdAt),
  KEY (twilioSid)
);

-- SMS Failure Queue for retries
CREATE TABLE sms_retry_queue (
  id INT PRIMARY KEY AUTO_INCREMENT,
  smsLogId INT NOT NULL,
  retryCount INT DEFAULT 0,
  nextRetryAt TIMESTAMP,
  lastError TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (smsLogId) REFERENCES sms_logs(id),
  KEY (nextRetryAt)
);

-- SMS Cost tracking
CREATE TABLE sms_cost_tracking (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE,
  totalMessages INT,
  successfulMessages INT,
  failedMessages INT,
  totalCost DECIMAL(10, 2),
  costPerMessage DECIMAL(10, 4),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (date)
);
```

---

## Frontend - SMS Monitoring Dashboard

**File: src/pages/SMSMonitoring.jsx**

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './sms-monitoring.css';

export default function SMSMonitoring() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [costData, setCostData] = useState([]);
  const [failureQueue, setFailureQueue] = useState([]);
  const [filter, setFilter] = useState('all'); // all, sent, delivered, failed
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('logs'); // logs, stats, costs, queue

  useEffect(() => {
    fetchSMSData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSMSData, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchSMSData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const [logsRes, statsRes, costRes, queueRes] = await Promise.all([
        axios.get('/api/admin/sms/logs', {
          params: { status: filter, search },
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/admin/sms/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/admin/sms/costs', {
          params: { period: '30days' },
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/admin/sms/retry-queue', {
          headers: { Authorization: `Bearer ${token}` }
        }),
      ]);

      setLogs(logsRes.data);
      setStats(statsRes.data);
      setCostData(costRes.data);
      setFailureQueue(queueRes.data);
    } catch (error) {
      console.error('Error fetching SMS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (smsLogId) => {
    try {
      await axios.post(`/api/admin/sms/logs/${smsLogId}/retry`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      fetchSMSData();
    } catch (error) {
      console.error('Error retrying SMS:', error);
    }
  };

  return (
    <div className="sms-monitoring">
      <h1>📱 SMS Delivery Monitoring</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <StatCard
            title="Total SMS Today"
            value={stats.todayTotal}
            icon="📤"
            color="blue"
          />
          <StatCard
            title="Delivered"
            value={stats.deliveredToday}
            icon="✅"
            color="green"
            percentage={((stats.deliveredToday / stats.todayTotal) * 100).toFixed(1)}
          />
          <StatCard
            title="Failed"
            value={stats.failedToday}
            icon="❌"
            color="red"
            percentage={((stats.failedToday / stats.todayTotal) * 100).toFixed(1)}
          />
          <StatCard
            title="30-Day Cost"
            value={`$${stats.costLast30Days.toFixed(2)}`}
            icon="💰"
            color="orange"
            subtext={`${stats.costLast30Days > 0 ? (stats.costPerMessage * 1000).toFixed(3) + '¢' : '0¢'}/msg`}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="monitoring-tabs">
        <button
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          SMS Logs
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
        </button>
        <button
          className={`tab ${activeTab === 'costs' ? 'active' : ''}`}
          onClick={() => setActiveTab('costs')}
        >
          Cost Analysis
        </button>
        <button
          className={`tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          Retry Queue ({failureQueue.length})
        </button>
      </div>

      {/* SMS Logs Tab */}
      {activeTab === 'logs' && (
        <SMSLogsTab
          logs={logs}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          loading={loading}
          onRetry={handleRetry}
        />
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && stats && (
        <StatisticsTab stats={stats} />
      )}

      {/* Cost Analysis Tab */}
      {activeTab === 'costs' && (
        <CostAnalysisTab costData={costData} />
      )}

      {/* Retry Queue Tab */}
      {activeTab === 'queue' && (
        <RetryQueueTab
          queue={failureQueue}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}

// SMS Logs Tab
function SMSLogsTab({ logs, filter, setFilter, search, setSearch, loading, onRetry }) {
  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === 'all' || log.status === filter;
    const matchesSearch = log.customerPhone.includes(search) || log.messageBody.includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="tab-content">
      {/* Filters */}
      <div className="logs-toolbar">
        <input
          type="text"
          placeholder="Search by phone or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />

        <div className="status-filters">
          {['all', 'sent', 'delivered', 'failed', 'received'].map(status => (
            <button
              key={status}
              className={`filter-btn ${filter === status ? 'active' : ''}`}
              onClick={() => setFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="sms-logs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Phone</th>
              <th>Message Type</th>
              <th>Message</th>
              <th>Status</th>
              <th>Delivery Time</th>
              <th>Cost</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => (
              <SMSLogRow
                key={log.id}
                log={log}
                onRetry={onRetry}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SMSLogRow({ log, onRetry }) {
  const [expanded, setExpanded] = useState(false);

  const getStatusBadge = (status) => {
    const badges = {
      'sent': { color: 'blue', emoji: '📤' },
      'delivered': { color: 'green', emoji: '✅' },
      'failed': { color: 'red', emoji: '❌' },
      'received': { color: 'purple', emoji: '📥' },
      'bounced': { color: 'orange', emoji: '⚠️' },
      'queued': { color: 'gray', emoji: '⏳' },
    };
    const badge = badges[status] || badges['queued'];
    return (
      <span className={`status-badge status-${badge.color}`}>
        {badge.emoji} {status}
      </span>
    );
  };

  const getMessageTypeLabel = (type) => {
    const labels = {
      'review_request': '📋 Review Request',
      'positive_response': '⭐ Positive Response',
      'feedback_request': '❓ Feedback Request',
      'feedback_confirm': '✅ Confirmation',
      'admin_alert': '🚨 Admin Alert',
      'bulk_message': '📢 Bulk Message',
    };
    return labels[type] || type;
  };

  return (
    <>
      <tr onClick={() => setExpanded(!expanded)} className="clickable-row">
        <td>{new Date(log.createdAt).toLocaleTimeString()}</td>
        <td>{log.customerPhone}</td>
        <td>{getMessageTypeLabel(log.messageType)}</td>
        <td className="message-preview">
          {log.messageBody.substring(0, 50)}
          {log.messageBody.length > 50 ? '...' : ''}
        </td>
        <td>{getStatusBadge(log.status)}</td>
        <td>{log.deliveryDate ? new Date(log.deliveryDate).toLocaleTimeString() : '-'}</td>
        <td>${log.cost?.toFixed(4) || '0.0000'}</td>
        <td>
          {log.status === 'failed' && (
            <button
              className="btn btn-small btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(log.id);
              }}
            >
              Retry
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="expanded-row">
          <td colSpan="8">
            <div className="log-details">
              <div className="detail-section">
                <h4>Full Message</h4>
                <p>{log.messageBody}</p>
              </div>

              {log.failureReason && (
                <div className="detail-section error">
                  <h4>Failure Details</h4>
                  <p><strong>Code:</strong> {log.failureCode}</p>
                  <p><strong>Reason:</strong> {log.failureReason}</p>
                  <p><strong>Retries:</strong> {log.retryCount} / {log.maxRetries}</p>
                </div>
              )}

              <div className="detail-section">
                <h4>Details</h4>
                <p><strong>Twilio SID:</strong> {log.twilioSid}</p>
                <p><strong>Direction:</strong> {log.direction}</p>
                <p><strong>Created:</strong> {new Date(log.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Statistics Tab
function StatisticsTab({ stats }) {
  return (
    <div className="tab-content">
      <div className="stats-details">
        <div className="stat-item">
          <h3>Delivery Rate</h3>
          <p className="stat-value">{stats.deliveryRate.toFixed(2)}%</p>
          <div className="stat-bar">
            <div
              className="stat-bar-fill green"
              style={{ width: `${stats.deliveryRate}%` }}
            />
          </div>
        </div>

        <div className="stat-item">
          <h3>Failure Rate</h3>
          <p className="stat-value">{stats.failureRate.toFixed(2)}%</p>
          <div className="stat-bar">
            <div
              className="stat-bar-fill red"
              style={{ width: `${stats.failureRate}%` }}
            />
          </div>
        </div>

        <div className="stat-item">
          <h3>Average Delivery Time</h3>
          <p className="stat-value">{stats.avgDeliveryTime.toFixed(1)}s</p>
        </div>

        <div className="stat-item">
          <h3>Most Common Error</h3>
          <p className="stat-value">{stats.mostCommonError || 'None'}</p>
        </div>
      </div>
    </div>
  );
}

// Cost Analysis Tab
function CostAnalysisTab({ costData }) {
  return (
    <div className="tab-content">
      <h3>30-Day SMS Cost Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={costData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
          <Legend />
          <Line type="monotone" dataKey="totalCost" stroke="#ef4444" name="Daily Cost" />
          <Line type="monotone" dataKey="totalMessages" stroke="#3b82f6" name="Messages" yAxisId="right" />
        </LineChart>
      </ResponsiveContainer>

      <div className="cost-summary">
        <h4>Cost Summary</h4>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Messages</th>
              <th>Cost</th>
              <th>Cost/Message</th>
            </tr>
          </thead>
          <tbody>
            {costData.map(day => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{day.totalMessages}</td>
                <td>${day.totalCost.toFixed(2)}</td>
                <td>${day.costPerMessage.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Retry Queue Tab
function RetryQueueTab({ queue, onRetry }) {
  if (queue.length === 0) {
    return (
      <div className="tab-content">
        <p className="empty-queue">✅ No SMS in retry queue</p>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <table className="retry-queue-table">
        <thead>
          <tr>
            <th>Phone</th>
            <th>Message</th>
            <th>Retries</th>
            <th>Last Error</th>
            <th>Next Retry</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {queue.map(item => (
            <tr key={item.id}>
              <td>{item.customerPhone}</td>
              <td>{item.messageBody.substring(0, 30)}...</td>
              <td>{item.retryCount} / 3</td>
              <td className="error-text">{item.lastError}</td>
              <td>{new Date(item.nextRetryAt).toLocaleTimeString()}</td>
              <td>
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => onRetry(item.smsLogId)}
                >
                  Retry Now
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, icon, color, percentage, subtext }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <h3>{title}</h3>
        <p className="stat-number">{value}</p>
        {percentage && <p className="stat-percentage">{percentage}%</p>}
        {subtext && <p className="stat-subtext">{subtext}</p>}
      </div>
    </div>
  );
}
```

---

## Backend - SMS Monitoring Endpoints

**File: src/api/sms-monitoring.routes.js**

```javascript
const express = require('express');
const router = express.Router();
const smsController = require('../controllers/smsController');
const auth = require('../middleware/auth');

router.use(auth.requireAdmin);

// Get SMS logs
router.get('/sms/logs', smsController.getSMSLogs);

// Get SMS statistics
router.get('/sms/stats', smsController.getSMSStats);

// Get cost analysis
router.get('/sms/costs', smsController.getSMSCosts);

// Get retry queue
router.get('/sms/retry-queue', smsController.getRetryQueue);

// Retry individual SMS
router.post('/sms/logs/:id/retry', smsController.retrySMS);

// Twilio webhook for delivery status
router.post('/sms/webhook/status', smsController.handleTwilioStatusCallback);

module.exports = router;
```

---

## Styling

**File: src/styles/sms-monitoring.css**

```css
.sms-monitoring {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.sms-monitoring h1 {
  margin-bottom: 2rem;
  color: #333;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  padding: 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.stat-blue { background: #dbeafe; }
.stat-green { background: #dcfce7; }
.stat-red { background: #fee2e2; }
.stat-orange { background: #fed7aa; }

.stat-icon {
  font-size: 2.5rem;
}

.stat-info h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #666;
  text-transform: uppercase;
}

.stat-number {
  margin: 0.5rem 0 0 0;
  font-size: 1.8rem;
  font-weight: bold;
  color: #333;
}

.stat-percentage {
  margin: 0.25rem 0 0 0;
  font-size: 0.85rem;
  color: #059669;
}

.stat-subtext {
  margin: 0.25rem 0 0 0;
  font-size: 0.75rem;
  color: #666;
}

/* Tabs */
.monitoring-tabs {
  display: flex;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 2rem;
  gap: 0;
}

.monitoring-tabs .tab {
  padding: 1rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  color: #666;
  border-bottom: 3px solid transparent;
  transition: all 0.3s;
}

.monitoring-tabs .tab:hover {
  color: #333;
}

.monitoring-tabs .tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

/* Logs Toolbar */
.logs-toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.status-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.filter-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.filter-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* SMS Logs Table */
.sms-logs-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.sms-logs-table th {
  background: #f3f4f6;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #e5e7eb;
}

.sms-logs-table td {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.sms-logs-table tr.clickable-row {
  cursor: pointer;
  transition: background 0.2s;
}

.sms-logs-table tr.clickable-row:hover {
  background: #f9fafb;
}

.message-preview {
  color: #666;
  font-size: 0.9rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status Badge */
.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}

.status-green { background: #dcfce7; color: #059669; }
.status-red { background: #fee2e2; color: #dc2626; }
.status-blue { background: #dbeafe; color: #0284c7; }
.status-orange { background: #fed7aa; color: #b45309; }
.status-purple { background: #e9d5ff; color: #6b21a8; }
.status-gray { background: #f3f4f6; color: #6b7280; }

/* Expanded Row */
.expanded-row td {
  padding: 0;
  background: #f9fafb;
}

.log-details {
  padding: 1.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.detail-section h4 {
  margin-top: 0;
  color: #333;
}

.detail-section p {
  margin: 0.5rem 0;
  color: #666;
  font-size: 0.9rem;
  word-break: break-all;
}

.detail-section.error {
  background: #fee2e2;
  padding: 1rem;
  border-radius: 4px;
  border-left: 3px solid #dc2626;
}

/* Buttons */
.btn.btn-small {
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #2563eb;
}

/* Cost Summary */
.cost-summary {
  margin-top: 2rem;
}

.cost-summary table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

.cost-summary th {
  background: #f3f4f6;
  padding: 0.75rem;
  text-align: left;
  border-bottom: 2px solid #e5e7eb;
}

.cost-summary td {
  padding: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

/* Stat Details */
.stats-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
}

.stat-item h3 {
  margin-top: 0;
  color: #333;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: bold;
  color: #3b82f6;
  margin: 0.5rem 0;
}

.stat-bar {
  background: #e5e7eb;
  height: 20px;
  border-radius: 10px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  transition: width 0.3s;
}

.stat-bar-fill.green { background: #10b981; }
.stat-bar-fill.red { background: #ef4444; }

/* Empty Queue */
.empty-queue {
  text-align: center;
  padding: 3rem;
  color: #059669;
  font-size: 1.1rem;
}

/* Error Text */
.error-text {
  color: #dc2626;
  font-size: 0.9rem;
}

/* Responsive */
@media (max-width: 768px) {
  .sms-monitoring {
    padding: 1rem;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .sms-logs-table {
    font-size: 0.85rem;
  }

  .sms-logs-table th,
  .sms-logs-table td {
    padding: 0.5rem;
  }

  .message-preview {
    max-width: 100px;
  }
}
```

---

## Features Summary

✅ **Real-time Monitoring**
- Live SMS delivery status tracking
- Failed SMS detection and alerting
- Delivery time metrics

✅ **Detailed Logs**
- Full message text viewing
- Twilio SID tracking
- Failure codes and reasons
- Expandable log rows

✅ **Automatic Retries**
- Failed SMS retry queue
- Configurable retry limits (default: 3)
- Manual retry option
- Retry history tracking

✅ **Cost Analysis**
- Daily cost tracking
- Cost per message
- 30-day cost trends
- Budget monitoring

✅ **Statistics**
- Delivery rate percentage
- Failure rate percentage
- Average delivery time
- Error trending

