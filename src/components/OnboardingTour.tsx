import { useState, useEffect } from "react";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const steps: Step[] = [
  {
    target: "body",
    content: "Welcome to BizDocs! Let's show you around so you can get started quickly.",
    placement: "center",
    disableBeacon: true,
    title: "Welcome! 🎉",
  },
  {
    target: "[data-sidebar]",
    content: "This is your navigation menu. All document types — Purchase Orders, Delivery Challans, Invoices, GRN, and Receipts — are accessible from here.",
    placement: "right",
    title: "Navigation Menu",
  },
  {
    target: '[href="/purchase-orders"]',
    content: "Start by creating your first Purchase Order. Click here, then 'New PO' to raise an order to your vendor.",
    placement: "right",
    title: "Purchase Orders",
  },
  {
    target: '[href="/settings"]',
    content: "Go to Settings to add your company logo, configure document preferences, and manage your financial year.",
    placement: "right",
    title: "Settings",
  },
  {
    target: '[href="/settings"]',
    content: "Did you know you can fully customise each document template? Add or remove fields, rename labels, reorder sections, add custom fields, and control exactly how your Invoice, Delivery Challan, and Purchase Order look — all from Settings > Templates.",
    placement: "right",
    title: "Customise Document Templates 🎨",
  },
  {
    target: ".grid.grid-cols-2",
    content: "Your dashboard shows live totals — open POs, pending DCs, unpaid invoices, and this month's billing.",
    placement: "bottom",
    title: "Dashboard Metrics",
  },
  {
    target: "body",
    content: "You're ready! Click any section to get started. You can replay this tour anytime from Settings.",
    placement: "center",
    title: "All Set! ✅",
  },
];

export function OnboardingTour() {
  const { user, profile } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (profile && (profile as any).tour_completed === false) {
      // Small delay so DOM is ready
      const timer = setTimeout(() => setRun(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [profile]);

  const handleCallback = async (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      if (user) {
        await (supabase as any).from("profiles").update({ tour_completed: true }).eq("id", user.id);
      }
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: "hsl(237 49% 35%)",
          zIndex: 10000,
          arrowColor: "hsl(0 0% 100%)",
          backgroundColor: "hsl(0 0% 100%)",
          textColor: "hsl(222 47% 11%)",
        },
        tooltipTitle: {
          fontSize: "1rem",
          fontWeight: 700,
        },
        buttonNext: {
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          padding: "0.5rem 1rem",
        },
        buttonSkip: {
          fontSize: "0.875rem",
        },
        buttonBack: {
          fontSize: "0.875rem",
        },
      }}
      locale={{
        back: "Back",
        close: "Close",
        last: "Done",
        next: "Next",
        skip: "Skip Tour",
      }}
    />
  );
}
