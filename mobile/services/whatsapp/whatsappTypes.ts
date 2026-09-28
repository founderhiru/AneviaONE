import type { WhatsAppConnection } from '../../types';

export type ConnectWhatsAppResult =
  | { success: true; connection: WhatsAppConnection }
  | { success: false; errorMessage: string };

/**
 * WhatsApp service boundary. UI components (`app/whatsapp/*`) call only
 * this interface — never a WhatsApp Business provider SDK directly — so
 * real Meta/WhatsApp Business credentials can be plugged into a new
 * implementation later without any screen changing. See
 * `docs/WHATSAPP_ARCHITECTURE.md`.
 */
export interface WhatsAppService {
  getConnectionStatus(): Promise<WhatsAppConnection>;
  connect(mobileNumber: string): Promise<ConnectWhatsAppResult>;
  disconnect(): Promise<void>;
  /** Whether a real WhatsApp Business backend is configured. When false,
   * the Connect screen still shows the full UX but is explicit that this
   * is a preview, per "not a day-one production integration". */
  isProductionReady(): boolean;
}
