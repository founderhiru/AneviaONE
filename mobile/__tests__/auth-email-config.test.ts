/**
 * The emailed sign-in code must be exactly as long as the app's code screen
 * expects. Production once drifted to 8 digits while the app takes 6, so a
 * delivered code could never be entered. supabase/config.toml declares the
 * project's length; this keeps the two in step.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { OTP_LENGTH } from '../components/OtpInput';

function declaredOtpLength(): number | null {
  const toml = readFileSync(join(__dirname, '../../supabase/config.toml'), 'utf8');
  const section = /^\[auth\.email\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(toml)?.[1] ?? '';
  const match = /^\s*otp_length\s*=\s*(\d+)\s*$/m.exec(section);
  return match ? Number(match[1]) : null;
}

describe('email sign-in code length', () => {
  it('the project config declares the emailed code length', () => {
    expect(declaredOtpLength()).not.toBeNull();
  });

  it('matches the length the app’s code screen accepts', () => {
    expect(declaredOtpLength()).toBe(OTP_LENGTH);
  });
});
