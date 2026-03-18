import { ShoppingCart, Truck, PackageCheck, Receipt, Building2, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

const menuItems = [
  { label: "Purchase Orders", icon: ShoppingCart, to: "/purchase-orders", desc: "Vendor orders" },
  { label: "Delivery Challans", icon: Truck, to: "/delivery-challans", desc: "Outgoing material" },
  { label: "GRN", icon: PackageCheck, to: "/grn", desc: "Goods receipts" },
  { label: "Receipts", icon: Receipt, to: "/receipts", desc: "Payment records" },
  { label: "Company", icon: Building2, to: "/settings/company", desc: "Company details" },
  { label: "Settings", icon: Settings, to: "/settings", desc: "App preferences" },
];

export default function MoreMenu() {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-display font-bold text-foreground">More</h1>
      <div className="grid grid-cols-2 gap-3">
        {menuItems.map((item) => (
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
