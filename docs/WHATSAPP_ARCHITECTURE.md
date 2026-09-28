# WhatsApp Architecture

Per explicit product direction: **WhatsApp is not a day-one production
integration.** This app builds the entire UX and service abstraction now,
so a real Meta/WhatsApp Business connection can be plugged in later
without redesigning anything — but it does not call any real WhatsApp
Business API, and it never claims to.

## What exists today

- `app/whatsapp/index.tsx` — the full Connect WhatsApp screen: connection
  status, what WhatsApp can/can't do, a mobile-number input, connect/
  disconnect actions.
- `app/add/index.tsx` — "Send via WhatsApp" is one of the three Add Record
  entry points (alongside camera and upload) and routes to `/whatsapp`.
- `services/whatsapp/whatsappTypes.ts` — the `WhatsAppService` interface
  every screen depends on.
- `services/whatsapp/whatsappService.ts` — the only implementation that
  exists right now: an in-memory mock. It simulates connect/disconnect
  timing and state, and masks the phone number the same way the mock auth
  service does, but never sends a real message, never verifies a real
  WhatsApp Business number, and never receives anything.

## The seam for a real implementation

`WhatsAppService` is the contract a real implementation must satisfy:

```ts
export interface WhatsAppService {
  getConnectionStatus(): Promise<WhatsAppConnection>;
  connect(mobileNumber: string): Promise<ConnectWhatsAppResult>;
  disconnect(): Promise<void>;
  isProductionReady(): boolean;
}
```

To plug in real Meta/WhatsApp Business credentials later:

1. Create `services/whatsapp/productionWhatsappService.ts` implementing
   `WhatsAppService` against your backend endpoint (this app never talks
   to Meta's API directly from the client — a backend is required to hold
   the WhatsApp Business API token and handle webhook verification).
2. Set `extra.whatsappBusinessConfigured: true` in `app.json`/EAS config
   once that backend endpoint is actually live and credentialed. This is
   the **only** flag `isProductionReady()` reads
   (`services/whatsapp/whatsappService.ts`); it is never hard-coded `true`.
3. Select the real implementation the same way auth does it:
   ```ts
   export const whatsappService: WhatsAppService = isWhatsAppProductionConfigured
     ? productionWhatsappService
     : mockWhatsappService;
   ```
   (Today's file exports the mock directly under the name
   `whatsappService`; introducing this selector is the one code change
   needed — no screen changes.)
4. No screen changes. `app/whatsapp/index.tsx` and `app/add/index.tsx`
   already call only `whatsappService.*` and already read
   `isProductionReady()` to decide whether to show the "Preview only" notice.

## What the backend endpoint needs to do (not built here)

- Verify a WhatsApp Business number ownership flow and report
  `connect()`'s result back to the app (connected / needs verification /
  failed).
- Receive inbound WhatsApp messages/media via Meta's webhook, run them
  through the same document-processing pipeline `DocumentsService` already
  models (`services/documents/documentsService.ts`), and update the
  person's Health Memory — i.e. WhatsApp becomes another `DocumentSource`
  alongside `'camera'` and `'upload'` (see `types/document.ts`).
- Send **generic** outbound notifications only (e.g. "Your health report
  has been processed." with an "Open in app" action) — never health
  details in the notification body. This constraint is already stated in
  the Connect WhatsApp screen's copy and should be enforced server-side
  too.

## What is explicitly out of scope until credentials exist

- Any real network call to Meta's Graph API / WhatsApp Business Platform.
- Any webhook receiver.
- Any claim in the UI that a message was actually sent or received — the
  mock's "Connected" state is honest about being a preview
  (`isProductionReady()` gates the warning banner shown on the Connect
  screen).
- Rate limiting, template-message approval, and the other WhatsApp
  Business Platform operational concerns — these belong to the backend
  endpoint mentioned above, once it exists.
