# Customer Feedback Portal

Customer-facing portal where customers can view their appointment reviews and feedback history.

---

## Overview

Customers can:
- View all their past appointments
- See reviews they submitted
- View admin responses to their feedback
- Track review status (sent, received, responded)
- Provide additional feedback

---

## Database Schema

```sql
-- Add to reviews table
ALTER TABLE reviews ADD COLUMN customerId INT;
ALTER TABLE reviews ADD COLUMN viewedByCustomer BOOLEAN DEFAULT FALSE;
ALTER TABLE reviews ADD COLUMN viewedAt TIMESTAMP;
ALTER TABLE reviews ADD FOREIGN KEY (customerId) REFERENCES users(id);

-- Customer access tokens (optional, for public feedback links)
CREATE TABLE customer_feedback_links (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customerId INT NOT NULL,
  appointmentId INT NOT NULL,
  token VARCHAR(100) UNIQUE,
  expiresAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customerId) REFERENCES users(id),
  FOREIGN KEY (appointmentId) REFERENCES appointments(id)
);
```

---

## Frontend - Customer Portal Page

**File: src/pages/CustomerFeedbackPortal.jsx**

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './feedback-portal.css';

export default function CustomerFeedbackPortal() {
  const [reviews, setReviews] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, responded, pending
  
  useEffect(() => {
    fetchCustomerData();
  }, []);
  
  const fetchCustomerData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const [appointmentsRes, reviewsRes] = await Promise.all([
        axios.get('/api/customer/appointments', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/customer/reviews', {
          headers: { Authorization: `Bearer ${token}` }
        }),
      ]);
      
      setAppointments(appointmentsRes.data);
      setReviews(reviewsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleMarkAsViewed = async (reviewId) => {
    try {
      await axios.post(`/api/customer/reviews/${reviewId}/mark-viewed`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      
      setReviews(reviews.map(r =>
        r.id === reviewId ? { ...r, viewedByCustomer: true, viewedAt: new Date() } : r
      ));
    } catch (error) {
      console.error('Error marking as viewed:', error);
    }
  };
  
  const filteredReviews = reviews.filter(review => {
    if (filter === 'responded') return review.adminResponse;
    if (filter === 'pending') return !review.adminResponse;
    return true;
  });
  
  return (
    <div className="customer-portal">
      <header className="portal-header">
        <h1>My Reviews & Feedback</h1>
        <p>View your appointment reviews and responses from our team</p>
      </header>
      
      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Reviews ({reviews.length})
        </button>
        <button
          className={`tab ${filter === 'responded' ? 'active' : ''}`}
          onClick={() => setFilter('responded')}
        >
          With Responses ({reviews.filter(r => r.adminResponse).length})
        </button>
        <button
          className={`tab ${filter === 'pending' ? 'active' ? ''}`}
          onClick={() => setFilter('pending')}
        >
          Awaiting Response ({reviews.filter(r => !r.adminResponse).length})
        </button>
      </div>
      
      {/* Reviews List */}
      <div className="reviews-list">
        {filteredReviews.length === 0 ? (
          <div className="empty-state">
            <p>No reviews yet</p>
          </div>
        ) : (
          filteredReviews.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              appointment={appointments.find(a => a.id === review.appointmentId)}
              onMarkViewed={handleMarkAsViewed}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review, appointment, onMarkViewed }) {
  const [expanded, setExpanded] = useState(false);
  
  const getRatingColor = (rating) => {
    if (rating >= 4) return 'green';
    if (rating === 3) return 'yellow';
    return 'red';
  };
  
  return (
    <div className={`review-card rating-${getRatingColor(review.initialRating)}`}>
      <div className="review-header" onClick={() => setExpanded(!expanded)}>
        <div className="review-info">
          <h3>{appointment?.petName || 'Unknown'}</h3>
          <p className="service-type">{appointment?.serviceType}</p>
          <p className="date">
            {new Date(review.createdAt).toLocaleDateString()}
          </p>
        </div>
        
        <div className="review-rating">
          <div className="stars">
            {'⭐'.repeat(review.initialRating)}
            {review.initialRating < 5 && '☆'.repeat(5 - review.initialRating)}
          </div>
          <span className="rating-number">{review.initialRating}/5</span>
        </div>
        
        {review.adminResponse && (
          <div className="response-badge">✅ Responded</div>
        )}
      </div>
      
      {expanded && (
        <div className="review-details">
          {/* Customer Feedback */}
          {review.feedback && (
            <div className="feedback-section">
              <h4>Your Feedback</h4>
              <p>{review.feedback}</p>
            </div>
          )}
          
          {/* Admin Response */}
          {review.adminResponse ? (
            <div className="admin-response-section">
              <h4>Response from Our Team</h4>
              <div className="admin-message">
                <p>{review.adminResponse}</p>
                <p className="response-time">
                  Sent: {new Date(review.respondedAt).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="awaiting-response">
              <p>We're reviewing your feedback and will respond soon!</p>
            </div>
          )}
          
          {/* Review Status */}
          <div className="review-status">
            <p>
              Status: <strong>{getStatusLabel(review.status)}</strong>
            </p>
            {!review.viewedByCustomer && (
              <button
                className="btn btn-secondary"
                onClick={() => onMarkViewed(review.id)}
              >
                Mark as Viewed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusLabel(status) {
  const labels = {
    'positive': '😊 Positive Review',
    'waiting_feedback': '⏳ Waiting for Your Feedback',
    'feedback_received': '📝 Feedback Received',
    'admin_responded': '✅ Team Responded',
    'pending': '⏳ Pending',
  };
  return labels[status] || status;
}
```

---

## Backend - Customer Portal Endpoints

**File: src/api/customer.routes.js**

```javascript
const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const auth = require('../middleware/auth');

// Protect all customer routes
router.use(auth.requireAuth);

// Get customer's appointments
router.get('/appointments', customerController.getCustomerAppointments);

// Get customer's reviews
router.get('/reviews', customerController.getCustomerReviews);

// Get specific review details
router.get('/reviews/:id', customerController.getReviewDetails);

// Mark review as viewed
router.post('/reviews/:id/mark-viewed', customerController.markReviewAsViewed);

// Get public feedback link
router.get('/reviews/:id/share-link', customerController.generateShareLink);

module.exports = router;
```

---

## Backend - Customer Controller

**File: src/controllers/customerController.js**

```javascript
const db = require('../db');
const crypto = require('crypto');

exports.getCustomerAppointments = async (req, res) => {
  try {
    const customerId = req.user.id;
    
    const [appointments] = await db.query(`
      SELECT
        a.id,
        a.petName,
        a.serviceType,
        a.appointmentDate,
        a.status,
        a.totalPrice
      FROM appointments a
      WHERE a.customerId = ?
      AND a.status IN ('completed', 'cancelled')
      ORDER BY a.appointmentDate DESC
    `, [customerId]);
    
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCustomerReviews = async (req, res) => {
  try {
    const customerId = req.user.id;
    
    const [reviews] = await db.query(`
      SELECT
        r.id,
        r.appointmentId,
        r.initialRating,
        r.feedback,
        r.adminResponse,
        r.status,
        r.createdAt,
        r.respondedAt,
        r.viewedByCustomer,
        r.viewedAt,
        a.petName,
        a.serviceType
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE a.customerId = ?
      ORDER BY r.createdAt DESC
    `, [customerId]);
    
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getReviewDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user.id;
    
    const [reviews] = await db.query(`
      SELECT
        r.*,
        a.petName,
        a.serviceType,
        a.appointmentDate,
        a.groomer
      FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE r.id = ? AND a.customerId = ?
    `, [id, customerId]);
    
    if (reviews.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    res.json(reviews[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.markReviewAsViewed = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user.id;
    
    // Verify review belongs to customer
    const [reviews] = await db.query(`
      SELECT r.id FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE r.id = ? AND a.customerId = ?
    `, [id, customerId]);
    
    if (reviews.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await db.query(`
      UPDATE reviews
      SET viewedByCustomer = TRUE, viewedAt = NOW()
      WHERE id = ?
    `, [id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.generateShareLink = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user.id;
    
    // Verify review belongs to customer
    const [reviews] = await db.query(`
      SELECT r.id FROM reviews r
      JOIN appointments a ON r.appointmentId = a.id
      WHERE r.id = ? AND a.customerId = ?
    `, [id, customerId]);
    
    if (reviews.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await db.query(`
      INSERT INTO customer_feedback_links (customerId, appointmentId, token, expiresAt)
      VALUES (?, ?, ?, ?)
    `, [customerId, reviews[0].appointmentId, token, expiresAt]);
    
    const shareUrl = `${process.env.FRONTEND_URL}/feedback/${token}`;
    
    res.json({
      shareUrl,
      expiresAt,
      message: 'Link created and can be shared for 30 days'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

---

## Styling

**File: src/styles/feedback-portal.css**

```css
.customer-portal {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.portal-header {
  text-align: center;
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 2px solid #e5e7eb;
}

.portal-header h1 {
  font-size: 2rem;
  color: #333;
  margin: 0;
}

.portal-header p {
  color: #666;
  margin: 0.5rem 0 0 0;
}

/* Filter Tabs */
.filter-tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  overflow-x: auto;
}

.filter-tabs .tab {
  padding: 0.75rem 1.5rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-weight: 500;
  color: #666;
  transition: all 0.2s;
  white-space: nowrap;
}

.filter-tabs .tab:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.filter-tabs .tab.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* Reviews List */
.reviews-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Review Card */
.review-card {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.review-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.review-card.rating-green {
  border-left: 4px solid #10b981;
}

.review-card.rating-yellow {
  border-left: 4px solid #f59e0b;
}

.review-card.rating-red {
  border-left: 4px solid #ef4444;
}

/* Review Header */
.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  background: #f9fafb;
  cursor: pointer;
  user-select: none;
}

.review-info h3 {
  margin: 0;
  color: #333;
  font-size: 1.1rem;
}

.review-info .service-type {
  margin: 0.25rem 0;
  color: #666;
  font-size: 0.9rem;
}

.review-info .date {
  margin: 0.5rem 0 0 0;
  color: #999;
  font-size: 0.85rem;
}

/* Rating Display */
.review-rating {
  text-align: center;
}

.stars {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.rating-number {
  display: block;
  font-weight: bold;
  color: #333;
  font-size: 0.95rem;
}

/* Response Badge */
.response-badge {
  background: #dcfce7;
  color: #059669;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

/* Review Details */
.review-details {
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feedback-section,
.admin-response-section,
.awaiting-response {
  margin-bottom: 1.5rem;
}

.feedback-section h4,
.admin-response-section h4 {
  margin-top: 0;
  color: #333;
  font-size: 0.95rem;
  text-transform: uppercase;
  font-weight: 600;
  color: #666;
}

.admin-message {
  background: #f0f9ff;
  padding: 1rem;
  border-left: 3px solid #3b82f6;
  border-radius: 4px;
}

.admin-message p {
  margin: 0;
  line-height: 1.6;
}

.response-time {
  font-size: 0.85rem;
  color: #999;
  margin-top: 0.5rem !important;
}

.awaiting-response {
  background: #fef3c7;
  padding: 1rem;
  border-radius: 4px;
  color: #92400e;
}

/* Review Status */
.review-status {
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.review-status p {
  margin: 0;
  color: #666;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: #999;
}

/* Responsive */
@media (max-width: 640px) {
  .customer-portal {
    padding: 1rem;
  }
  
  .review-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .review-rating {
    text-align: left;
  }
  
  .review-status {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
}
```

---

## Features Summary

✅ **Customer View**
- See all appointments and associated reviews
- View review status (pending, responded, etc.)
- Read admin responses to feedback
- Mark reviews as viewed
- Generate shareable feedback links

✅ **Responsive Design**
- Mobile-friendly cards
- Expandable review details
- Filter by status (all, responded, pending)

✅ **Data Security**
- Customers only see their own reviews
- Time-limited share links (30 days)
- Full audit trail

