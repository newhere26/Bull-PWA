import type { ReactNode } from 'react';

export const AVATAR_IDS = ['leaf', 'sun', 'wave', 'pebble', 'star'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export const DEFAULT_AVATAR: AvatarId = 'leaf';

type Art = { bg: string; label: string; body: ReactNode };

const ART: Record<AvatarId, Art> = {
  leaf: {
    bg: '#D8E0CF',
    label: 'Leaf',
    body: <>
      <path d="M24 8C15 14 12 24 13 34c10 1 20-2 24-11 2-5 1-10-2-13-3 4-7 6-11 6 2-3 1-6 0-8z" fill="#41615D" />
      <path d="M16 32C21 27 26 22 33 17" stroke="#D8E0CF" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>,
  },
  sun: {
    bg: '#E9B979',
    label: 'Sun',
    body: <>
      <circle cx="24" cy="24" r="9" fill="#B85642" />
      <g stroke="#B85642" strokeWidth="2.4" strokeLinecap="round">
        <path d="M24 8v4M24 36v4M8 24h4M36 24h4M13 13l2.8 2.8M32.2 32.2L35 35M35 13l-2.8 2.8M15.8 32.2L13 35" />
      </g>
    </>,
  },
  wave: {
    bg: '#D7DCE5',
    label: 'Wave',
    body: <>
      <path d="M6 22c4-5 8-5 12 0s8 5 12 0 8-5 12 0" stroke="#52706A" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M6 31c4-5 8-5 12 0s8 5 12 0 8-5 12 0" stroke="#52706A" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
    </>,
  },
  pebble: {
    bg: '#DDD8CC',
    label: 'Pebble',
    body: <>
      <ellipse cx="24" cy="26" rx="12" ry="9" fill="#6D817B" />
      <ellipse cx="19" cy="23" rx="4" ry="2.6" fill="#DDD8CC" opacity="0.7" />
      <circle cx="33" cy="15" r="3.4" fill="#6D817B" opacity="0.6" />
    </>,
  },
  star: {
    bg: '#F0D5C7',
    label: 'Star',
    body: <>
      <path d="M24 9l3.4 7.2 7.9.9-5.8 5.4 1.5 7.8-7-3.9-7 3.9 1.5-7.8L12.7 17l7.9-.9z" fill="#B85642" strokeLinejoin="round" />
    </>,
  },
};

function normalize(id?: string | null): AvatarId {
  return AVATAR_IDS.includes(id as AvatarId) ? (id as AvatarId) : DEFAULT_AVATAR;
}

export function AvatarArt({ id, size = 32, testId }: {
  id?: string | null; size?: number; testId?: string;
}) {
  const art = ART[normalize(id)];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: art.bg }}
      data-testid={testId}
      role="img"
      aria-label={`${art.label} avatar`}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
        {art.body}
      </svg>
    </span>
  );
}

export function AvatarPicker({ value, onPick }: {
  value?: string | null; onPick: (id: AvatarId) => void;
}) {
  const current = normalize(value);
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Choose your look">
      {AVATAR_IDS.map(a => {
        const selected = a === current;
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(a)}
            className={`rounded-full transition-all duration-200 ${selected ? 'ring-2 ring-[#DD765D] ring-offset-2 ring-offset-transparent scale-105' : 'opacity-80 hover:opacity-100 hover:scale-105'}`}
            data-testid={`button-avatar-${a}`}
          >
            <AvatarArt id={a} size={48} />
          </button>
        );
      })}
    </div>
  );
}
