import Constants from 'expo-constants';

import type { WhatsAppConnection } from '../../types';
import type { ConnectWhatsAppResult, WhatsAppService } from './whatsappTypes';

type WhatsAppExtra = { whatsappBusinessConfigured?: boolean };
const extra = (Constants.expoConfig?.extra ?? {}) as WhatsAppExtra;

/** True only once real Meta/WhatsApp Business credentials + backend
 * endpoint are wired up (set via app config `extra.whatsappBusinessConfigured`,
 * never hard-coded true). Until then this stays false and the mock
 * in-memory implementation below powers the full UX. */
const PRODUCTION_READY = Boolean(extra.whatsappBusinessConfigured);

let state: WhatsAppConnection = { status: 'not_connected' };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function maskMobileNumber(mobileNumber: string): string {
  const digits = mobileNumber.replace(/\D/g, '');
  if (digits.length < 4) return mobileNumber;
  return `+${digits.slice(0, digits.length - 8)} ${'x'.repeat(Math.max(digits.length - 12, 0))}${digits.slice(-4)}`;
}

/**
 * Mock/UI-only WhatsApp service. Real production behavior (actually
 * sending a Meta WhatsApp Business API verification message, actually
 * receiving inbound messages) requires credentials this project does not
 * yet have — see `docs/WHATSAPP_ARCHITECTURE.md` for the exact seam to
 * fill in (`services/whatsapp/productionWhatsappService.ts`, not yet
 * created). This module never claims a successful connection unless the
 * founder-visible screen also says "preview" while `isProductionReady()`
 * is false.
 */
export const whatsappService: WhatsAppService = {
  async getConnectionStatus() {
    return state;
  },
  async connect(mobileNumber: string): Promise<ConnectWhatsAppResult> {
    if (mobileNumber.replace(/\D/g, '').length < 10) {
      return { success: false, errorMessage: 'Enter a valid mobile number to connect.' };
    }
    state = { status: 'connecting' };
    await delay(900);
    state = {
      status: 'connected',
      maskedNumber: maskMobileNumber(mobileNumber),
      connectedAt: new Date().toISOString(),
    };
    return { success: true, connection: state };
  },
  async disconnect() {
    state = { status: 'not_connected' };
  },
  isProductionReady() {
    return PRODUCTION_READY;
  },
};
