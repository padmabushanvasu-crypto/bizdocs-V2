import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Users, Package, GitBranch, Database, FileText,
  Truck, ShoppingCart, ShoppingBag, Layers, CheckCircle2,
  Factory, Bell, Star, Hash, BookOpen, Activity,
  ClipboardList, ArrowRight, ChevronLeft, Search, Wrench,
  AlertTriangle, Award, Trash2, Receipt, BarChart2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Tab 1: Setup Steps ────────────────────────────────────────────────────────

interface SetupStep {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  stepNum: number;
  title: string;
  description: string;
  buttonLabel: string;
  route: string;
}

const SETUP_STEPS: SetupStep[] = [
  {
    icon: Building2,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    stepNum: 1,
    title: "Set up your Company Profile",
    description:
      "Add your company name, address, GSTIN and logo. This appears on every document you print.",
    buttonLabel: "Go to Company Profile →",
    route: "/settings/company",
  },
  {
    icon: Users,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    stepNum: 2,
    title: "Add Vendors and Customers",
    description:
      "Add all vendors you buy from and customers you sell to. You only do this once — they auto-fill on every PO, DC, and Invoice after that.",
    buttonLabel: "Go to Parties →",
    route: "/parties",
  },
  {
    icon: Package,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    stepNum: 3,
    title: "Add Items / Parts Catalogue",
    description:
      "Add every raw material, component, bought-out item, and finished product you work with. Set drawing numbers, HSN codes, minimum stock levels.",
    buttonLabel: "Go to Items →",
    route: "/items",
  },
  {
    icon: GitBranch,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    stepNum: 4,
    title: "Define Bills of Materials",
    description:
      "For each sub-assembly and finished product, define what goes into it — components, bought-outs, quantities. Do this once. Assembly Orders use it every time.",
    buttonLabel: "Go to Bill of Materials →",
    route: "/bill-of-materials",
  },
  {
    icon: Database,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    stepNum: 5,
    title: "Enter Opening Stock",
    description:
      "Download the pre-filled template from Data Import, fill in current quantities and costs, upload. This sets your starting inventory.",
    buttonLabel: "Go to Data Import →",
    route: "/settings/import",
  },
  {
    icon: FileText,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    stepNum: 6,
    title: "Set Document Number Series",
    description:
      "Set your invoice prefix, PO prefix, financial year. Documents will auto-number from here.",
    buttonLabel: "Go to Document Settings →",
    route: "/settings/documents",
  },
];

