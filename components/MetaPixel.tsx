'use client'

import Script from 'next/script'

// Meta (Facebook/Instagram) Pixel for Kokoni Pet Grooming — "Kokoni Pixel" dataset.
// Only rendered on the public booking pages (/book, /book-zh-tw, /book-zh-cn),
// never on staff pages (admin, cashier, kiosk, etc.).
export const META_PIXEL_ID = '2074787499890567'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

/** Send a standard Meta event, e.g. trackPixel('Schedule'). Safe to call if the pixel is blocked. */
export function trackPixel(event: string, params?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', event, params)
    }
  } catch {
    // ignore — tracking must never break booking
  }
}

export default function MetaPixel() {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
