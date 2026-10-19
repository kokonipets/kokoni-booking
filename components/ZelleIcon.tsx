// Zelle logo as an inline icon: sized in em so it scales with the surrounding text,
// like the emoji it replaces.
export default function ZelleIcon({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/zelle.png" alt="Zelle" className={className}
      style={{ display: 'inline-block', height: '1em', width: '1em', verticalAlign: '-0.12em', objectFit: 'contain' }} />
  )
}
