// Venmo logo as an inline icon: sized in em so it scales with the surrounding text,
// like the emoji it replaces.
export default function VenmoIcon({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/venmo.png" alt="Venmo" className={className}
      style={{ display: 'inline-block', height: '1em', width: '1em', verticalAlign: '-0.12em', objectFit: 'contain', borderRadius: '0.2em' }} />
  )
}
