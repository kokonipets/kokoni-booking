# Review Reports & Analytics

Comprehensive analytics and reporting system for review trends, insights, and business intelligence.

---

## Overview

Generate detailed reports showing:
- Review trends by date, service, groomer
- Customer satisfaction metrics
- Feedback analysis & common issues
- Response time analytics
- Monthly/yearly reports

---

## Database Schema

```sql
-- Analytics cache table (for faster reporting)
CREATE TABLE review_analytics_cache (
  id INT PRIMARY KEY AUTO_INCREMENT,
  period ENUM('daily', 'weekly', 'monthly', 'yearly'),
  periodDate DATE,
  totalReviews INT,
  avgRating DECIMAL(3, 2),
  positiveCount INT,
  negativeCount INT,
  neutralCount INT,
  responseRate DECIMAL(5, 2),
  avgResponseTime INT, -- in minutes
  commonIssues JSON,
  topGroomer VARCHAR(100),
  topService VARCHAR(100),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (period, periodDate)
);

-- Customer satisfaction trends
CREATE TABLE satisfaction_trends (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE,
  ratingDistribution JSON, -- {1: 2, 2: 3, 3: 5, 4: 15, 5: 25}
  responseCount INT,
  topFeedback TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (date)
);

-- Feedback keyword analysis
CREATE TABLE feedback_keywords (
  id INT PRIMARY KEY AUTO_INCREMENT,
  keyword VARCHAR(100),
  count INT,
  sentiment ENUM('positive', 'negative', 'neutral'),
  firstSeen TIMESTAMP,
  lastSeen TIMESTAMP,
  KEY (sentiment, count DESC)
);

-- Groomer performance metrics
CREATE TABLE groomer_metrics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  groomerId INT,
  groomerName VARCHAR(100),
  totalAppointments INT,
  totalReviews INT,
  avgRating DECIMAL(3, 2),
  positiveRate DECIMAL(5, 2),
  responseRate DECIMAL(5, 2),
  lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (groomerId)
);

-- Service performance metrics
CREATE TABLE service_metrics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  serviceType VARCHAR(100),
  totalAppointments INT,
  totalReviews INT,
  avgRating DECIMAL(3, 2),
  positiveRate DECIMAL(5, 2),
  commonFeedback TEXT,
  lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (serviceType)
);
```

---

## Frontend - Analytics Dashboard

**File: src/pages/ReviewAnalytics.jsx**

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import './analytics.css';

