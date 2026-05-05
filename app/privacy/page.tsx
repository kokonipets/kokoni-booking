export const metadata = {
  title: 'Privacy Policy — Kokoni Pet Grooming Salon',
  description: 'Privacy policy for Kokoni Pet Grooming Salon.',
}

export default function PrivacyPolicy() {
  const updated = 'April 14, 2026'

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
        <h1 className="text-3xl font-bold text-sky-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {updated}</p>

        <section className="space-y-6 leading-relaxed">
          <p>
            Kokoni Pet Grooming Salon (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) respects your
            privacy. This Privacy Policy explains how we collect, use, and protect information when you book
            grooming services with us.
          </p>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">1. Information We Collect</h2>
            <p>We collect only the information needed to schedule and deliver grooming services, including:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Your name and phone number</li>
              <li>Your pet&rsquo;s name, breed, age, and grooming notes</li>
              <li>Appointment details (service, date, time)</li>
              <li>Optional vaccine and health notes you choose to share</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">2. How We Use Your Information</h2>
            <p>We use the information you provide to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Schedule, confirm, reschedule, and complete grooming appointments</li>
              <li>Send appointment reminders and ready-for-pickup notifications via SMS</li>
              <li>Communicate with you about your pet&rsquo;s visit</li>
              <li>Maintain records for safety and service quality</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">3. SMS Messaging</h2>
            <p>
              By providing your phone number and checking the consent box when booking, you agree to receive
              appointment-related text messages from Kokoni Pet Grooming Salon. Message frequency varies based on
              your appointments. Message &amp; data rates may apply.
            </p>
            <p className="mt-2">
              You can opt out at any time by replying <strong>STOP</strong> to any message. Reply{' '}
              <strong>HELP</strong> for help, or call us at (626) 621-4646.
            </p>
            <p className="mt-2">
              <strong>We do not share SMS opt-in data or phone numbers with third parties or affiliates for
              marketing purposes.</strong> Phone numbers collected for SMS are used solely to send
              appointment-related messages.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">4. Information Sharing</h2>
            <p>
              We do not sell, rent, or share your personal information with third parties for marketing
              purposes. We share information only with service providers that help us operate the business,
              such as:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Our SMS delivery provider (Twilio) — to send appointment text messages</li>
              <li>Our database provider (Supabase) — to securely store your appointment records</li>
              <li>Our hosting provider (Vercel) — to operate the booking website</li>
            </ul>
            <p className="mt-2">
              These providers are contractually required to protect your information and use it only to
              provide services to us.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">5. Data Security</h2>
            <p>
              We use industry-standard safeguards to protect your information. Data is transmitted over
              encrypted connections (HTTPS) and stored in secure databases with restricted access.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">6. Data Retention</h2>
            <p>
              We retain customer and appointment information for as long as needed to provide services and
              comply with our legal obligations. You may request deletion of your records at any time by
              contacting us.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Request access to the information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your information</li>
              <li>Opt out of SMS messages at any time by replying STOP</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">8. Children&rsquo;s Privacy</h2>
            <p>
              Our services are intended for adult pet owners. We do not knowingly collect information from
              children under 13.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The &ldquo;Last updated&rdquo; date at the
              top of this page will reflect any changes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">10. Contact Us</h2>
            <p>If you have questions about this Privacy Policy or your information, contact us:</p>
            <ul className="list-none pl-0 mt-2 space-y-1">
              <li><strong>Kokoni Pet Grooming Salon</strong></li>
              <li>Phone: (626) 621-4646</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  )
}
