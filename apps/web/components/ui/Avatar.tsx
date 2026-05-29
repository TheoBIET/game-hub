import { cn } from '@/lib/utils';

export type AvatarProps = {
  seed: string;
  /** Optional image source (data URI or absolute URL). Falls back to identicon. */
  src?: string | null;
  size?: number;
  className?: string;
};

// Procedural identicon-style avatar (no external dep) based on string hash.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTES: Array<[string, string]> = [
  ['#8b5cf6', '#d946ef'],
  ['#06b6d4', '#3b82f6'],
  ['#10b981', '#84cc16'],
  ['#f43f5e', '#f97316'],
  ['#f59e0b', '#eab308'],
  ['#ec4899', '#8b5cf6'],
  ['#22d3ee', '#a855f7'],
];

export function Avatar({ seed, src, size = 36, className }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn('inline-block rounded-full object-cover shadow-sm', className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  const h = hash(seed || 'x');
  const palette = PALETTES[h % PALETTES.length]!;
  const initial = seed.toUpperCase().slice(0, 1) || '?';
  const rotate = (h % 360) - 180;
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full font-bold text-white shadow-sm', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(${rotate}deg, ${palette[0]}, ${palette[1]})`,
        fontSize: size * 0.46,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
