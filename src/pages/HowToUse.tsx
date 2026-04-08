import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, ChevronLeft, ChevronDown, ChevronRight,
  ArrowRight, ShoppingCart, Truck, Layers, Package,
  Users, Settings, Shield, Briefcase, ClipboardList,
  PackageCheck, Wrench,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "getting-started" | "daily-ops" | "role-guide";

// ── Flow pill component ────────────────────────────────────────────────────────

function FlowPills({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1.5 mb-4">
      {steps.map((step, idx) => (
        <div key={step} className="flex items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 whitespace-nowrap">
            {step}
          </span>
          {idx < steps.length - 1 && (
            <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Accordion ─────────────────────────────────────────────────────────────────

function AccordionItem({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-800 text-sm">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 transition-transform" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 text-sm text-slate-600 leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Tab 1: Getting Started ────────────────────────────────────────────────────

function GettingStartedTab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
        Complete these steps in order before your team starts using BizDocs.
        Skipping steps will cause imports to fail.
      </p>

      <AccordionItem title="Step 1 — Import Items Master">
        <p>
          Go to Settings → Data Import → Items tab. Upload{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            01_Items_Master.xlsx
          </span>
          . This brings in all your raw materials, components, and bought-out
          items. Every other import depends on this existing first — do not skip
          it.
        </p>
      </AccordionItem>

      <AccordionItem title="Step 2 — Import Sub-Assembly Master">
        <p>
          Still in Data Import → Sub-Assembly tab. Upload{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            02_SubAssembly_Master.xlsx
          </span>
          . This adds your sub-assemblies with their reorder points and aimed
          quantities. These drive the stock alerts for production planning.
        </p>
      </AccordionItem>

      <AccordionItem title="Step 3 — Import Parties">
        <p>
          Data Import → Parties tab. Upload{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            03_Parties.xlsx
          </span>
          . This brings in all your vendors and customers. Vendor names will
          appear in POs and DCs automatically once this is done.
        </p>
      </AccordionItem>

      <AccordionItem title="Step 4 — Import BOM">
        <p>
          Data Import → BOM tab. Upload{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            04_BOM.xlsx
          </span>
          . This defines which components go into which sub-assembly and in what
          quantity. The BOM explosion tree and cost rollup will not work until
          this is imported.
        </p>
      </AccordionItem>

      <AccordionItem title="Step 5 — Import Opening Stock">
        <p>
          Data Import → Opening Stock tab. Upload{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            07_Opening_Stock.xlsx
          </span>
          . This sets the current physical stock for every item. Get this right
          — it is the baseline everything else is measured against.
        </p>
      </AccordionItem>

      <AccordionItem title="Step 6 — Import Reorder Rules">
        <p>
          This step is different. Do <strong>NOT</strong> use a pre-filled
          template. Go to Data Import → Reorder Rules → Download Template. The
          downloaded file will have your actual item codes. Fill in the Reorder
          Point (minimum quantity) and Aimed Qty (target to maintain) for each
          item. Upload it back. This is what powers the stock alerts — without
          this, no alerts will fire.
        </p>
      </AccordionItem>

      <AccordionItem title="Step 7 — Configure Settings">
        <p>
          Go to Settings → Company Profile. Add your company name, registered
          address, physical address, GSTIN, PAN, phone, logo, and authorised
          signatory. Then go to Document Settings and set your document numbering
          prefixes (e.g.{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            PO/-26-27/
          </span>
          ,{" "}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            DC/-26-27/
          </span>
          ). This prints on every document you send to vendors and customers.
        </p>
      </AccordionItem>
    </div>
  );
}

// ── Tab 2: Daily Operations ───────────────────────────────────────────────────

function DailyOpsTab() {
  return (
    <div className="space-y-3">
      <AccordionItem title="Procurement Flow" defaultOpen>
        <FlowPills
          steps={[
            "Reorder Alert",
            "Raise PO",
            "Stage 1 GRN",
            "Stage 2 QC",
            "Storekeeper Confirmation",
            "Stock Enters",
          ]}
        />
        <p>
          When any item's stock drops below its minimum quantity, a red alert
          appears on the Dashboard under Needs Action. The Purchase Team sees
          this and clicks Raise PO directly from the alert — the PO form opens
          with the item pre-filled.
        </p>
        <p>
          When the vendor delivers, the Inward Team creates a GRN against the PO
          and enters quantities received. This is Stage 1 — quantity check only,
          no quality judgement here. Once saved, a red badge appears on the GRN
          sidebar link and the GRN moves to QC pending.
        </p>
        <p>
          The QC Team opens the GRN list, filters for Quality Pending, and
          records their inspection for each line item. They approve or reject
          quantities. Only approved quantities move forward. Once Stage 2 is
          saved, the GRN moves to the Storekeeper Queue.
        </p>
        <p>
          The Storekeeper opens the Storekeeper Queue, physically verifies the
          goods are in the right location, and confirms receipt. At this point —
          and only at this point — the stock enters the system. If stock is now
          above minimum, the alert disappears automatically.
        </p>
      </AccordionItem>

      <AccordionItem title="Job Work Flow (DC)">
        <FlowPills
          steps={[
            "Alert fires",
            "Raise DC",
            "Create Job Card",
            "Vendor Processes",
            "DC Return Stage 1",
            "DC Return Stage 2 QC",
            "Storekeeper Confirmation",
            "Stock Returns to Free",
          ]}
        />
        <p>
          When a component that requires external processing drops below minimum
          stock, the Dashboard shows a Needs Action alert with a Raise DC button.
          Click it — the DC / Job Work Order form opens with the item pre-filled.
          Select the vendor, enter quantity, specify job work type, and issue the
          DC. The material leaves your facility and moves from free stock into
          in-process stock.
        </p>
        <p>
          After the DC is issued, go to Job Cards and manually create a Job Card
          linked to that DC. The Job Card tracks the component through every
          processing stage — turning, drilling, heat treatment, plating, or
          whatever your process requires. Each stage is marked complete as work
          progresses. The Job Card step auto-closes when Stage 2 QC is saved.
        </p>
        <p>
          When the vendor returns the processed component, the Inward Team
          creates a DC Return GRN. Stage 1 is a quantity check on what came
          back. Once saved, it moves to QC pending — the same as a regular PO
          GRN.
        </p>
        <p>
          The QC Team inspects the returned material and approves the conforming
          quantity. Once Stage 2 is saved, the DC Return GRN moves to the
          Storekeeper Queue — exactly like a regular GRN.
        </p>
        <p>
          The Storekeeper confirms receipt via the Store Receipt Queue. At this
          point the stock moves from in-process back to free stock, and the
          alert disappears if stock is now above minimum.
        </p>
        <p className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-800">
          <strong>Note:</strong> If material is going back out for more
          processing (not marked as Final GRN), the GRN moves to quality_done
          status and can be sent out again via a new DC without entering the
          Storekeeper Queue.
        </p>
      </AccordionItem>

      <AccordionItem title="Assembly & Production Flow">
        <FlowPills
          steps={[
            "Raise Assembly Order",
            "Storekeeper Issues Materials",
            "Assembly Complete",
            "Stock Enters",
          ]}
        />
        <p>
          When sub-assembly or finished good stock drops below minimum, the
          Dashboard shows a Raise Assembly Order button. Click it — the Assembly
          Order form opens with the BOM automatically showing which components
          are needed and in what quantity.
        </p>
        <p>
          Once the Assembly Order is raised, a Material Issue Request appears in
          the Storekeeper Queue. The Storekeeper physically picks the components
          from the shelf and confirms the issue in the system. This reduces the
          component stock and signals the Assembly Team that materials are ready.
        </p>
        <p>
          The Assembly Team works on the shop floor. Once the sub-assembly or
          finished good is built, they open the Assembly Order and mark it
          complete. The completed quantity enters stock. If this was a
          sub-assembly going into a larger assembly, it is now available for the
          next Assembly Order that needs it.
        </p>
      </AccordionItem>

      <AccordionItem title="Dispatch Flow">
        <FlowPills
          steps={[
            "Invoice Raised",
            "Serial Numbers",
            "FAT Certificate",
            "Ready to Dispatch",
            "Dispatch Record",
          ]}
        />
        <p>
          Admin or the Purchase Team raises a GST invoice for the customer. The
          invoice pulls GSTIN, HSN codes, and tax rates automatically.
        </p>
        <p>
          For each finished good unit being dispatched, assign a serial number in
          the Serial Numbers page. If the customer requires a Factory Acceptance
          Test certificate, create it in FAT Certificates and link it to the
          serial number.
        </p>
        <p>
          The finished goods appear in Ready to Dispatch once serialised. The
          amber badge on the sidebar shows how many units are waiting to go out.
          Create a Dispatch Record for the shipment. Once saved, the goods leave
          your stock and the delivery is documented.
        </p>
      </AccordionItem>
    </div>
  );
}

// ── Tab 3: Role Guide ─────────────────────────────────────────────────────────

interface RoleItem {
  title: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  content: string;
}

const ROLES: RoleItem[] = [
  {
    title: "Purchase Team",
    icon: ShoppingCart,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    content:
      "Monitors Dashboard reorder alerts. Raises POs when stock falls below minimum using the Raise PO button on the alert. Tracks open POs via the Purchase Orders page. Raises DCs for job work when components need external processing. Also raises invoices for customer dispatches.",
  },
  {
    title: "Inward Team",
    icon: PackageCheck,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    content:
      "Creates Stage 1 GRN when goods arrive from a vendor against a PO — records quantities received, no quality check at this stage. Also creates Stage 1 DC Return GRN when processed components come back from job work vendors — again, quantity check only. Once saved, the GRN automatically moves to the QC Team.",
  },
  {
    title: "QC Team",
    icon: ClipboardList,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    content:
      "Handles Stage 2 GRN for all incoming goods — both PO receipts and DC job work returns. Opens the GRN list, filters by Quality Pending, and records inspection results for each line item. Approves or rejects quantities based on quality. Their approval is the gate that decides what enters stock and what gets rejected. Once Stage 2 is saved, both PO GRNs and DC Return GRNs move to the Storekeeper Queue for final confirmation.",
  },
  {
    title: "Storekeeper",
    icon: Package,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    content:
      "Has two main responsibilities. First — after QC clears a GRN (both PO receipts and DC job work returns), confirms physical receipt via the Store Receipt Queue. For PO GRNs this adds new stock to free stock. For DC Return GRNs this moves processed material from in-process back to free stock. Second — when an Assembly Order is raised, a Material Issue Request appears in the Storekeeper Queue. The Storekeeper picks the required components from the shelf and confirms the issue. This releases materials to the Assembly Team and reduces component stock.",
  },
  {
    title: "Assembly Team",
    icon: Layers,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    content:
      "Raises Assembly Orders for sub-assemblies and finished goods when stock falls below minimum — using the Raise Assembly Order button on the Dashboard alert. Monitors the Assembly Order for material availability — once the Storekeeper confirms the MIR, materials are ready. Marks the Assembly Order complete once production is done. Completed goods enter stock automatically.",
  },
  {
    title: "Admin",
    icon: Settings,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    content:
      "Manages all master data — Items, Parties, BOM, Reorder Rules. Handles all Settings including company profile, document numbering, and customisation. Runs Data Imports for initial setup and updates. Downloads GST Reports. Manages the Danger Zone for data resets before go-live or at the start of a new financial year.",
  },
  {
    title: "Finance Team (Coming Soon)",
    icon: Briefcase,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    content:
      "Will have access to Invoices, Receipts, and GST Reports for accounting and compliance purposes. Role-based access controls for Finance are planned for a future update.",
  },
];

function RoleGuideTab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        Each team has a defined set of actions in BizDocs. Use this as a
        reference for who does what.
      </p>
      {ROLES.map((role) => (
        <div
          key={role.title}
          className="border border-slate-200 rounded-xl overflow-hidden bg-white"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div
              className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${role.iconBg}`}
            >
              <role.icon className={`h-4 w-4 ${role.iconColor}`} />
            </div>
            <p className="font-semibold text-slate-800 text-sm">{role.title}</p>
          </div>
          <div className="px-4 pb-4 pt-1 border-t border-slate-100 text-sm text-slate-600 leading-relaxed">
            {role.content}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "getting-started", label: "Getting Started" },
  { id: "daily-ops", label: "Daily Operations" },
  { id: "role-guide", label: "Role Guide" },
];

export default function HowToUse() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("getting-started");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Settings
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <BookOpen className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            How to Use BizDocs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Setup guide, daily operations, and role responsibilities
          </p>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "getting-started" && <GettingStartedTab />}
        {activeTab === "daily-ops" && <DailyOpsTab />}
        {activeTab === "role-guide" && <RoleGuideTab />}
      </div>
    </div>
  );
}
