import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  MoreHorizontal,
  Activity,
  ShoppingCart,
  PackageCheck,
  Users,
  GitFork,
  BarChart3,
  Truck,
  Receipt,
  Settings,
  Layers,
  ShoppingBag,
  BookOpen,
  Plus,
  FileText,
  Send,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchReorderSummary } from "@/lib/reorder-api";

const MORE_GROUPS = [
  {
    label: "Daily Work",
    items: [
      { label: "Work Orders", to: "/job-cards", icon: Activity },
      { label: "Assembly Orders", to: "/assembly-orders", icon: Layers },
      { label: "WIP Register", to: "/wip-register", icon: BookOpen },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Purchase Orders", to: "/purchase-orders", icon: ShoppingCart },
      { label: "GRN", to: "/grn", icon: PackageCheck },
    ],
  },
  {
    label: "Dispatch & Billing",
    items: [
      { label: "Sales Orders", to: "/sales-orders", icon: ShoppingBag },
      { label: "Delivery Challans", to: "/delivery-challans", icon: Truck },
      { label: "Receipts", to: "/receipts", icon: Receipt },
    ],
  },
  {
    label: "Master Data",
    items: [
      { label: "Parties", to: "/parties", icon: Users },
      { label: "Bill of Materials", to: "/bill-of-materials", icon: GitFork },
      { label: "Stock Register", to: "/stock-register", icon: BarChart3 },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

const CREATE_TYPES = [
  { label: "Invoice", to: "/invoices/new", icon: FileText },
  { label: "Sales Order", to: "/sales-orders/new", icon: ShoppingBag },
  { label: "Purchase Order", to: "/purchase-orders/new", icon: ShoppingCart },
  { label: "Delivery Challan", to: "/delivery-challans/new", icon: Truck },
  { label: "GRN", to: "/grn/new", icon: PackageCheck },
  { label: "Dispatch Note", to: "/dispatch-notes/new", icon: Send },
  { label: "Work Order", to: "/job-cards", icon: Activity },
  { label: "Assembly Order", to: "/assembly-orders", icon: Layers },
];

const MAIN_TABS = [
  { label: "Home", icon: LayoutDashboard, to: "/" },
  { label: "Work Orders", icon: Activity, to: "/job-cards" },
  { label: "Items", icon: Package, to: "/items" },
];

export function MobileNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const { data: reorderData } = useQuery({
    queryKey: ["reorder-summary"],
    queryFn: fetchReorderSummary,
    staleTime: 5 * 60 * 1000,
  });
  const criticalCount = (reorderData as any)?.critical ?? 0;

  const handleCreate = (to: string) => {
    setCreateOpen(false);
    navigate(to);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
        <div className="flex items-center justify-around h-14">
          {/* Home */}
          <NavLink
            to={MAIN_TABS[0].to}
            end
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors",
                isActive && "text-primary"
              )
            }
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px] font-medium">{MAIN_TABS[0].label}</span>
          </NavLink>

          {/* Work Orders */}
          <NavLink
            to={MAIN_TABS[1].to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors",
                isActive && "text-primary"
              )
            }
          >
            <Activity className="h-5 w-5" />
            <span className="text-[10px] font-medium">{MAIN_TABS[1].label}</span>
          </NavLink>

          {/* Center + button */}
          <div className="flex items-center justify-center flex-1 h-full">
            <button
              onClick={() => setCreateOpen(true)}
              className="h-12 w-12 -mt-5 rounded-full bg-blue-600 shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform"
              aria-label="Create new"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          {/* Items */}
          <NavLink
            to={MAIN_TABS[2].to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors",
                isActive && "text-primary"
              )
            }
          >
            <Package className="h-5 w-5" />
            <span className="text-[10px] font-medium">{MAIN_TABS[2].label}</span>
          </NavLink>

          {/* More button */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors relative"
          >
            <div className="relative">
              <MoreHorizontal className="h-5 w-5" />
              {criticalCount > 0 && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {criticalCount > 9 ? "9+" : criticalCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Create New Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="md:hidden rounded-t-2xl p-0 [&>button]:hidden">
          <SheetHeader className="px-5 pt-4 pb-3 border-b border-border flex flex-row items-center justify-between">
            <SheetTitle className="text-base font-bold">Create New</SheetTitle>
            <SheetClose asChild>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </SheetClose>
          </SheetHeader>
          <div className="px-4 py-4 grid grid-cols-2 gap-3">
            {CREATE_TYPES.map((type) => (
              <button
                key={type.to + type.label}
                onClick={() => handleCreate(type.to)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30 hover:bg-muted active:scale-95 transition-all text-left"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <type.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground leading-tight">{type.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* More Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="md:hidden h-[75vh] rounded-t-2xl p-0 overflow-y-auto [&>button]:hidden">
          <SheetHeader className="px-5 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10 flex flex-row items-center justify-between">
            <SheetTitle className="text-base font-bold">Menu</SheetTitle>
            <SheetClose asChild>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </SheetClose>
          </SheetHeader>

          <div className="px-4 py-3 space-y-4">
            {MORE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-1 mb-1.5">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSheetOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted"
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
