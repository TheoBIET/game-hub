import Link from 'next/link';
import { Github } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LogoMark } from '@/components/hub/Logo';

const REPO_URL = 'https://github.com/theobiet/tabswitch';

export async function SiteFooter() {
  const t = await getTranslations('footer');
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 mt-auto border-t border-white/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm sm:flex-row">
        <div className="flex items-center gap-2 text-[color:var(--color-fg-muted)]">
          <LogoMark size={20} />
          <span>
            <span className="font-display font-bold text-[color:var(--color-fg)]">TabSwitch</span>{' '}
            · © {year} · {t('tagline')}
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-lg px-2.5 py-1.5 text-[color:var(--color-fg-muted)] transition-colors hover:bg-white/5 hover:text-white"
          >
            {t('home')}
          </Link>
          <Link
            href="/ideas"
            className="rounded-lg px-2.5 py-1.5 text-[color:var(--color-fg-muted)] transition-colors hover:bg-white/5 hover:text-white"
          >
            {t('ideas')}
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[color:var(--color-fg-muted)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <Github size={15} aria-hidden="true" />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
