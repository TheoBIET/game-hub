'use client';

import { SocialBootstrap } from './SocialBootstrap';
import { FriendsDock } from './FriendsDock';

/**
 * Single mount point for the global social layer: opens the presence socket
 * (everyone, so the online count works for guests too) and renders the
 * authenticated friends dock. Lives in the root layout so it follows the
 * user across pages, including game rooms (`/r/[code]`) that don't render
 * HubNav themselves.
 */
export function SocialOverlay({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <>
      <SocialBootstrap isAuthenticated={isAuthenticated} />
      {isAuthenticated && <FriendsDock />}
    </>
  );
}
