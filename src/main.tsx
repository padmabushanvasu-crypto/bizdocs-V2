import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// NOTE: After deploying, add VITE_SENTRY_DSN to Vercel:
//   Project → Settings → Environment Variables → VITE_SENTRY_DSN (Production)

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,

  // Only run in production — not during development
  enabled: import.meta.env.PROD,

  // Environment tag
  environment: import.meta.env.MODE,

  // Capture 100% of errors
  tracesSampleRate: 1.0,

  // Do not send PII like IP addresses
  sendDefaultPii: false,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      // Record 10% of sessions normally
      sessionSampleRate: 0.1,
      // Record 100% of sessions with errors
      errorSampleRate: 1.0,
    }),
  ],
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
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
