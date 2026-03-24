import { useNavigate } from "react-router-dom";
import { Building2, FileText, Bell, GitBranch, Upload, FileSpreadsheet, Users, History, BookOpen, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

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
      description: "Invoice, PO, DC, GRN and Job Card number series. Financial year.",
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
      icon: GitBranch,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Process Library",
      description: "Standard processing steps for Job Cards. Configure once, auto-populate forever.",
      action: () => navigate("/stage-templates"),
    },
    {
      icon: Upload,
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
      title: "Data Import",
      description: "Import items, parties, BOM and opening stock from Excel templates",
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
      icon: Users,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: "Users and Roles",
      description: "Invite team members and assign access permissions",
      action: () => toast({ title: "Users and Roles is coming in a future update" }),
      badge: "Coming Soon",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
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
    </div>
  );
}
