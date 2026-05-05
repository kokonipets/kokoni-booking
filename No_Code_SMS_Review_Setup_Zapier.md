# No-Code Setup: Zapier + Twilio Review Automation

Perfect if you don't want to code! This uses **Zapier** to automate everything.

---

## Quick Overview

**Zapier will:**
1. Watch for completed appointments each evening
2. Send SMS asking for 1-5 rating
3. Capture responses and route them
4. Send review links OR request feedback

---

## Step-by-Step Setup

### Phase 1: Create Zapier Zaps

#### **Zap #1: Send Review Request SMS at 6 PM**

1. **Trigger**: Schedule (Daily at 6 PM)
   - In Zapier, search for "Schedule" → Create a new scheduled trigger
   - Set time: 6:00 PM daily

2. **Action 1**: Find completed appointments
   - App: Database (Google Sheets, Airtable, or your booking DB)
   - Find rows where:
     - `appointmentDate` = TODAY
     - `status` = "completed"
     - `reviewSmsSent` = FALSE

3. **Action 2**: Send SMS via Twilio
   - App: **Twilio**
   - Message body:
     ```
     Hi {{customerName}}! 🐱 Thanks for visiting us today! 
     How would you rate your experience? Reply with 1-5 
     (1=poor, 5=excellent)
     ```
   - To: `{{customerPhone}}`
   - From: Your Twilio number

4. **Action 3**: Mark as sent
   - Update your database: `reviewSmsSent = TRUE`

**Save this Zap** ✓

---

#### **Zap #2: Route Positive Reviews (4-5 stars)**

1. **Trigger**: Twilio SMS Received
   - App: **Twilio**
   - When message contains rating 4 or 5

2. **Filter**: Only process if rating is 4-5
   - If number ≥ 4 → Continue

3. **Action 1**: Send review links
   - App: **Twilio**
   - Message:
     ```
     Thank you! 🎉 Please share your experience:
     
     Google: https://search.google.com/local/writereview?placeid=YOUR_ID
     Yelp: https://www.yelp.com/biz/your-business
     ```

4. **Action 2**: Log to database (optional)
   - Update reviews table:
     - `rating = 5` (or received value)
     - `status = "positive"`
     - `reviewLinksSent = TRUE`

**Save this Zap** ✓

---

#### **Zap #3: Route Negative Reviews (1-3 stars)**

1. **Trigger**: Twilio SMS Received
   - When message contains rating 1-3

2. **Filter**: Only process if rating is 1-3
   - If number < 4 → Continue

3. **Action 1**: Send feedback request
   - App: **Twilio**
   - Message:
     ```
     We're sorry to hear that 😟 
     What could we have done better? Please reply.
     ```

4. **Action 2**: Store waiting for feedback
   - Update database: `status = "waiting_feedback"`

**Save this Zap** ✓

---

#### **Zap #4: Capture Feedback & Alert Admin**

1. **Trigger**: Twilio SMS Received
   - When customer replies with feedback (after previous message)

2. **Filter**: Check if status = "waiting_feedback"

3. **Action 1**: Save feedback
   - Update database:
     - `feedback = {{receivedMessage}}`
     - `status = "feedback_received"`

4. **Action 2**: Create admin alert (Google Sheets)
   - Create new row in "Alerts" sheet:
     ```
     Timestamp | Customer | Phone | Rating | Feedback
     2026-04-16 | John Doe | +1234567890 | 2 | "Service was slow" 
     ```

5. **Action 3**: Send admin SMS notification
   - App: **Twilio** (to your admin phone)
   - Message:
     ```
     ⚠️ NEGATIVE REVIEW from {{customerName}}
     Rating: {{rating}}
     Feedback: "{{feedback}}"
     ```

6. **Action 4**: Send admin email (optional)
   - App: **Gmail**
   - Subject: "🔴 Negative Review Alert"
   - Body: Include all details

**Save this Zap** ✓

---

## Setup Checklist

**Prerequisites:**
- [ ] Twilio account with Kokoni Booking phone number
- [ ] Zapier account (free plan works)
- [ ] Database/spreadsheet with your appointments (Google Sheets, Airtable, etc.)
- [ ] Google Business Place ID
- [ ] Yelp business URL