export default function ReviewAnalytics() {
  const [period, setPeriod] = useState('monthly'); // daily, weekly, monthly, yearly
  const [trendData, setTrendData] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [groomerData, setGroomerData] = useState([]);
  const [serviceData, setServiceData] = useState([]);
  const [feedbackAnalysis, setFeedbackAnalysis] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, [period, dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const params = {
        period,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      };

      const [trendRes, metricsRes, groomerRes, serviceRes, feedbackRes] = await Promise.all([
        axios.get('/api/admin/analytics/trends', { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/admin/analytics/metrics', { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/admin/analytics/groomer-performance', { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/admin/analytics/service-performance', { params, headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/admin/analytics/feedback-analysis', { params, headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setTrendData(trendRes.data);
      setMetrics(metricsRes.data);
      setGroomerData(groomerRes.data);
      setServiceData(serviceRes.data);
      setFeedbackAnalysis(feedbackRes.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post('/api/admin/analytics/export', {
        format,
        period,
        dateRange,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: format === 'pdf' ? 'blob' : 'json'
      });

      if (format === 'pdf') {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `reviews-report-${period}.pdf`);
        document.body.appendChild(link);
        link.click();
      } else {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `reviews-report-${period}.json`);
        document.body.appendChild(link);
        link.click();
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  if (loading) return <div className="analytics-loading">Loading analytics...</div>;

  return (
    <div className="analytics-container">
      <header className="analytics-header">
        <h1>📊 Review Analytics & Reports</h1>
        
        <div className="analytics-controls">
          {/* Date Range Picker */}
          <div className="date-picker">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            />
            <span>to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            />
          </div>

          {/* Period Selector */}
          <div className="period-selector">
            {['daily', 'weekly', 'monthly', 'yearly'].map(p => (
              <button
                key={p}
                className={`period-btn ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Export Buttons */}
          <div className="export-buttons">
            <button
              className="btn btn-secondary"
              onClick={() => handleExport('json')}
            >
              📥 Export JSON
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleExport('pdf')}
            >
              📑 Export PDF
            </button>
          </div>
        </div>
      </header>

      {/* Key Metrics */}
      {metrics && (
        <div className="metrics-section">
          <h2>Key Metrics</h2>
          <div className="metrics-grid">
            <MetricBox
              title="Total Reviews"
              value={metrics.totalReviews}
              icon="📝"
            />
            <MetricBox
              title="Avg Rating"
              value={metrics.avgRating.toFixed(2)}
              icon="⭐"
              subtext={`out of 5.00`}
            />
            <MetricBox
              title="Response Rate"
              value={`${metrics.responseRate.toFixed(1)}%`}
              icon="📬"
            />
            <MetricBox
              title="Positive Reviews"
              value={`${metrics.positiveRate.toFixed(1)}%`}
              icon="😊"
            />
            <MetricBox
              title="Avg Response Time"
              value={`${metrics.avgResponseTime}m`}
              icon="⏱️"
            />
            <MetricBox
              title="Total Feedback"
              value={metrics.totalFeedback}
              icon="💬"
            />
          </div>
        </div>
      )}

      {/* Review Trends Chart */}
      <div className="chart-section">
        <h2>Review Trends</h2>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="positiveCount" stackId="a" fill="#10b981" name="Positive (4-5)" />
            <Bar yAxisId="left" dataKey="negativeCount" stackId="a" fill="#ef4444" name="Negative (1-3)" />
            <Line yAxisId="right" type="monotone" dataKey="avgRating" stroke="#f59e0b" name="Avg Rating" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Rating Distribution */}
      {metrics && (
        <div className="chart-section">
          <h2>Rating Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={metrics.ratingDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}⭐: ${value}`}
                outerRadius={100}
                dataKey="count"
              >
                <Cell fill="#ef4444" />
                <Cell fill="#f97316" />
                <Cell fill="#eab308" />
                <Cell fill="#84cc16" />
                <Cell fill="#10b981" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Groomer Performance */}
      <div className="performance-section">
        <h2>Groomer Performance</h2>
        <div className="performance-table-wrapper">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Groomer</th>
                <th>Total Reviews</th>
                <th>Avg Rating</th>
                <th>Positive Rate</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {groomerData.map(groomer => (
                <tr key={groomer.id}>
                  <td><strong>{groomer.name}</strong></td>
                  <td>{groomer.totalReviews}</td>
                  <td>{groomer.avgRating.toFixed(2)} ⭐</td>
                  <td>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${groomer.positiveRate}%`,
                          background: groomer.positiveRate >= 80 ? '#10b981' : groomer.positiveRate >= 60 ? '#f59e0b' : '#ef4444'
                        }}
                      />
                    </div>
                    <span>{groomer.positiveRate.toFixed(1)}%</span>
                  </td>
                  <td className={groomer.trend > 0 ? 'positive' : 'negative'}>
                    {groomer.trend > 0 ? '📈' : '📉'} {Math.abs(groomer.trend).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Service Performance */}
      <div className="performance-section">
        <h2>Service Performance</h2>
        <div className="performance-table-wrapper">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Total Reviews</th>
                <th>Avg Rating</th>
                <th>Positive Rate</th>
                <th>Common Feedback</th>
              </tr>
            </thead>
            <tbody>
              {serviceData.map(service => (
                <tr key={service.id}>
                  <td><strong>{service.serviceType}</strong></td>
                  <td>{service.totalReviews}</td>
                  <td>{service.avgRating.toFixed(2)} ⭐</td>
                  <td>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${service.positiveRate}%`,
                          background: service.positiveRate >= 80 ? '#10b981' : service.positiveRate >= 60 ? '#f59e0b' : '#ef4444'
                        }}
                      />
                    </div>
                    <span>{service.positiveRate.toFixed(1)}%</span>
                  </td>
                  <td className="feedback-text">{service.commonFeedback}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feedback Analysis */}
      {feedbackAnalysis && (
        <div className="feedback-section">
          <h2>Feedback Analysis</h2>
          
          <div className="feedback-grid">
            <div className="feedback-box">
              <h3>😊 Positive Keywords</h3>
              <div className="keyword-list">
                {feedbackAnalysis.positiveKeywords?.map(kw => (
                  <span key={kw} className="keyword positive">
                    {kw} ({feedbackAnalysis.keywordCounts[kw]})
                  </span>
                ))}
              </div>
            </div>

            <div className="feedback-box">
              <h3>😞 Negative Keywords</h3>
              <div className="keyword-list">
                {feedbackAnalysis.negativeKeywords?.map(kw => (
                  <span key={kw} className="keyword negative">
                    {kw} ({feedbackAnalysis.keywordCounts[kw]})
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="feedback-insights">
            <h3>Key Insights</h3>
            <ul>
              {feedbackAnalysis.insights?.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Metric Box Component
function MetricBox({ title, value, icon, subtext }) {
  return (
    <div className="metric-box">
      <div className="metric-icon">{icon}</div>
      <h3>{title}</h3>
      <p className="metric-value">{value}</p>
      {subtext && <p className="metric-subtext">{subtext}</p>}
    </div>
  );
}
```

---

## Styling

**File: src/styles/analytics.css**

```css
.analytics-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.analytics-header {
  margin-bottom: 3rem;
}

.analytics-header h1 {
  margin: 0 0 1.5rem 0;
  color: #333;
  font-size: 2rem;
}

.analytics-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  align-items: center;
}

/* Date Picker */
.date-picker {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.date-picker input {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

/* Period Selector */
.period-selector {
  display: flex;
  gap: 0.5rem;
}

.period-btn {
  padding: 0.5rem 1rem;
  border: 2px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.period-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.period-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* Export Buttons */
.export-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-secondary {
  background: #e5e7eb;
  color: #333;
}

.btn-secondary:hover {
  background: #d1d5db;
}

/* Metrics Section */
.metrics-section h2 {
  margin-bottom: 1.5rem;
  color: #333;
  font-size: 1.3rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.metric-box {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  text-align: center;
}

.metric-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.metric-box h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #666;
  text-transform: uppercase;
  text-weight: 600;
}

.metric-value {
  margin: 0.5rem 0 0 0;
  font-size: 2rem;
  font-weight: bold;
  color: #333;
}

.metric-subtext {
  margin: 0.5rem 0 0 0;
  font-size: 0.85rem;
  color: #999;
}

/* Charts */
.chart-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.chart-section h2 {
  margin-top: 0;
  color: #333;
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
}

/* Performance Tables */
.performance-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.performance-section h2 {
  margin-top: 0;
  color: #333;
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
}

.performance-table-wrapper {
  overflow-x: auto;
}

.performance-table {
  width: 100%;
  border-collapse: collapse;
}

.performance-table th {
  background: #f3f4f6;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #e5e7eb;
  color: #666;
  font-size: 0.9rem;
}

.performance-table td {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  color: #333;
}

.performance-table tr:hover {
  background: #f9fafb;
}

/* Progress Bar */
.progress-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.25rem;
}

.progress-fill {
  flex: 1;
  height: 20px;
  border-radius: 10px;
  transition: width 0.3s;
}

.progress-bar span {
  font-weight: bold;
  font-size: 0.85rem;
  min-width: 45px;
  text-align: right;
}

/* Feedback Section */
.feedback-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.feedback-section h2 {
  margin-top: 0;
  color: #333;
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
}

.feedback-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.feedback-box {
  background: #f9fafb;
  padding: 1.5rem;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
}

.feedback-box h3 {
  margin-top: 0;
  color: #333;
}

.keyword-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.keyword {
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  font-size: 0.85rem;
  font-weight: 500;
}

.keyword.positive {
  background: #dcfce7;
  color: #059669;
}

.keyword.negative {
  background: #fee2e2;
  color: #dc2626;
}

.feedback-insights {
  background: #f0f9ff;
  padding: 1.5rem;
  border-left: 3px solid #0284c7;
  border-radius: 8px;
}

.feedback-insights h3 {
  margin-top: 0;
  color: #0284c7;
}

.feedback-insights ul {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.feedback-insights li {
  margin: 0.5rem 0;
  color: #333;
  line-height: 1.6;
}

/* Responsive */
@media (max-width: 768px) {
  .analytics-container {
    padding: 1rem;
  }

  .analytics-controls {
    flex-direction: column;
    align-items: flex-start;
  }

  .metrics-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .performance-table {
    font-size: 0.85rem;
  }

  .performance-table th,
  .performance-table td {
    padding: 0.5rem;
  }
}
```

---

## Backend - Analytics Endpoints

**File: src/api/analytics.routes.js**

```javascript
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const auth = require('../middleware/auth');

router.use(auth.requireAdmin);

// Trends & metrics
router.get('/analytics/trends', analyticsController.getTrends);
router.get('/analytics/metrics', analyticsController.getMetrics);

// Performance
router.get('/analytics/groomer-performance', analyticsController.getGroomerPerformance);
router.get('/analytics/service-performance', analyticsController.getServicePerformance);

// Feedback analysis
router.get('/analytics/feedback-analysis', analyticsController.getFeedbackAnalysis);

// Export
router.post('/analytics/export', analyticsController.exportReport);

module.exports = router;
```

---

## Features Summary

✅ **Key Metrics Dashboard**
- Total reviews, average rating, response rate
- Positive review percentage, response time tracking

✅ **Trend Analysis**
- Multi-period support (daily, weekly, monthly, yearly)
- Positive vs negative trends
- Rating trends over time

✅ **Performance Metrics**
- Groomer individual ratings and trends
- Service-level performance
- Top performers identification

✅ **Feedback Intelligence**
- Keyword analysis (positive & negative)
- Common issues tracking
- Automated insights generation

✅ **Reporting**
- Export to JSON or PDF
- Custom date range selection
- Historical data tracking

