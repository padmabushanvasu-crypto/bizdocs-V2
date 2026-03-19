import { GitFork, ArrowRight, Package, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const bomExample = [
  {
    code: "FG-001",
    description: "Finished Product Assembly",
    type: "finished_good",
    children: [
      {
        code: "SA-001",
        description: "Sub-Assembly A",
        qty: 1,
        type: "sub_assembly",
        children: [
          { code: "COM-001", description: "Component — Shaft", qty: 2, type: "component" },
          { code: "COM-002", description: "Component — Bearing", qty: 4, type: "component" },
          { code: "BO-001", description: "Bought-Out — Motor", qty: 1, type: "bought_out" },
        ],
      },
      {
        code: "SA-002",
        description: "Sub-Assembly B",
        qty: 1,
        type: "sub_assembly",
        children: [
          { code: "COM-003", description: "Component — Housing", qty: 1, type: "component" },
          { code: "CON-001", description: "Consumable — Grease", qty: 1, type: "consumable" },
        ],
      },
    ],
  },
];

const typeColor: Record<string, string> = {
  finished_good: "bg-emerald-100 text-emerald-800",
  sub_assembly: "bg-indigo-100 text-indigo-800",
  component: "bg-sky-100 text-sky-800",
  bought_out: "bg-amber-100 text-amber-800",
  consumable: "bg-teal-100 text-teal-800",
};

function BOMNode({
  node,
  depth = 0,
}: {
  node: any;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-6 border-l border-slate-200 pl-4" : ""}>
      <div className="flex items-center gap-2 py-1.5">
        {depth > 0 && <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
        <span className="font-mono text-xs text-blue-600 font-medium">{node.code}</span>
        <span className="text-sm text-slate-700">{node.description}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeColor[node.type] || "bg-slate-100 text-slate-600"}`}>
          {node.type?.replace(/_/g, " ")}
        </span>
        {node.qty && (
          <span className="text-xs text-slate-400 font-mono">× {node.qty}</span>
        )}
      </div>
      {node.children?.map((child: any) => (
        <BOMNode key={child.code} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function BillOfMaterials() {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
          <GitFork className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bill of Materials</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Define multi-level product structures — finished goods, sub-assemblies, components, and bought-out parts.
          </p>
        </div>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-6 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          <Layers className="h-3.5 w-3.5" />
          Coming Soon
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Bill of Materials is in development</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          You'll be able to define multi-level BOMs for finished goods — linking components,
          sub-assemblies, bought-out parts, and consumables — and use them to drive costing,
          procurement, and job card planning.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
          {[
            { icon: "🏗️", title: "Multi-Level BOM", desc: "Define parent → child → sub-child hierarchies" },
            { icon: "💰", title: "Cost Rollup", desc: "Auto-calculate cost from component prices" },
            { icon: "📋", title: "Job Card Integration", desc: "Create job cards from BOM templates" },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xl mb-1">{f.icon}</div>
              <p className="text-xs font-semibold text-slate-800">{f.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* BOM Hierarchy Preview */}
      <div className="paper-card space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">Example BOM Structure</h2>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">preview only</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
          {bomExample.map((node) => (
            <BOMNode key={node.code} node={node} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(typeColor).map(([type, cls]) => (
            <span key={type} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
              {type.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => navigate("/items")}
          className="gap-1.5"
        >
          <Package className="h-4 w-4" /> Manage Items
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/job-cards")}
          className="gap-1.5"
        >
          <GitFork className="h-4 w-4" /> View Job Cards
        </Button>
      </div>
    </div>
  );
}
