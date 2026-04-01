import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  MoreHorizontal,
  ClipboardList,
  FileText,
  ShoppingCart,
  PackageCheck,
  Users,
  GitFork,
  BarChart3,
  Truck,
  Receipt,
  Settings,
  ShoppingBag,
  BookOpen,
  Hash,
  ClipboardCheck,
  FileSpreadsheet,
  Star,
  Send,
  TrendingDown,
  Trash2,
  Activity,
  RotateCcw,
  AlertCircle,
  Wrench,
  X,
} from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// TODO: Add badge query for critical alerts (e.g. from reorder-api)
// const criticalCount = 0;

const MORE_GROUPS = [
  {
    label: "DAILY WORK",
    items: [
      { label: "Assembly Orders", to: "/assembly-orders", icon: ClipboardList },
      { label: "WIP Register", to: "/wip-register", icon: Activity },
      { label: "Stock Register", to: "/stock-register", icon: BarChart3 },
    ],
  },
  {
    label: "PURCHASING",
    items: [
      { label: "Purchase Orders", to: "/purchase-orders", icon: ShoppingCart },
      { label: "GRN", to: "/grn", icon: PackageCheck },
      { label: "DC Returns", to: "/dc-grn", icon: RotateCcw },
    ],
  },
  {
    label: "DISPATCH & BILLING",
    items: [
      { label: "Sales Orders", to: "/sales-orders", icon: ShoppingBag },
      { label: "Delivery Challans", to: "/delivery-challans", icon: Truck },
      { label: "Dispatch Notes", to: "/dispatch-notes", icon: Send },
      { label: "Receipts", to: "/receipts", icon: Receipt },
    ],
  },
  {
    label: "MASTER DATA",
    items: [
      { label: "Parties", to: "/parties", icon: Users },
      { label: "Bill of Materials", to: "/bill-of-materials", icon: GitFork },
      { label: "Jig Master", to: "/jig-master", icon: Wrench },
    ],
  },
  {
    label: "QUALITY & COMPLIANCE",
    items: [
      { label: "Serial Numbers", to: "/serial-numbers", icon: Hash },
      { label: "FAT Certificates", to: "/fat-certificates", icon: ClipboardCheck },
      { label: "Warranty Tracker", to: "/warranty-tracker", icon: AlertCircle },
    ],
  },
  {
    label: "REPORTS",
    items: [
      { label: "Vendor Scorecards", to: "/vendor-scorecards", icon: Star },
      { label: "GST Reports", to: "/gst-reports", icon: FileSpreadsheet },
      { label: "Stock Ledger", to: "/stock-ledger", icon: BookOpen },
      { label: "Open Items", to: "/open-items", icon: FileText },
      { label: "Reorder Alerts", to: "/reorder-intelligence", icon: TrendingDown },
      { label: "Reorder Rules", to: "/reorder-rules", icon: RotateCcw },
      { label: "Scrap Register", to: "/scrap-register", icon: Trash2 },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

const MAIN_TABS = [
  { label: "Home", icon: LayoutDashboard, to: "/", end: true },
  { label: "Work Orders", icon: ClipboardList, to: "/job-works", end: false },
  { label: "Invoices", icon: FileText, to: "/invoices", end: false },
  { label: "Items", icon: Package, to: "/items", end: false },
];

export function MobileNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();

  const isActive = (to: string, end: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <>
      {/* Bottom bar — 5 tabs */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
        <div className="flex items-center justify-around h-14">
          {MAIN_TABS.map((tab) => {
            const active = isActive(tab.to, tab.end);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </NavLink>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors relative"
          >
            <div className="relative">
              <MoreHorizontal className="h-5 w-5" />
              {/* TODO: show red dot badge for critical alerts */}
            </div>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* More drawer */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="md:hidden h-[80vh] rounded-t-2xl p-0 overflow-y-auto [&>button]:hidden">
          <SheetHeader className="px-5 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10 flex flex-row items-center justify-between">
            <SheetTitle className="text-base font-bold">Menu</SheetTitle>
            <SheetClose asChild>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
                aria-label="Close"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </SheetClose>
          </SheetHeader>

          <div className="px-4 py-3 space-y-5">
            {MORE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-1 mb-1.5">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.to, false);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
