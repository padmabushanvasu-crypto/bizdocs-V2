import { ShoppingCart, Truck, PackageCheck, Receipt, Building2, Settings, FileText, BarChart3, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCurrentRole } from "@/hooks/useRoleAccess";
import type { AppRole } from "@/lib/role-access";

// `allowedRoles` restricts an entry to those roles (same semantics as the sidebar's
// NavItem.allowedRoles); entries without it are shown to everyone.
const menuItems: { label: string; icon: typeof Truck; to: string; desc: string; allowedRoles?: AppRole[] }[] = [
  { label: "Purchase Orders", icon: ShoppingCart, to: "/purchase-orders", desc: "Vendor orders" },
  { label: "Delivery Challans", icon: Truck, to: "/delivery-challans", desc: "Outgoing material" },
  { label: "GRN", icon: PackageCheck, to: "/grn", desc: "Goods receipts" },
  { label: "Receipts", icon: Receipt, to: "/receipts", desc: "Payment records" },
  { label: "Processor Invoices", icon: FileText, to: "/processor-invoices", desc: "Job-work billing", allowedRoles: ['admin', 'finance'] },
  { label: "Processor Reports", icon: BarChart3, to: "/processor-invoice-reports", desc: "Pending, variance, prices", allowedRoles: ['admin', 'finance'] },
  { label: "Jig Approvals", icon: CheckCircle, to: "/jig-approvals", desc: "Write-offs, invoices with jigs out", allowedRoles: ['admin', 'finance'] },
  { label: "Company", icon: Building2, to: "/settings/company", desc: "Company details" },
  { label: "Settings", icon: Settings, to: "/settings", desc: "App preferences" },
];

export default function MoreMenu() {
  const navigate = useNavigate();
  const currentRole = useCurrentRole();
  const visibleItems = menuItems.filter((i) => !i.allowedRoles || i.allowedRoles.includes(currentRole));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-display font-bold text-foreground">More</h1>
      <div className="grid grid-cols-2 gap-3">
        {visibleItems.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="paper-card flex flex-col items-center gap-2 py-6 hover:border-primary/30 transition-colors active:scale-[0.98]"
          >
            <item.icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-foreground">{item.label}</span>
            <span className="text-[11px] text-muted-foreground">{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
