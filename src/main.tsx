import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// NOTE: After deploying, add VITE_SENTRY_DSN to Vercel:
//   Project → Settings → Environment Variables → VITE_SENTRY_DSN (Production)

const sensitiveKeys = [
  'gstin', 'pan', 'bank_account_number',
  'bank_ifsc', 'bank_name', 'account_number',
  'ifsc', 'unit_price', 'standard_cost',
  'amount_paid', 'payment_reference', 'utr',
  'processing_charges', 'phone', 'phone1',
  'phone2', 'email', 'password', 'token',
  'access_token', 'auth_token', 'apikey',
  'api_key', 'secret', 'delivery_contact_phone',
  'bank_details', 'amount', 'total_amount',
  'taxable_amount', 'cgst_amount', 'sgst_amount',
  'igst_amount', 'reorder_point',
  'production_batch_size', 'min_stock',
  'serial_number', 'drawing_revision',
  'company_id', 'vendor_id', 'party_id',
];

const scrubObject = (obj: unknown): unknown => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));
    scrubbed[key] = isSensitive ? '[REDACTED]' : scrubObject(value);
  }
  return scrubbed;
};

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: false,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      // Block all input fields from being recorded
      maskAllInputs: true,
      maskAllText: false,
      blockAllMedia: false,
      // Block specific sensitive elements
      block: [
        '[data-sensitive]',
        '[name="gstin"]',
        '[name="pan"]',
        '[name="bank_account"]',
        '[name="bank_ifsc"]',
        '[name="unit_price"]',
        '[name="standard_cost"]',
        '[name="payment_reference"]',
        '[name="amount_paid"]',
        '[name="phone"]',
        '[name="email"]',
      ],
    }),
  ],

  // Scrub sensitive data from all events before sending
  beforeSend(event) {
    if (event.request) {
      if (event.request.data) {
        event.request.data = scrubObject(event.request.data);
      }
      if (event.request.headers) {
        event.request.headers = scrubObject(event.request.headers) as Record<string, string>;
      }
      delete event.request.cookies;
    }

    if (event.extra) {
      event.extra = scrubObject(event.extra) as Record<string, unknown>;
    }

    if (event.breadcrumbs?.values) {
      event.breadcrumbs.values = event.breadcrumbs.values.map(breadcrumb => ({
        ...breadcrumb,
        data: scrubObject(breadcrumb.data) as Record<string, unknown>,
        message: breadcrumb.message?.includes('@')
          ? '[REDACTED EMAIL]'
          : breadcrumb.message,
      }));
    }

    // Keep only anonymised user ID — no email or PII
    if (event.user) {
      event.user = { id: event.user.id };
    }

    return event;
  },

  // Scrub sensitive data from transactions
  beforeSendTransaction(event) {
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        url.search = '';
        event.request.url = url.toString();
      } catch {
        // ignore malformed URLs
      }
    }
    return event;
  },
});

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={({ resetError }) => (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-slate-800 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Our team has been notified and is working on a fix. Please try again.
          </p>
          <button
            onClick={resetError}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    )}
  >
    <App />
  </Sentry.ErrorBoundary>
);
