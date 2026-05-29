'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, User, Lightbulb, Settings, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

type UserMenuLabels = {
  menu: string;
  profile: string;
  ideas: string;
  settings: string;
  signout: string;
};

type UserMenuProps = {
  nickname: string;
  slug: string | null;
  avatar: string | null;
  signOutAction: () => Promise<void>;
  labels: UserMenuLabels;
};

export function UserMenu({ nickname, slug, avatar, signOutAction, labels }: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const seed = slug || nickname;
  const profileHref = slug ? `/profile/${slug}` : '/profile';

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Move focus into the menu when it opens.
  React.useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
    next?.focus();
  }

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[color:var(--color-fg)] transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-2 text-sm transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]"
      >
        <Avatar seed={seed} src={avatar} size={28} />
        <span className="hidden max-w-[10rem] truncate font-medium sm:inline">{nickname}</span>
        <ChevronDown
          size={16}
          className={cn(
            'text-[color:var(--color-fg-muted)] transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={labels.menu}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-white/10 bg-[color:var(--color-bg-800)] p-1.5 shadow-[var(--shadow-card)] backdrop-blur-xl"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{nickname}</p>
            {slug && (
              <p className="truncate text-xs text-[color:var(--color-fg-muted)]">@{slug}</p>
            )}
          </div>
          <div className="my-1 h-px bg-white/10" />

          <Link href={profileHref} role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <User size={16} className="text-[color:var(--color-fg-muted)]" aria-hidden="true" />
            {labels.profile}
          </Link>
          <Link href="/ideas" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <Lightbulb size={16} className="text-[color:var(--color-fg-muted)]" aria-hidden="true" />
            {labels.ideas}
          </Link>
          <Link href="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <Settings size={16} className="text-[color:var(--color-fg-muted)]" aria-hidden="true" />
            {labels.settings}
          </Link>

          <div className="my-1 h-px bg-white/10" />

          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className={cn(itemClass, 'text-[color:var(--color-danger-500)] hover:bg-rose-500/10')}
            >
              <LogOut size={16} aria-hidden="true" />
              {labels.signout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