**Zapier Zaps to Create:**
- [ ] **Zap 1**: Daily 6 PM review request SMS
- [ ] **Zap 2**: Route 4-5 star reviews → send review links
- [ ] **Zap 3**: Route 1-3 star reviews → ask for feedback
- [ ] **Zap 4**: Capture feedback → notify admin + save to database

**Zapier Configuration:**
- [ ] Connect Twilio account
- [ ] Connect your database/Google Sheets
- [ ] Test each Zap with sample data
- [ ] Enable all Zaps

---

## Example Zapier Setup (Visual)

```
┌─────────────────────────────────────────────────────────┐
│           ZAP 1: SEND REVIEW REQUEST (6 PM)             │
├─────────────────────────────────────────────────────────┤
│ ⏰ Trigger: Schedule (Daily 6 PM)                        │
│    ↓                                                      │
│ 🔍 Action: Find today's completed appointments          │
│    ↓                                                      │
│ 📱 Action: Send SMS "Rate us 1-5"                       │
│    ↓                                                      │
│ 📝 Action: Mark reviewSmsSent = TRUE                    │
└─────────────────────────────────────────────────────────┘
                         ↓
                  Customer Replies
                         ↓
         ┌───────────────┴───────────────┐
         │                               │
    Rating 4-5                      Rating 1-3
         │                               │
         ↓                               ↓
   ┌──────────────┐              ┌─────────────────┐
   │ ZAP 2: SEND  │              │ ZAP 3: REQUEST  │
   │ REVIEW LINKS │              │ FEEDBACK        │
   └──────────────┘              └─────────────────┘
         │                               │
         ↓                               ↓
   Google/Yelp Links         "What could we improve?"
   Log to database                     │
                                       ↓
                            ┌──────────────────────┐
                            │ ZAP 4: FEEDBACK      │
                            │ + ADMIN ALERT        │
                            └──────────────────────┘
                                     ↓
                    Save feedback + Notify admin SMS/email
```

---

## Cost Breakdown

| Service | Cost |
|---------|------|
| **Zapier** | Free (up to 100 tasks/month), then $19/month |
| **Twilio SMS** | ~$0.0075 per message |
| **Google Sheets/Airtable** | Free |
| **Total** | ~$0-30/month depending on volume |

---

## Troubleshooting

**SMS not being received?**
- Check Twilio phone number is verified
- Verify webhook URL is correct in Twilio settings

**Zapier trigger not firing?**
- Check Zap is enabled (toggle switch)
- Test with "Test Zap" button

**Can't find completed appointments?**
- Make sure your database has clear `status` column
- Consider using Airtable for easier filtering

**Customer feedback not captured?**
- Add unique identifier in first SMS so responses are tracked
- Use Twilio SID to link conversations

---

## Advanced: Database Setup (Google Sheets)

Use this structure for easy tracking:

| appointmentId | customerName | customerPhone | appointmentDate | status | reviewSmsSent | rating | feedback | reviewLinkssSent | adminNotified |
|---|---|---|---|---|---|---|---|---|---|
| 1001 | John Doe | +1234567890 | 2026-04-16 | completed | TRUE | 5 | Love it! | TRUE | FALSE |
| 1002 | Jane Smith | +1987654321 | 2026-04-16 | completed | TRUE | 2 | Slow service | FALSE | TRUE |

---

## Going Deeper: Custom Zapier Paths

**Pro Tip**: Use Zapier's "Paths" feature to create branching logic:

1. Path 1: Rating ≥ 4 → Send review links
2. Path 2: Rating < 4 → Ask for feedback
3. Path 3: Feedback received → Alert admin

This keeps everything in one Zap instead of multiple ones!

---

## When to Switch to Custom Code

Consider building the Node.js solution if you need:
- ✅ Higher volume (1000+ SMS/month)
- ✅ Custom logic/integrations
- ✅ Real-time processing
- ✅ Lower costs
- ✅ More control

For now, **Zapier is your quick start!**

