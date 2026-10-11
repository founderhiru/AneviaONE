import Link from 'next/link';

import { SIGN_IN } from '@/lib/config';

/**
 * The Sign In entry. Sign-in happens in the app, so by default this goes to
 * /download#sign-in, which explains how; a configured web sign-in URL
 * (NEXT_PUBLIC_SIGN_IN_URL) replaces it automatically.
 */
export function SignInLink({ className, onClick }: { className: string; onClick?: () => void }) {
  return SIGN_IN.external ? (
    <a href={SIGN_IN.href} className={className} onClick={onClick}>
      {SIGN_IN.label}
    </a>
  ) : (
    <Link href={SIGN_IN.href} className={className} onClick={onClick}>
      {SIGN_IN.label}
    </Link>
  );
}
