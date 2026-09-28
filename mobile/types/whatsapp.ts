export type WhatsAppConnectionStatus = 'not_connected' | 'connecting' | 'connected' | 'error';

export type WhatsAppConnection = {
  status: WhatsAppConnectionStatus;
  /** Masked number the app is linked to, once connected. */
  maskedNumber?: string;
  connectedAt?: string;
  lastMessageAt?: string;
};
