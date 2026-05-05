# SMS Review Automation System for Kokoni Booking

## Overview
Automated SMS workflow that collects customer reviews and routes them:
- **4-5 stars** → Auto-send Google/Yelp review links
- **1-3 stars** → Request feedback → Alert admin

---

## System Architecture

```
Appointment Completes
         ↓
   Wait until Evening (6 PM)
         ↓
  Send Review Request SMS
         ↓
Customer Replies with Rating
         ↓
         ├─ Rating: 4-5 → Send Review Links (Google/Yelp)
         │
         └─ Rating: 1-3 → Ask for Feedback → Notify Admin Panel
```

---

## Implementation: Node.js + Twilio (Recommended)

This approach works as a **scheduled service** that runs periodically to check for completed appointments.

### Step 1: Setup & Dependencies

```bash
npm install twilio dotenv express
```

### Step 2: Environment Variables (.env)

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ADMIN_PHONE=+1234567890
DATABASE_URL=your_db_connection_string
```

### Step 3: Core Implementation

**File: reviewAutomation.js**

```javascript
const twilio = require('twilio');
require('dotenv').config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Step 1: Find completed appointments from today that need review SMS
async function sendReviewRequests() {
  try {
    const completedAppointments = await getCompletedAppointmentsToday();
    
    for (const appointment of completedAppointments) {
      // Check if SMS already sent today
      if (appointment.reviewSmsStatus !== 'sent') {
        await sendReviewSMS(appointment);
      }
    }
  } catch (error) {
    console.error('Error sending review requests:', error);
  }
}

// Step 2: Send initial review request SMS
async function sendReviewSMS(appointment) {
  const message = `Hi ${appointment.customerName}! 🐱 Thanks for visiting us today! How would you rate your experience? Reply with a number (1-5) where 1 is poor and 5 is excellent.`;
  
  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: appointment.customerPhone,
      // Twilio webhook will capture the response
    });
    
    // Mark SMS as sent in database
    await updateAppointmentStatus(appointment.id, { reviewSmsStatus: 'sent' });
    console.log(`Review SMS sent to ${appointment.customerPhone}`);
  } catch (error) {
    console.error(`Failed to send SMS to ${appointment.customerPhone}:`, error);
  }
}

// Step 3: Handle incoming SMS responses (Webhook)
async function handleReviewResponse(message) {
  const customerPhone = message.From;
  const ratingText = message.Body.trim();
  const rating = parseInt(ratingText);
  
  // Validate rating
  if (isNaN(rating) || rating < 1 || rating > 5) {
    await sendInvalidRatingMessage(customerPhone);
    return;
  }
  
  const appointment = await getAppointmentByPhone(customerPhone);
  
  if (rating >= 4) {
    // POSITIVE REVIEW: Send review links
    await sendReviewLinks(appointment, customerPhone);
  } else {
    // NEGATIVE REVIEW: Ask for feedback
    await askForFeedback(appointment, customerPhone);
  }
}

// Step 4: Send review links for positive reviews
async function sendReviewLinks(appointment, customerPhone) {
  const reviewMessage = `Thank you for the positive feedback! 🎉 We'd love if you could share your experience:\n\nGoogle Reviews: https://search.google.com/local/writereview?placeid=YOUR_GOOGLE_PLACE_ID\n\nYelp: https://www.yelp.com/biz/your-business-name?sort_by=date_desc`;
  
  try {
    await client.messages.create({
      body: reviewMessage,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: customerPhone,
    });
    
    await updateReviewRecord(appointment.id, {
      rating: parseInt(message.Body),
      status: 'positive',
      reviewLinkssSent: true,
    });
  } catch (error) {
    console.error('Error sending review links:', error);
  }
}

// Step 5: Request feedback for negative reviews
async function askForFeedback(appointment, customerPhone) {
  const feedbackMessage = `We're sorry to hear that! 😟 We'd like to make it right. What could we have done better? (Reply with your feedback)`;
  
  try {
    await client.messages.create({
      body: feedbackMessage,
      from: process.process.TWILIO_PHONE_NUMBER,
      to: customerPhone,
    });
    
    // Store that we're waiting for feedback
    await updateReviewRecord(appointment.id, {
      rating: parseInt(message.Body),
      status: 'waiting_feedback',
    });
  } catch (error) {
    console.error('Error requesting feedback:', error);
  }
}

