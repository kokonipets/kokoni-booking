export const metadata = {
  title: 'Terms of Service — Kokoni Pet Grooming Salon',
  description: 'Terms of service for Kokoni Pet Grooming Salon.',
}

export default function TermsOfService() {
  const updated = 'April 14, 2026'

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
        <h1 className="text-3xl font-bold text-sky-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {updated}</p>

        <section className="space-y-6 leading-relaxed">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of services provided by Kokoni Pet
            Grooming Salon (&ldquo;Kokoni,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
            By booking an appointment or using our services, you agree to these Terms.
          </p>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Disclosure of Information</h2>
            <p>
              Grooming can be stressful for a pet and infrequent grooming can be very traumatic for your pet.
              It is imperative that you share any known health issues, recent vet visits, or history of groom
              issues so your stylist can watch for warning signs of trouble.
            </p>
            <p className="mt-2">
              If you fail to disclose information about any allergies and/or skin conditions, Kokoni will
              not be held responsible for any irritation, patchiness, abrasions, or hair loss that may arise
              due to the grooming process.
            </p>
            <p className="mt-2">
              If you fail to disclose information regarding any physical and/or medical conditions (such as
              elbow or hip dysplasia, epilepsy, etc.), Kokoni will not be held responsible for any injury
              incurred during the grooming process.
            </p>
            <p className="mt-2">
              The client agrees that Kokoni, its owners and operators are not liable for any pre-existing
              conditions and problems found during grooming, and the pet owner agrees to pay for all medical
              treatment incurred due to such.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Fleas &amp; Ticks</h2>
            <p>
              If fleas and/or ticks are found on your pet during the process, treatment to remove your
              pet&rsquo;s fleas and/or ticks is mandatory, and an additional charge will apply at the
              owner&rsquo;s cost.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Matted Coat &amp; De-Matting</h2>
            <p>
              A &ldquo;Dematting Fee&rdquo; will apply to all matted pets. Removing a heavily matted coat
              includes risks of nicks, cuts, or abrasions. As the pet&rsquo;s owner, you agree that Kokoni
              shall not be held liable for any cuts/nicks/grazes or any post-groom effects caused by removing
              a matted/neglected coat.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Aggressive Pets</h2>
            <p>
              Owner must inform your stylist if your pet(s) may bite, have bitten, or show signs of
              aggression. A handling fee may be applied for aggressive or difficult-to-groom pets. Kokoni
              reserves the right to refuse or stop services at any time.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Late Pick Up</h2>
            <p>
              There will be a late pick-up charge of $25 every 30 minutes if your pet is not picked up before
              our closing time of 5:00pm.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">No-Shows &amp; Cancellations</h2>
            <p>
              No-shows and multiple last-minute cancellations are subject to a $30 no-show charge fee (per
              pet). Please give us 24 hours notice. Prepayment may be required before another appointment is
              booked.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Vaccinations</h2>
            <p>
              All pets must be up to date on all vaccinations including Rabies and either Distemper or Parvo
              Virus. You may upload records directly in the booking form, or email them to{' '}
              <a href="mailto:kokonipets@gmail.com" className="text-sky-700 underline">
                kokonipets@gmail.com
              </a>
              .
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Visual Release and Use</h2>
            <p>
              All images, photos, and videos of the pet(s), taken during the stay in-store or during
              grooming, as well as their names, can be used by the Store in any form or format, for use in
              any media, marketing, advertising, or promotional materials.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">SMS Messaging</h2>
            <p>
              You may <strong>optionally</strong> consent during booking to receive appointment-related
              text messages from Kokoni Pet Grooming Salon, including confirmations, reminders, and
              ready-for-pickup notifications. Consent to receive text messages is <strong>not</strong> required
              to book an appointment or use our services. Message frequency varies (approximately 2–5
              messages per booking). Message &amp; data rates may apply. Reply <strong>STOP</strong> to
              opt out at any time, or <strong>HELP</strong> for help. See our{' '}
              <a href="/privacy" className="text-sky-700 underline">
                Privacy Policy
              </a>{' '}
              for details on how we handle your phone number.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date at the top of
              this page will reflect any changes. Continued use of our services after changes constitutes
              acceptance of the updated Terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-sky-900 mb-2">Contact</h2>
            <p>If you have questions about these Terms, contact us:</p>
            <ul className="list-none pl-0 mt-2 space-y-1">
              <li><strong>Kokoni Pet Grooming Salon</strong></li>
              <li>Phone: (949) 508-9155</li>
              <li>
                Email:{' '}
                <a href="mailto:kokonipets@gmail.com" className="text-sky-700 underline">
                  kokonipets@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  )
}
