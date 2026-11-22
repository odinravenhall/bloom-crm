// Petits logos des plateformes (comme leurs icônes d'onglet) : OnlyFans (bleu) et MYM (carré noir).
// Dessinés en SVG ici : rien n'est chargé depuis leurs sites.

export type PlatformId = "of" | "mym";
export const platformOfName = (p?: string | null): PlatformId => (/mym/i.test(p || "") ? "mym" : "of");

export function OnlyFansLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="OnlyFans">
      <title>OnlyFans</title>
      <rect width="32" height="32" rx="8" fill="#ffffff" />
      {/* l'anneau (le « O ») et la pointe de la clé, comme l'icône d'OnlyFans */}
      <circle cx="13" cy="17" r="6.6" fill="none" stroke="#00AFF0" strokeWidth="3.6" />
      <path d="M17.2 9.4h8.6c-1 3.4-3.4 5.9-6.6 6.6 1.4-2.2 1.3-4.8-2-6.6Z" fill="#00AFF0" />
      <path d="M19.3 16.2c2.6-.4 4.4-1.7 5.4-3.4-.4 4.9-3.6 8.7-8.3 9.6 1.7-1.6 2.7-3.7 2.9-6.2Z" fill="#008CCF" />
    </svg>
  );
}

export function MymLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="MYM">
      <title>MYM</title>
      <rect width="32" height="32" rx="8" fill="#0b0b0b" />
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.25" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.5" />
      <text x="16" y="20" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="10.5" letterSpacing="-0.4" fill="#ffffff">
        MYM
      </text>
    </svg>
  );
}

/** Le logo de la plateforme d'une créatrice (« onlyfans », « mym »…). */
export function PlatformLogo({ platform, className = "size-4" }: { platform?: string | null; className?: string }) {
  return platformOfName(platform) === "mym" ? <MymLogo className={`shrink-0 ${className}`} /> : <OnlyFansLogo className={`shrink-0 ${className}`} />;
}
