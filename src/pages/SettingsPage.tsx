import { useNavigate } from "react-router-dom";
import { Building2, FileText, Bell, Upload, FileSpreadsheet, Users, History, BookOpen, ChevronRight, AlertTriangle, Receipt, Cog, Wrench, UserCheck, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchProcessCodesCount } from "@/lib/process-library-api";

interface SettingsCard {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  action: () => void;
  badge?: string;
}

export default function SettingsPage() {
  const navigate = useNavigate();

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });

  const { data: processCodesCount = 0 } = useQuery({
    queryKey: ["count", "process_codes"],
    queryFn: fetchProcessCodesCount,
  });

  const isNotConfigured = !companySettings?.gstin ||
    !companySettings?.company_name ||
    companySettings.company_name === "My Company";

  const cards: SettingsCard[] = [
    {
      icon: Building2,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Company Profile",
      description: "Name, address, GSTIN, state code, PAN and company logo",
      action: () => navigate("/settings/company"),
    },
    {
      icon: FileText,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Document Settings",
      description: "Invoice, PO, DC, GRN number series. Financial year.",
      action: () => navigate("/settings/documents"),
    },
    {
      icon: Bell,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      title: "Notifications",
      description: "Daily stock alerts and weekly business summary — recipients and schedule",
      action: () => navigate("/settings/notifications"),
    },
    {
      icon: Upload,
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
      title: "Data Import",
      description: "Import items, parties, BOM, opening stock and reorder rules from Excel templates",
      action: () => navigate("/settings/import"),
    },
    {
      icon: FileSpreadsheet,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "GST Reports",
      description: "Download GSTR-1, GSTR-2, HSN Summary, ITC Register and more",
      action: () => navigate("/gst-reports"),
    },
    {
      icon: History,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      title: "Audit Log",
      description: "Full history of all actions taken across documents — who did what and when",
      action: () => navigate("/audit-log"),
    },
    {
      icon: BookOpen,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "How to Use BizDocs",
      description: "Step-by-step guide — what to do first, what comes after, and when to use each feature",
      action: () => navigate("/how-to-use"),
    },
    {
      icon: Receipt,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Billing",
      description: "Invoices, Sales Orders, Receipts — activate when your GST billing workflow is ready",
      action: () => navigate("/invoices"),
      badge: "GST Module",
    },
    {
      icon: Cog,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      title: "Process Library",
      description: "Standard process codes and approved vendors used across all manufacturing operations",
      action: () => navigate("/settings/process-library"),
      badge: processCodesCount > 0 ? `${processCodesCount} codes` : undefined,
    },
    {
      icon: Wrench,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      title: "Jig & Mould Master",
      description: "Drilling jigs and mould-dependent items — alerts auto-trigger on Delivery Challans",
      action: () => navigate("/settings/jig-mould"),
    },
    {
      icon: Users,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Users and Roles",
      description: "Invite team members, assign roles (Admin, Purchase, Inward, QC, Storekeeper, Assembly) and manage access",
      action: () => navigate("/settings/users"),
    },
    {
      icon: UserCheck,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      title: "Stock Editors",
      description: "Manage names for stock edit audit trail — required when editing opening stock",
      action: () => navigate("/settings/notifications"),
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {isNotConfigured && (
        <div className="mb-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Your company is not fully configured</p>
            <p className="text-sm text-amber-700 mt-0.5">Some features may not work correctly. Complete your company setup to use BizDocs properly.</p>
          </div>
          <button
            onClick={() => navigate("/setup")}
            className="shrink-0 text-sm font-medium text-amber-800 underline hover:text-amber-900"
          >
            Complete Setup →
          </button>
        </div>
      )}
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your BizDocs workspace</p>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <button
            key={card.title}
            onClick={card.action}
            className="group relative flex items-start gap-4 bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-left transition-all duration-200 hover:shadow-md hover:border-blue-200 active:scale-[0.99]"
          >
            {/* Icon */}
            <div className={`h-11 w-11 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
              <card.icon className={`h-5 w-5 ${card.iconColor}`} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900">{card.title}</p>
                {card.badge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                    {card.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5 leading-snug">{card.description}</p>
            </div>

            {/* Chevron */}
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0 mt-0.5" />
          </button>
        ))}
      </div>

      {/* Danger Zone */}
      <div>
        <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">Danger Zone</p>
        <button
          onClick={() => navigate("/settings/danger-zone")}
          className="group flex items-start gap-4 bg-white rounded-xl border-2 border-red-200 shadow-sm p-5 text-left transition-all duration-200 hover:shadow-md hover:border-red-400 active:scale-[0.99] w-full sm:w-auto"
        >
          <div className="h-11 w-11 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800">Clear All Account Data</p>
            <p className="text-sm text-red-600 mt-0.5 leading-snug">Permanently delete all items, parties, bills, GRNs, and every other record. Cannot be undone.</p>
          </div>
          <ChevronRight className="h-4 w-4 text-red-300 group-hover:text-red-500 transition-colors shrink-0 mt-0.5" />
        </button>
      </div>
    </div>
  );
}