function GettingStartedTab() {
  const navigate = useNavigate();
  return (
    <div className="space-y-1 relative">
      {/* Vertical connecting line */}
      <div
        className="absolute left-[23px] top-6 bottom-6 w-0.5 bg-slate-200"
        aria-hidden="true"
      />
      {SETUP_STEPS.map((step) => (
        <div key={step.stepNum} className="relative flex gap-4 pb-4 last:pb-0">
          {/* Step number circle */}
          <div
            className={`relative z-10 h-12 w-12 rounded-full border-2 border-slate-200 bg-white flex items-center justify-center shrink-0 ${step.iconBg}`}
          >
            <step.icon className={`h-5 w-5 ${step.iconColor}`} />
          </div>

          {/* Card */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Step {step.stepNum}
                </span>
              </div>
              <p className="font-semibold text-slate-900">{step.title}</p>
              <p className="text-sm text-slate-500 mt-0.5 leading-snug">
                {step.description}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => navigate(step.route)}
            >
              {step.buttonLabel}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab 2: Daily Operations Flow ──────────────────────────────────────────────

interface FlowRow {
  zone: string;
  zoneClass: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  arrowColor: string;
  steps: string[];
  description: string;
}

const FLOW_ROWS: FlowRow[] = [
  {
    zone: "BUY",
    zoneClass: "bg-blue-600 text-white",
    pillBg: "bg-blue-50",
    pillBorder: "border-blue-200",
    pillText: "text-blue-800",
    arrowColor: "text-blue-400",
    steps: ["Customer Order", "Sales Order", "Purchase Order", "GRN", "Stock Updated"],
    description: "When a customer orders something you need to buy — raise a Sales Order, then a PO. Record a GRN when materials arrive.",
  },
  {
    zone: "MAKE",
    zoneClass: "bg-amber-500 text-white",
    pillBg: "bg-amber-50",
    pillBorder: "border-amber-200",
    pillText: "text-amber-900",
    arrowColor: "text-amber-400",
    steps: ["Work Order", "Delivery Challan (Job Work Out)", "Material Returns", "Complete Work Order", "Stock Updated"],
    description: "For outsourced processing — raise a Work Order, send goods on a DC, receive back, close the Work Order.",
  },
  {
    zone: "ASSEMBLE",
    zoneClass: "bg-purple-600 text-white",
    pillBg: "bg-purple-50",
    pillBorder: "border-purple-200",
    pillText: "text-purple-900",
    arrowColor: "text-purple-400",
    steps: ["Assembly Order", "Check Components", "Confirm Assembly", "Serial Numbers", "FAT Certificate"],
    description: "When building a finished product — the BOM loads components automatically. Assign a serial number and run the factory acceptance test.",
  },
  {
    zone: "SELL",
    zoneClass: "bg-green-600 text-white",
    pillBg: "bg-green-50",
    pillBorder: "border-green-200",
    pillText: "text-green-900",
    arrowColor: "text-green-400",
    steps: ["Invoice", "Dispatch Note", "Payment Receipt", "Warranty Tracking"],
    description: "After FAT is passed — raise an Invoice, dispatch goods on a Dispatch Note, record payment when it arrives.",
  },
];

function OperationsFlowTab() {
  return (
    <div className="space-y-6">
      {FLOW_ROWS.map((row) => (
        <div
          key={row.zone}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3"
        >
          {/* Zone label */}
          <span
            className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full tracking-widest ${row.zoneClass}`}
          >
            {row.zone}
          </span>

          {/* Steps row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {row.steps.map((step, idx) => (
              <div key={step} className="flex items-center gap-1.5">
                <div
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap ${row.pillBg} ${row.pillBorder} ${row.pillText}`}
                >
                  {step}
                </div>
                {idx < row.steps.length - 1 && (
                  <ArrowRight className={`h-4 w-4 shrink-0 ${row.arrowColor}`} />
                )}
              </div>
            ))}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-500 italic leading-relaxed">
            {row.description}
          </p>
        </div>
      ))}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-2">
        {FLOW_ROWS.map((r) => (
          <span
            key={r.zone}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${r.zoneClass}`}
          >
            {r.zone}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Tab 3: Feature Reference ──────────────────────────────────────────────────

interface FeatureCard {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  name: string;
  whenToUse: string;
  thinkOfItAs: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: Wrench,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    name: "Work Orders",
    whenToUse: "When sending material to a vendor for machining, plating, welding or any external process.",
    thinkOfItAs: "Digital job bag",
  },
  {
    icon: Layers,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    name: "Assembly Orders",
    whenToUse: "When building a sub-assembly or finished product from components already in stock.",
    thinkOfItAs: "Recipe execution",
  },
  {
    icon: Truck,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    name: "Delivery Challans",
    whenToUse: "When goods leave the factory — either for job work (returnable) or customer delivery (non-returnable).",
    thinkOfItAs: "Gate pass",
  },
  {
    icon: ShoppingCart,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    name: "Purchase Orders",
    whenToUse: "When buying raw materials or bought-out items from a vendor. Raise before goods arrive.",
    thinkOfItAs: "Formal buy request",
  },
  {
    icon: ClipboardList,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    name: "GRN",
    whenToUse: "When purchased goods arrive at the factory. Link to the original PO. Record accepted vs rejected quantities.",
    thinkOfItAs: "Inward register",
  },
  {
    icon: FileText,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    name: "Invoices",
    whenToUse: "When billing a customer after goods are assembled, FAT-passed and ready to dispatch.",
    thinkOfItAs: "The bill",
  },
  {
    icon: ShoppingBag,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    name: "Sales Orders",
    whenToUse: "When a customer places an order. Record their PO number, product, quantity and delivery date.",
    thinkOfItAs: "Order book entry",
  },
  {
    icon: Truck,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    name: "Dispatch Notes",
    whenToUse: "When goods go to a customer with a truck. Has vehicle number, driver, LR number and packing list.",
    thinkOfItAs: "Lorry receipt",
  },
  {
    icon: CheckCircle2,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    name: "FAT Certificates",
    whenToUse: "When testing a finished OLTC unit. Records test parameters and pass/fail result.",
    thinkOfItAs: "Test report",
  },
  {
    icon: BookOpen,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    name: "Stock Ledger",
    whenToUse: "View the complete history of every stock movement — purchases, assemblies, dispatches.",
    thinkOfItAs: "Stock passbook",
  },
  {
    icon: Factory,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    name: "WIP Register",
    whenToUse: "See everything in progress across all vendors at a glance — quantities, days out, overdue.",
    thinkOfItAs: "Factory floor board",
  },
  {
    icon: AlertTriangle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    name: "Reorder Alerts",
    whenToUse: "Check which items have fallen below minimum stock level and need to be reordered.",
    thinkOfItAs: "Smart purchase reminder",
  },
  {
    icon: BarChart2,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    name: "Vendor Scorecards",
    whenToUse: "Review vendor performance — on-time delivery rate, rejection rate, response time.",
    thinkOfItAs: "Report card",
  },
  {
    icon: Receipt,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    name: "Receipts",
    whenToUse: "When a customer pays an invoice. Records payment mode, UTR number and updates invoice status.",
    thinkOfItAs: "Payment acknowledgment",
  },
  {
    icon: Trash2,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    name: "Scrap Register",
    whenToUse: "When material is rejected, damaged or scrapped during production.",
    thinkOfItAs: "Rejection log",
  },
  {
    icon: Hash,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    name: "Serial Numbers",
    whenToUse: "Track each finished OLTC unit by a unique serial number — from assembly through warranty.",
    thinkOfItAs: "Unit passport",
  },
];

function FeatureReferenceTab() {
  const [q, setQ] = useState("");
  const lower = q.toLowerCase();
  const filtered = FEATURES.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(lower) ||
      f.whenToUse.toLowerCase().includes(lower) ||
      f.thinkOfItAs.toLowerCase().includes(lower)
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search features..."
          className="pl-9"
        />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((f) => (
          <div
            key={f.name}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${f.iconBg}`}
              >
                <f.icon className={`h-4.5 w-4.5 ${f.iconColor}`} />
              </div>
              <p className="font-bold text-slate-900 leading-tight">{f.name}</p>
            </div>
            <p className="text-sm text-slate-600 leading-snug">{f.whenToUse}</p>
            <p className="text-sm text-blue-600 italic">"{f.thinkOfItAs}"</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-3 text-sm text-muted-foreground py-8 text-center">
            No features match "{q}"
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HowToUse() {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Settings
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            How to Use BizDocs
          </h1>
          <p className="text-sm text-muted-foreground">
            Step-by-step guide — what to do first, what comes after, and when
            to use each feature
          </p>
        </div>
      </div>

      <Tabs defaultValue="getting-started">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
          <TabsTrigger value="daily-ops">Daily Operations</TabsTrigger>
          <TabsTrigger value="reference">Feature Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="getting-started" className="mt-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Setup Order — do these in sequence when you first start
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Each step depends on the one before it. Follow the order and you'll
              be fully operational in under an hour.
            </p>
          </div>
          <GettingStartedTab />
        </TabsContent>

        <TabsContent value="daily-ops" className="mt-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              The Manufacturing Cycle
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Every order follows one of these four flows. Find your situation and
              follow the arrows.
            </p>
          </div>
          <OperationsFlowTab />
        </TabsContent>

        <TabsContent value="reference" className="mt-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Feature Reference
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Quick lookup — when to use each feature and what it does.
            </p>
          </div>
          <FeatureReferenceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