// Step 6: Handle feedback response and notify admin
async function handleFeedbackResponse(message) {
  const customerPhone = message.From;
  const feedback = message.Body;
  const appointment = await getAppointmentByPhone(customerPhone);
  
  try {
    // Save feedback to database
    await updateReviewRecord(appointment.id, {
      feedback: feedback,
      status: 'feedback_received',
      feedbackReceivedAt: new Date(),
    });
    
    // Send confirmation to customer
    await client.messages.create({
      body: `Thank you for your feedback. Our team will review this and follow up with you shortly.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: customerPhone,
    });
    
    // Notify admin
    await notifyAdminOfNegativeReview(appointment, feedback);
    
  } catch (error) {
    console.error('Error handling feedback:', error);
  }
}

// Step 7: Notify admin of negative review
async function notifyAdminOfNegativeReview(appointment, feedback) {
  const adminMessage = `⚠️ NEGATIVE REVIEW ALERT\n\nCustomer: ${appointment.customerName}\nPhone: ${appointment.customerPhone}\nRating: 1-3⭐\nFeedback: "${feedback}"\nDate: ${new Date().toLocaleString()}`;
  
  try {
    await client.messages.create({
      body: adminMessage,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.ADMIN_PHONE,
    });
    
    // Also add to admin dashboard
    await createAdminAlert({
      type: 'negative_review',
      appointmentId: appointment.id,
      customerName: appointment.customerName,
      rating: 1-3,
      feedback: feedback,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
}

module.exports = {
  sendReviewRequests,
  handleReviewResponse,
  handleFeedbackResponse,
};
```

### Step 4: Express Server Setup (for Twilio Webhooks)

**File: server.js**

```javascript
const express = require('express');
const twilio = require('twilio');
const { handleReviewResponse, handleFeedbackResponse } = require('./reviewAutomation');

const app = express();
app.use(express.urlencoded({ extended: false }));

// Twilio Webhook: Incoming SMS
app.post('/sms-webhook', async (req, res) => {
  const message = req.body;
  
  // Check if this is a feedback response or initial rating
  const appointment = await getAppointmentByPhone(message.From);
  
  if (appointment.reviewStatus === 'waiting_feedback') {
    await handleFeedbackResponse(message);
  } else {
    await handleReviewResponse(message);
  }
  
  res.send(''); // Twilio expects empty response
});

app.listen(3000, () => {
  console.log('SMS webhook server running on port 3000');
});
```

### Step 5: Database Schema

```sql
-- Reviews table to track responses
CREATE TABLE reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  appointmentId INT NOT NULL,
  customerPhone VARCHAR(20),
  initialRating INT,
  feedback TEXT,
  status ENUM('pending', 'positive', 'waiting_feedback', 'feedback_received', 'admin_notified'),
  reviewLinksSent BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (appointmentId) REFERENCES appointments(id)
);

-- Update appointments table
ALTER TABLE appointments ADD COLUMN reviewSmsStatus VARCHAR(20) DEFAULT 'pending';
```

### Step 6: Scheduling (Run Evening SMS Check)

Use **node-cron** to run daily at 6 PM:

```bash
npm install node-cron
```

**File: scheduler.js**

```javascript
const cron = require('node-cron');
const { sendReviewRequests } = require('./reviewAutomation');

// Run every day at 6 PM
cron.schedule('0 18 * * *', async () => {
  console.log('Running evening review SMS batch...');
  await sendReviewRequests();
});
```

---

## Setup Checklist

- [ ] Create Twilio account and get credentials
- [ ] Install Node.js dependencies
- [ ] Set up .env file with Twilio credentials
- [ ] Create database tables (reviews table)
- [ ] Get your Google Business Place ID and Yelp business URL
- [ ] Deploy Express server with webhook endpoint
- [ ] Configure Twilio webhook to point to your `/sms-webhook` endpoint
- [ ] Test with a sample appointment
- [ ] Set up daily scheduler (cron job)

---

## Testing Locally

1. Use **ngrok** to expose local server:
   ```bash
   ngrok http 3000
   ```

2. Add ngrok URL to Twilio webhook:
   ```
   https://your-ngrok-url.ngrok.io/sms-webhook
   ```

3. Send test SMS to your Twilio number and verify response

---

## Alternative: Simpler Approach (No Code)

If you want **without coding**, use:
- **Zapier** + Twilio integration (workflow automation)
- **Make.com** (formerly Integromat)
- **IFTTT** + webhooks

These tools can trigger SMS and route based on responses without coding.

---

## Google/Yelp Review Links

Replace these with your actual URLs:
- **Google**: Find your Place ID at google.com/business
- **Yelp**: Your business page URL (ends with /biz/your-business)

