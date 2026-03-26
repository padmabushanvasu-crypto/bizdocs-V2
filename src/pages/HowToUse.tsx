import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Users, Package, GitBranch, Database, FileText,
  Truck, ShoppingCart, ShoppingBag, Layers, CheckCircle2,
  Factory, Hash, BookOpen, ClipboardList, ArrowRight,
  ChevronLeft, Search, Wrench, AlertTriangle, Trash2,
  Receipt, BarChart2, Clock, AlertCircle, RefreshCw,
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
  whyMatters: string;
  timeNeeded: string;
  tag: string;
  tagOnce: boolean; // true = "Do this once" style (blue), false = "regularly" style (green)
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
      "Add your company name, address, GSTIN, PAN and logo.",
    whyMatters:
      "Your GSTIN and address appear on every invoice, PO and DC. Wrong details = invalid GST documents.",
    timeNeeded: "5 minutes — do this first, before anything else",
    tag: "Do this once",
    tagOnce: true,
    buttonLabel: "Go to Company Profile →",
    route: "/settings/company",
  },
  {
    icon: Users,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    stepNum: 2,
    title: "Add Vendors and Customers (Parties)",
    description:
      "Add all vendors you buy from and customers you sell to. Include their GSTIN — it auto-fills state code.",
    whyMatters:
      "Every PO, DC and Invoice pulls from here. If a party is missing you cannot raise a document for them.",
    timeNeeded:
      "15–30 minutes depending on how many parties you have. Use the Excel import to save time.",
    tag: "Do this once — add new parties as needed",
    tagOnce: true,
    buttonLabel: "Go to Parties →",
    route: "/parties",
  },
  {
    icon: Package,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    stepNum: 3,
    title: "Add Items (Parts Catalogue)",
    description:
      "Add every raw material, component, bought-out item, sub-assembly and finished product. Set drawing numbers, HSN codes, units and minimum stock levels.",
    whyMatters:
      "Every Job Work, PO, DC, Assembly Order and Invoice uses items from here. Missing items = cannot create documents.",
    timeNeeded:
      "30–60 minutes. Download the Items template from Data Import, fill it in Excel, upload in one go.",
    tag: "Do this once — add new items as needed",
    tagOnce: true,
    buttonLabel: "Go to Items →",
    route: "/items",
  },
  {
    icon: GitBranch,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    stepNum: 4,
    title: "Build Bills of Materials (BOM)",
    description:
      "For each sub-assembly and finished product define what goes into it — components, bought-outs and quantities. Set up variants for different product ratings (315 KVA, 500 KVA etc.).",
    whyMatters:
      "Assembly Orders use the BOM to automatically load components. Without a BOM you have to manually enter every component every time you build something.",
    timeNeeded:
      "1–2 hours for a typical OLTC product range. Done once per product.",
    tag: "Do this once per product",
    tagOnce: true,
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
      "Download the pre-filled template from Data Import. It already has all your items listed. Fill in current quantities and costs and upload.",
    whyMatters:
      "Without opening stock the system thinks you have zero of everything. Reorder alerts, Assembly Order availability checks and stock reports will all be wrong.",
    timeNeeded:
      "30 minutes — the template is pre-filled, you only enter quantities and costs.",
    tag: "Do this once at go-live",
    tagOnce: true,
    buttonLabel: "Go to Data Import →",
    route: "/settings/import",
  },
  {
    icon: FileText,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    stepNum: 6,
    title: "Configure Document Settings",
    description:
      "Set your invoice prefix, PO prefix, financial year and document number starting points. Add your bank details and standard payment terms.",
    whyMatters:
      "Document numbers auto-generate from here. Bank details auto-fill on every invoice. Getting this right saves time on every document you ever create.",
    timeNeeded: "10 minutes",
    tag: "Do this once — update at the start of each financial year",
    tagOnce: false,
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
          {/* Icon circle */}
          <div
            className={`relative z-10 h-12 w-12 rounded-full border-2 border-slate-200 bg-white flex items-center justify-center shrink-0 ${step.iconBg}`}
          >
            <step.icon className={`h-5 w-5 ${step.iconColor}`} />
          </div>

          {/* Card */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Step {step.stepNum}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      step.tagOnce
                        ? "bg-blue-50 text-blue-700 border-blue-100"
                        : "bg-green-50 text-green-700 border-green-100"
                    }`}
                  >
                    {step.tag}
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
                className="shrink-0 whitespace-nowrap self-start"
                onClick={() => navigate(step.route)}
              >
                {step.buttonLabel}
              </Button>
            </div>

            {/* Why this matters */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-snug">
                <span className="font-semibold">Why this matters: </span>
                {step.whyMatters}
              </p>
            </div>

            {/* Time needed */}
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <p className="text-xs text-slate-500">{step.timeNeeded}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab 2: Daily Operations Flow ──────────────────────────────────────────────

interface FlowStep {
  label: string;
  route?: string;
}

interface FlowRow {
  zone: string;
  zoneClass: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  pillHover: string;
  arrowColor: string;
  steps: FlowStep[];
  explanation: string;
  rules: string[];
}

const FLOW_ROWS: FlowRow[] = [
  {
    zone: "BUY",
    zoneClass: "bg-blue-600 text-white",
    pillBg: "bg-blue-50",
    pillBorder: "border-blue-200",
    pillText: "text-blue-800",
    pillHover: "hover:bg-blue-100",
    arrowColor: "text-blue-400",
    steps: [
      { label: "Customer Order" },
      { label: "Sales Order", route: "/sales-orders/new" },
      { label: "Purchase Order", route: "/purchase-orders/new" },
      { label: "GRN", route: "/grn/new" },
      { label: "Stock Updated" },
    ],
    explanation:
      "A customer calls with an order. You raise a Sales Order to formally record it. Then check what raw materials and bought-out items you need (use BOM Explosion). Raise Purchase Orders to your vendors. When materials arrive, record a GRN — this is what actually updates your stock. Without a GRN the system thinks nothing arrived.",
    rules: [
      "Always raise a PO before materials arrive",
      "Always record a GRN when materials arrive — never skip this",
      "GRN updates stock automatically — no manual entry needed",
    ],
  },
  {
    zone: "MAKE",
    zoneClass: "bg-amber-500 text-white",
    pillBg: "bg-amber-50",
    pillBorder: "border-amber-200",
    pillText: "text-amber-900",
    pillHover: "hover:bg-amber-100",
    arrowColor: "text-amber-400",
    steps: [
      { label: "Job Work", route: "/job-works" },
      { label: "Delivery Challan (Out)", route: "/delivery-challans/new" },
      { label: "Material Returns" },
      { label: "Complete Job Work" },
      { label: "Stock Updated" },
    ],
    explanation:
      "Components don't make themselves. Raw metal goes to a vendor for CNC machining, then to another for plating, then comes back for inspection. A Job Work tracks this entire journey. Each time material leaves the factory raise a Delivery Challan (Returnable type). When it comes back record the return on the DC. Once all steps are done and quality is accepted, complete the Job Work — stock of the finished component goes up.",
    rules: [
      "One Job Work per component per batch",
      "Always raise a DC when material goes out — it's your legal proof of dispatch",
      "GST Rule 45: job work goods must return within 365 days or GST is payable",
      "Complete the Job Work only after all steps are accepted",
    ],
  },
  {
    zone: "ASSEMBLE",
    zoneClass: "bg-purple-600 text-white",
    pillBg: "bg-purple-50",
    pillBorder: "border-purple-200",
    pillText: "text-purple-900",
    pillHover: "hover:bg-purple-100",
    arrowColor: "text-purple-400",
    steps: [
      { label: "Assembly Order", route: "/assembly-orders" },
      { label: "Check Components" },
      { label: "Confirm Assembly" },
      { label: "Serial Numbers", route: "/serial-numbers" },
      { label: "FAT Certificate", route: "/fat-certificates" },
    ],
    explanation:
      "Once all components are in stock you can build sub-assemblies and finished products. Create an Assembly Order and select the product — the BOM loads every required component automatically. Green means you have enough stock. Red means you are short. Fix shortages first, then confirm the assembly. Stock of all components goes down simultaneously. Stock of the finished product goes up. For finished OLTC units: assign a serial number to each unit, then run the FAT before you can invoice it.",
    rules: [
      "Never confirm an Assembly Order if any component shows red — get the stock first",
      "Serial numbers are assigned at Assembly — one per finished unit",
      "FAT must be passed before a unit can be invoiced — this is enforced by the system",
    ],
  },
  {
    zone: "SELL",
    zoneClass: "bg-green-600 text-white",
    pillBg: "bg-green-50",
    pillBorder: "border-green-200",
    pillText: "text-green-900",
    pillHover: "hover:bg-green-100",
    arrowColor: "text-green-400",
    steps: [
      { label: "Invoice", route: "/invoices/new" },
      { label: "Dispatch Note", route: "/dispatch-notes/new" },
      { label: "Payment Receipt", route: "/receipts" },
      { label: "Warranty Tracking", route: "/warranty-tracker" },
    ],
    explanation:
      "The unit is built and tested. Now raise an Invoice — only FAT-passed serial numbers appear in the invoice dropdown so you cannot accidentally bill an untested unit. Once invoiced create a Dispatch Note for the physical delivery — it has vehicle number, driver details, LR number and packing list. When the customer pays, record a Payment Receipt against the invoice. The outstanding balance updates automatically. Warranty tracking begins from the dispatch date.",
    rules: [
      "FAT must be passed before invoicing — the system enforces this",
      "Create a Dispatch Note for every customer delivery — it's your lorry receipt",
      "Always record Payment Receipts — your accounts team needs the outstanding balance report",
      "Warranty starts from the invoice/dispatch date automatically",
    ],
  },
];

function OperationsFlowTab() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      {FLOW_ROWS.map((row) => (
        <div
          key={row.zone}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
        >
          {/* Zone label */}
          <span
            className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full tracking-widest ${row.zoneClass}`}
          >
            {row.zone}
          </span>

          {/* Clickable step pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {row.steps.map((step, idx) => (
              <div key={step.label} className="flex items-center gap-1.5">
                <button
                  onClick={() => step.route && navigate(step.route)}
                  disabled={!step.route}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap transition-colors
                    ${row.pillBg} ${row.pillBorder} ${row.pillText}
                    ${step.route ? `${row.pillHover} cursor-pointer` : "cursor-default opacity-70"}`}
                >
                  {step.label}
                  {step.route && (
                    <span className="ml-1 text-[10px] opacity-60">↗</span>
                  )}
                </button>
                {idx < row.steps.length - 1 && (
                  <ArrowRight className={`h-4 w-4 shrink-0 ${row.arrowColor}`} />
                )}
              </div>
            ))}
          </div>

          {/* Expanded explanation */}
          <p className="text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
            {row.explanation}
          </p>

          {/* Key rules */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Key Rules
            </p>
            <ul className="space-y-1">
              {row.rules.map((rule) => (
                <li key={rule} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
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
  commonMistake: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: Wrench,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    name: "Job Works",
    whenToUse: "When sending material to a vendor for machining, plating, welding or any external process.",
    thinkOfItAs: "Digital job bag",
    commonMistake:
      "Raising a DC without a Job Work — you lose track of where material is and when it's due back.",
  },
  {
    icon: Layers,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    name: "Assembly Orders",
    whenToUse: "When building a sub-assembly or finished product from components already in stock.",
    thinkOfItAs: "Recipe execution",
    commonMistake:
      "Confirming when a component shows red — building incomplete products or wrong quantities.",
  },
  {
    icon: Truck,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    name: "Delivery Challans",
    whenToUse: "When goods leave the factory — either for job work (returnable) or customer delivery (non-returnable).",
    thinkOfItAs: "Gate pass",
    commonMistake:
      "Not recording the Return when material comes back — DC stays open forever, GST Rule 45 clock keeps ticking.",
  },
  {
    icon: ShoppingCart,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    name: "Purchase Orders",
    whenToUse: "When buying raw materials or bought-out items from a vendor. Raise before goods arrive.",
    thinkOfItAs: "Formal buy request",
    commonMistake:
      "Skipping the PO and going straight to GRN — you lose the paper trail and cannot track vendor delivery performance.",
  },
  {
    icon: ClipboardList,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    name: "GRN",
    whenToUse: "When purchased goods arrive at the factory. Link to the original PO. Record accepted vs rejected quantities.",
    thinkOfItAs: "Inward register",
    commonMistake:
      "Forgetting to record the GRN — stock stays at zero, reorder alerts keep firing even though material is in the store room.",
  },
  {
    icon: FileText,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    name: "Invoices",
    whenToUse: "When billing a customer after goods are assembled, FAT-passed and ready to dispatch.",
    thinkOfItAs: "The bill",
    commonMistake:
      "Raising an invoice before FAT — the system prevents this but some users try to bypass by not recording the FAT.",
  },
  {
    icon: ShoppingBag,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    name: "Sales Orders",
    whenToUse: "When a customer places an order. Record their PO number, product, quantity and delivery date.",
    thinkOfItAs: "Order book entry",
    commonMistake:
      "Skipping the Sales Order and going straight to Invoice — you lose the customer PO reference and delivery date tracking.",
  },
  {
    icon: Truck,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    name: "Dispatch Notes",
    whenToUse: "When goods go to a customer with a truck. Has vehicle number, driver, LR number and packing list.",
    thinkOfItAs: "Lorry receipt",
    commonMistake:
      "Not creating a Dispatch Note — you have no record of which vehicle carried which goods.",
  },
  {
    icon: CheckCircle2,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    name: "FAT Certificates",
    whenToUse: "When testing a finished OLTC unit. Records test parameters and pass/fail result.",
    thinkOfItAs: "Test report",
    commonMistake:
      "Not recording individual test values — just marking Overall Pass without entering readings makes the certificate useless for warranty disputes.",
  },
  {
    icon: BookOpen,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    name: "Stock Ledger",
    whenToUse: "View the complete history of every stock movement — purchases, assemblies, dispatches.",
    thinkOfItAs: "Stock passbook",
    commonMistake:
      "Using this to try to manually adjust stock — use it to read, not to write. Stock adjustments should come from proper documents.",
  },
  {
    icon: Factory,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    name: "WIP Register",
    whenToUse: "See everything in progress across all vendors at a glance — quantities, days out, overdue.",
    thinkOfItAs: "Factory floor board",
    commonMistake:
      "Not checking this daily — overdue vendor returns go unnoticed and GST Rule 45 deadlines are missed.",
  },
  {
    icon: AlertTriangle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    name: "Reorder Alerts",
    whenToUse: "Check which items have fallen below minimum stock level and need to be reordered.",
    thinkOfItAs: "Smart purchase reminder",
    commonMistake:
      "Ignoring amber alerts — by the time it turns red you may already have a production stoppage.",
  },
  {
    icon: BarChart2,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    name: "Vendor Scorecards",
    whenToUse: "Review vendor performance — on-time delivery rate, rejection rate, response time.",
    thinkOfItAs: "Report card",
    commonMistake:
      "Not recording receipts — your outstanding debtors report will show everyone as unpaid even when they have paid.",
  },
  {
    icon: Receipt,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    name: "Receipts",
    whenToUse: "When a customer pays an invoice. Records payment mode, UTR number and updates invoice status.",
    thinkOfItAs: "Payment acknowledgment",
    commonMistake:
      "Not recording receipts — your outstanding debtors report will show everyone as unpaid even when they have paid.",
  },
  {
    icon: Trash2,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    name: "Scrap Register",
    whenToUse: "When material is rejected, damaged or scrapped during production.",
    thinkOfItAs: "Rejection log",
    commonMistake:
      "Not recording scrap — you lose track of cost of poor quality and your stock counts are wrong.",
  },
  {
    icon: Hash,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    name: "Serial Numbers",
    whenToUse: "Track each finished OLTC unit by a unique serial number — from assembly through warranty.",
    thinkOfItAs: "Unit passport",
    commonMistake:
      "Not assigning serial numbers at Assembly — you cannot trace which components went into which unit for warranty claims.",
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
      f.thinkOfItAs.toLowerCase().includes(lower) ||
      f.commonMistake.toLowerCase().includes(lower)
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
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2.5"
          >
            {/* Icon + name */}
            <div className="flex items-center gap-2.5">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${f.iconBg}`}
              >
                <f.icon className={`h-4 w-4 ${f.iconColor}`} />
              </div>
              <p className="font-bold text-slate-900 leading-tight">{f.name}</p>
            </div>

            {/* When to use */}
            <p className="text-sm text-slate-600 leading-snug">{f.whenToUse}</p>

            {/* Think of it as */}
            <p className="text-sm text-blue-600 italic">"{f.thinkOfItAs}"</p>

            {/* Common mistake */}
            <div className="flex items-start gap-1.5 pt-1 border-t border-slate-100">
              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 italic leading-snug">
                {f.commonMistake}
              </p>
            </div>
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
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">
              Setup Order — do these in sequence when you first start
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Each step depends on the one before it. Follow the order and
              you'll be fully operational in under two hours.
            </p>
          </div>
          <GettingStartedTab />
        </TabsContent>

        <TabsContent value="daily-ops" className="mt-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">
              The Manufacturing Cycle
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Every order follows one of these four flows. Click any pill to
              open that feature. Follow the arrows.
            </p>
          </div>
          <OperationsFlowTab />
        </TabsContent>

        <TabsContent value="reference" className="mt-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">
              Feature Reference
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Quick lookup — when to use each feature, what it's analogous to,
              and the most common mistake to avoid.
            </p>
          </div>
          <FeatureReferenceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
