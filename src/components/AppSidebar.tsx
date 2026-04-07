import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  FileText,
  Truck,
  ShoppingCart,
  PackageCheck,
  Users,
  Package,
  Package2,
  Receipt,
  Settings,
  BarChart2,
  BarChart3,
  AlertTriangle,
  Star,
  FileSpreadsheet,
  GitFork,
  Layers,
  BookOpen,
  Hash,
  ClipboardCheck,
  ShoppingBag,
  ChevronRight,
  ChevronDown,
  TrendingDown,
  TrendingUp,
  Trash2,
  PanelLeft,
  PanelLeftClose,
  Wrench,
  Search,
  Send,
  RotateCcw,
  CheckCircle,
  Activity,
  Archive,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchFatStats } from "@/lib/fat-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchAwoStats } from "@/lib/production-api";
import { fetchAwaitingStoreCount } from "@/lib/grn-api";
import { fetchDispatchStats } from "@/lib/dispatch-api";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<any>;
  badge?: number;
  badgeColor?: "red" | "amber";
};

// ── Tooltip content ───────────────────────────────────────────────────────────

const TOOLTIP_TEXT: Record<string, string> = {
  "Ready to Dispatch": "FAT-passed finished goods cleared for dispatch. Create a Dispatch Record to ship.",
  "Dispatch Records": "Permanent log of every shipment made — DR number, customer, serial numbers, driver details.",
  "Dashboard":
    "Your daily overview — alerts, production status, financial snapshot and quick actions.",
  "WIP Register":
    "Live view of everything currently in progress — components at vendors and production runs being built.",
  "Job Cards":
    "Track components sent to vendors for job work. One job card per item per DC. Updated as processing progresses.",
  "DC / Job Work Order":
    "The gate pass for goods leaving the factory. Returnable for job work, non-returnable for customer deliveries.",
  "Purchase Orders":
    "Raise a formal buy request to a vendor. Triggered when stock falls below reorder point.",
  "GRN":
    "Record goods arriving from a vendor. Links to the original PO. Stock updates automatically when saved.",
  "DC Returns":
    "Record goods returning from job work vendors. Links to the Delivery Challan sent earlier.",
  "Invoices":
    "Raise a GST tax invoice to a customer. Only FAT-passed units can be invoiced.",
  "Receipts":
    "Record payment received from a customer against an invoice. Updates outstanding balance.",
  "Sales Orders":
    "Record a customer's order. In this system, sales orders are raised after goods are already in stock.",
  "Dispatch Notes":
    "The document that travels with the delivery truck. Has vehicle number, driver, LR number and packing list.",
  "Stock Register":
    "See current stock of every item — raw materials, components and finished goods. Red means below minimum, green means healthy.",
  "Stock Ledger":
    "The permanent record of every stock movement ever made — receipts, issues, returns, assembly. Full audit trail.",
  "Reorder Alerts":
    "Items that need to be purchased or produced now. The starting point of the pull cycle — check this every morning.",
  "Scrap Register":
    "Record rejected or scrapped material. Tracks the cost of poor quality and reduces stock automatically.",
  "Serial Numbers":
    "Every finished OLTC unit has a unique serial number. Tracks the unit from production through FAT, invoice, dispatch and warranty.",
  "FAT Certificates":
    "Factory Acceptance Test records. Every unit must pass FAT before it can be invoiced. 12 IEC standard tests per unit.",
  "GST Reports":
    "Download GSTR-1, GSTR-2 and GSTR-3B for filing. One click per report.",
  "Vendor Scorecards":
    "Automatic performance report per vendor — rejection rate, on-time delivery, turnaround time. Use in vendor review meetings.",
  "Parties":
    "All vendors and customers. Set up once — auto-fills on every PO, DC and invoice.",
  "Items":
    "Every raw material, component and finished product. The parts catalogue for the factory.",
  "Assets Register":
    "Tools, equipment, and other non-stock items that belong to the company. Filtered from the Stock Register.",
  "Bill of Materials":
    "The recipe for every product — what components go in, how many, and which vendors make them.",
  "Settings":
    "Company profile, document settings, data import, notifications and more.",
};

// ── Search items (all pages) ──────────────────────────────────────────────────

const ALL_SEARCH_ITEMS: { title: string; url: string }[] = [
  { title: "Ready to Dispatch", url: "/ready-to-dispatch" },
  { title: "Dispatch Records", url: "/dispatch-records" },
  { title: "Dashboard", url: "/" },
  { title: "WIP Register", url: "/wip-register" },
  { title: "Job Cards", url: "/job-works" },
  { title: "DC / Job Work Order", url: "/delivery-challans" },
  { title: "Purchase Orders", url: "/purchase-orders" },
  { title: "GRN", url: "/grn" },
  { title: "DC Returns", url: "/dc-grn" },
  { title: "Invoices", url: "/invoices" },
  { title: "Receipts", url: "/receipts" },
  { title: "Sales Orders", url: "/sales-orders" },
  { title: "Dispatch Notes", url: "/dispatch-notes" },
  { title: "Stock Register", url: "/stock-register" },
  { title: "Stock Ledger", url: "/stock-ledger" },
  { title: "Opening Stock", url: "/opening-stock" },
  { title: "Reorder Alerts", url: "/reorder-intelligence" },
  { title: "Scrap Register", url: "/scrap-register" },
  { title: "Serial Numbers", url: "/serial-numbers" },
  { title: "FAT Certificates", url: "/fat-certificates" },
  { title: "GST Reports", url: "/gst-reports" },
  { title: "Vendor Scorecards", url: "/vendor-scorecards" },
  { title: "Parties", url: "/parties" },
  { title: "Items", url: "/items" },
  { title: "Assets Register", url: "/assets-register" },
  { title: "Bill of Materials", url: "/bill-of-materials" },
  { title: "Jig Master", url: "/jig-master" },
  { title: "Settings", url: "/settings" },
];

// ── Group definitions ─────────────────────────────────────────────────────────

const STORAGE_KEY = "bizdocs_sidebar_state_v2";
const RAIL_MODE_KEY = "bizdocs_sidebar_mode";

const GROUP_PATHS: Record<string, string[]> = {
  "START HERE":             ["/"],
  "DAILY WORK":             ["/job-works", "/delivery-challans", "/dc-grn"],
  "PURCHASING & RECEIVING": ["/purchase-orders", "/grn"],
  "PRODUCTION":             ["/wip-register", "/sub-assembly-work-orders", "/finished-good-work-orders"],
  "STORE":                  ["/storekeeper", "/storekeeper-queue", "/stock-register", "/stock-ledger", "/opening-stock", "/scrap-register", "/ready-to-dispatch", "/dispatch-records"],
  "REPORTS":                ["/reorder-intelligence", "/serial-numbers", "/fat-certificates", "/gst-reports", "/vendor-scorecards"],
  "MASTER DATA":            ["/parties", "/items", "/bill-of-materials", "/jig-master", "/assets-register", "/settings"],
};

const DEFAULTS: Record<string, boolean> = {
  "START HERE":             true,
  "DAILY WORK":             false,
  "PURCHASING & RECEIVING": false,
  "PRODUCTION":             false,
  "STORE":                  false,
  "REPORTS":                false,
  "MASTER DATA":            false,
};

const GROUP_ICONS: Record<string, React.ComponentType<any>> = {
  "START HERE":             LayoutDashboard,
  "DAILY WORK":             Wrench,
  "PURCHASING & RECEIVING": ShoppingCart,
  "PRODUCTION":             Layers,
  "STORE":                  Package,
  "REPORTS":                BarChart2,
  "MASTER DATA":            GitFork,
};

const ALL_GROUP_NAMES = ["START HERE", "DAILY WORK", "PURCHASING & RECEIVING", "PRODUCTION", "STORE", "REPORTS", "MASTER DATA"];

function loadGroupState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULTS };
}

function getActiveGroupForPath(pathname: string): string | null {
  for (const [group, paths] of Object.entries(GROUP_PATHS)) {
    for (const p of paths) {
      if (p === "/" ? pathname === "/" : pathname.startsWith(p)) return group;
    }
  }
  return null;
}

// ── Static nav arrays ─────────────────────────────────────────────────────────

const billingNav: NavItem[] = [
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Receipts", url: "/receipts", icon: Receipt },
  { title: "Sales Orders", url: "/sales-orders", icon: ShoppingBag },
  { title: "Dispatch Notes", url: "/dispatch-notes", icon: Send },
];

// ── NavItemWithTooltip ────────────────────────────────────────────────────────

function NavItemWithTooltip({
  item,
  isActiveFn,
}: {
  item: NavItem;
  isActiveFn: (path: string) => boolean;
}) {
  const active = isActiveFn(item.url);
  const tooltip = TOOLTIP_TEXT[item.title];
  const badgeClass =
    item.badgeColor === "amber"
      ? "bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
      : "bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none";

  const link = (
    <SidebarMenuButton asChild isActive={active}>
      <NavLink
        to={item.url}
        end={item.url === "/"}
        className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {item.badge != null && item.badge > 0 ? (
          <span className="flex-1 flex items-center justify-between">
            {item.title}
            <span className={badgeClass}>{item.badge}</span>
          </span>
        ) : (
          <span>{item.title}</span>
        )}
      </NavLink>
    </SidebarMenuButton>
  );

  if (!tooltip) {
    return <SidebarMenuItem>{link}</SidebarMenuItem>;
  }

  return (
    <SidebarMenuItem>
      <Tooltip delayDuration={600}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-[220px] text-xs leading-relaxed">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

// ── NavGroup ──────────────────────────────────────────────────────────────────

function NavGroup({
  label,
  items,
  isActiveFn,
  open,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  isActiveFn: (path: string) => boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel
        className="text-white/40 text-[10px] font-semibold tracking-widest uppercase cursor-pointer flex items-center justify-between hover:text-white/70 transition-colors select-none"
        onClick={onToggle}
      >
        {label}
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
        )}
      </SidebarGroupLabel>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? 1000 : 0 }}
      >
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <NavItemWithTooltip key={item.url} item={item} isActiveFn={isActiveFn} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </div>
    </SidebarGroup>
  );
}

// ── AppSidebar ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();

  const canSeeGroup = (groupName: string): boolean => {
    if (role === 'admin') return true;
    const groupVisibility: Record<string, string[]> = {
      'START HERE':             ['admin', 'assembly_team', 'purchase_team'],
      'DAILY WORK':             ['admin', 'assembly_team'],
      'PURCHASING & RECEIVING': ['admin', 'purchase_team'],
      'PRODUCTION':             ['admin', 'assembly_team'],
      'STORE':                  ['admin', 'assembly_team'],
      'REPORTS':                ['admin', 'purchase_team'],
      'MASTER DATA':            ['admin', 'purchase_team'],
    };
    return (groupVisibility[groupName] ?? ['admin']).includes(role);
  };

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(loadGroupState);
  const [railMode, setRailMode] = useState<boolean>(() => {
    try { return localStorage.getItem(RAIL_MODE_KEY) === "rail"; } catch { return false; }
  });
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [flyoutY, setFlyoutY] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear search on navigation
  useEffect(() => {
    setSearchQuery("");
    setSearchOpen(false);
  }, [location.pathname]);

  // Persist rail mode
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_MODE_KEY, railMode ? "rail" : "full");
    } catch {}
  }, [railMode]);

  const toggleRailMode = () => {
    setRailMode((prev) => !prev);
    setHoveredGroup(null);
  };

  // Auto-expand the group containing the current page
  useEffect(() => {
    const activeGroup = getActiveGroupForPath(location.pathname);
    if (activeGroup && !groupOpen[activeGroup]) {
      setGroupOpen((prev) => ({ ...prev, [activeGroup]: true }));
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist group state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groupOpen));
    } catch {}
  }, [groupOpen]);

  const toggleGroup = useCallback((group: string) => {
    setGroupOpen((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const isGroupActive = (groupName: string) => {
    const paths = GROUP_PATHS[groupName] ?? [];
    return paths.some((p) =>
      p === "/" ? location.pathname === "/" : location.pathname.startsWith(p)
    );
  };

  // Rail mode hover handlers
  const cancelClose = () => clearTimeout(closeTimer.current);

  const startClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHoveredGroup(null), 300);
  };

  const handleGroupEnter = (groupName: string, e: React.MouseEvent) => {
    cancelClose();
    setHoveredGroup(groupName);
    setFlyoutY((e.currentTarget as HTMLElement).getBoundingClientRect().top);
  };

  const handleGroupLeave = () => startClose();
  const handleFlyoutEnter = () => cancelClose();
  const handleFlyoutLeave = () => startClose();

  // Queries
  const { data: fatStats } = useQuery({
    queryKey: ["fat-stats-sidebar"],
    queryFn: fetchFatStats,
    refetchInterval: 60000,
  });

  const { data: reorderSummary } = useQuery({
    queryKey: ["reorder-summary-sidebar"],
    queryFn: async () => {
      try {
        const companyId = await getCompanyId();
        if (!companyId) return { critical: 0, warning: 0 };
        const { count, error } = await (supabase as any)
          .from("stock_alerts")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId);
        if (error) return { critical: 0, warning: 0 };
        return { critical: count ?? 0, warning: 0 };
      } catch {
        return { critical: 0, warning: 0 };
      }
    },
    refetchInterval: 120000,
  });

  const reorderCritical = reorderSummary?.critical ?? 0;

  const { data: companySettingsData } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });

  const { data: awoStats } = useQuery({
    queryKey: ["awo-stats-sidebar"],
    queryFn: async () => {
      const [sa, fg] = await Promise.all([
        fetchAwoStats("sub_assembly"),
        fetchAwoStats("finished_good"),
      ]);
      return {
        sa_active: (sa.pending_materials ?? 0) + (sa.in_progress ?? 0),
        fg_active: (fg.pending_materials ?? 0) + (fg.in_progress ?? 0),
      };
    },
    staleTime: 60_000,
  });

  const { data: dispatchStats } = useQuery({
    queryKey: ["dispatch-stats-sidebar"],
    queryFn: async () => {
      try { return await fetchDispatchStats(); } catch { return { ready_to_dispatch: 0 }; }
    },
    staleTime: 60_000,
  });

  const { data: overduePOCount } = useQuery({
    queryKey: ["overdue-po-count-sidebar"],
    queryFn: async () => {
      try {
        const { count } = await (supabase as any)
          .from("purchase_orders")
          .select("*", { count: "exact", head: true })
          .in("status", ["draft", "issued", "partially_received"]);
        return count ?? 0;
      } catch { return 0; }
    },
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const { data: awaitingStoreCount = 0 } = useQuery({
    queryKey: ["awaiting-store-count"],
    queryFn: fetchAwaitingStoreCount,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const companyNeedsSetup = !companySettingsData?.gstin ||
    !companySettingsData?.company_name ||
    companySettingsData.company_name === "My Company";

  // Nav arrays
  const startHereNav: NavItem[] = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
  ];

  const dailyWorkNav: NavItem[] = [
    { title: "Job Cards", url: "/job-works", icon: Activity },
    { title: "DC / Job Work Order", url: "/delivery-challans", icon: Truck },
    { title: "DC Returns", url: "/dc-grn", icon: RotateCcw },
  ];

  const purchasingReceivingNav: NavItem[] = [
    {
      title: "Purchase Orders",
      url: "/purchase-orders",
      icon: ShoppingCart,
      badge: overduePOCount && overduePOCount > 0 ? overduePOCount : undefined,
      badgeColor: "red" as const,
    },
    { title: "GRN", url: "/grn", icon: PackageCheck },
  ];

  const productionNav: NavItem[] = [
    { title: "WIP Register", url: "/wip-register", icon: AlertTriangle },
    {
      title: "Sub-Assembly",
      url: "/sub-assembly-work-orders",
      icon: Layers,
      badge: awoStats?.sa_active && awoStats.sa_active > 0 ? awoStats.sa_active : undefined,
      badgeColor: "amber" as const,
    },
    {
      title: "Finished Goods",
      url: "/finished-good-work-orders",
      icon: Package,
      badge: awoStats?.fg_active && awoStats.fg_active > 0 ? awoStats.fg_active : undefined,
      badgeColor: "amber" as const,
    },
  ];

  const storeNav: NavItem[] = [
    { title: "Storekeeper Queue", url: "/storekeeper", icon: PackageCheck },
    {
      title: "Store Receipt Queue",
      url: "/storekeeper-queue",
      icon: PackageCheck,
      badge: awaitingStoreCount > 0 ? awaitingStoreCount : undefined,
      badgeColor: "amber" as const,
    },
    { title: "Stock Register", url: "/stock-register", icon: BarChart3 },
    { title: "Stock Ledger", url: "/stock-ledger", icon: BookOpen },
    { title: "Opening Stock", url: "/opening-stock", icon: Archive },
    { title: "Scrap Register", url: "/scrap-register", icon: Trash2 },
    {
      title: "Ready to Dispatch",
      url: "/ready-to-dispatch",
      icon: CheckCircle,
      badge: dispatchStats?.ready_to_dispatch && dispatchStats.ready_to_dispatch > 0 ? dispatchStats.ready_to_dispatch : undefined,
      badgeColor: "amber" as const,
    },
    { title: "Dispatch Records", url: "/dispatch-records", icon: Truck },
  ];

  const reportsNav: NavItem[] = [
    {
      title: "Reorder Alerts",
      url: "/reorder-intelligence",
      icon: TrendingDown,
      badge: reorderCritical > 0 ? reorderCritical : undefined,
    },
    { title: "Procurement Intelligence", url: "/procurement-intelligence", icon: TrendingUp },
    { title: "Serial Numbers", url: "/serial-numbers", icon: Hash },
    {
      title: "FAT Certificates",
      url: "/fat-certificates",
      icon: ClipboardCheck,
      badge: fatStats?.pending && fatStats.pending > 0 ? fatStats.pending : undefined,
      badgeColor: "amber" as const,
    },
    { title: "Vendor Scorecards", url: "/vendor-scorecards", icon: Star },
    { title: "GST Reports", url: "/gst-reports", icon: FileSpreadsheet },
  ];

  const masterDataNav: NavItem[] = [
    { title: "Items", url: "/items", icon: Package },
    { title: "Parties", url: "/parties", icon: Users },
    { title: "Bill of Materials", url: "/bill-of-materials", icon: GitFork },
    { title: "Jig Master", url: "/jig-master", icon: Wrench },
    { title: "Assets Register", url: "/assets-register", icon: Package2 },
    { title: "Settings", url: "/settings", icon: Settings, badge: companyNeedsSetup ? 1 : undefined, badgeColor: "amber" as const },
  ];

  // Group items map for rail flyout
  const GROUP_ITEMS_MAP: Record<string, NavItem[]> = {
    "START HERE":             startHereNav,
    "DAILY WORK":             dailyWorkNav,
    "PURCHASING & RECEIVING": purchasingReceivingNav,
    "PRODUCTION":             productionNav,
    "STORE":                  storeNav,
    "REPORTS":                reportsNav,
    "MASTER DATA":            masterDataNav,
  };

  // Search filtering
  const searchResults =
    searchQuery.trim().length > 0
      ? ALL_SEARCH_ITEMS.filter((item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [];

  return (
    <>
      {/* ── Sidebar ── */}
      <div
        data-rail={String(railMode)}
        style={{
          width: railMode ? 52 : 240,
          minWidth: railMode ? 52 : 240,
          transition: "width 0.2s ease",
          background: "#0F172A",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          flexShrink: 0,
          overflowX: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 16px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: railMode ? "center" : "flex-start",
          }}
        >
          {!railMode && (
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <div
                className="h-8 w-8 flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #1D4ED8, #2563EB)",
                  borderRadius: "8px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <LayoutDashboard className="h-[18px] w-[18px] text-white" />
              </div>
              <span
                className="font-bold text-lg text-white"
                style={{ letterSpacing: "-0.3px" }}
              >
                BizDocs
              </span>
            </div>
          )}
          {railMode && (
            <div
              className="h-8 w-8 flex items-center justify-center cursor-pointer shrink-0"
              style={{
                background: "linear-gradient(135deg, #1D4ED8, #2563EB)",
                borderRadius: "8px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onClick={() => navigate("/")}
            >
              <LayoutDashboard className="h-[18px] w-[18px] text-white" />
            </div>
          )}
        </div>

        {/* Search bar — full mode only */}
        {!railMode && (
          <div className="px-3 pb-2 flex-shrink-0 relative" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Jump to..."
                className="w-full h-8 pl-8 pr-3 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/40 outline-none focus:bg-white/20 focus:border-white/40 transition-colors"
              />
            </div>
            {/* Search dropdown */}
            {searchOpen && searchQuery.trim().length > 0 && (
              <div
                className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-lg"
                style={{
                  background: "#0f1623",
                  border: "1px solid rgba(100,116,139,0.4)",
                }}
              >
                {searchResults.length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-2.5">No pages found</p>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.url}
                      onClick={() => {
                        navigate(item.url);
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors text-left"
                    >
                      {item.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {railMode ? (
            /* Rail mode: one icon per group */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px 0",
                gap: 2,
              }}
            >
              {ALL_GROUP_NAMES.filter(canSeeGroup).map((groupName) => {
                const GroupIcon = GROUP_ICONS[groupName] ?? LayoutDashboard;
                const active = isGroupActive(groupName);
                const hovered = hoveredGroup === groupName;
                return (
                  <div
                    key={groupName}
                    style={{
                      width: 52,
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      borderRadius: 8,
                      background: active
                        ? "rgba(30,58,138,0.5)"
                        : hovered
                        ? "rgba(255,255,255,0.1)"
                        : "transparent",
                      color: active || hovered ? "#ffffff" : "#94a3b8",
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseEnter={(e) => handleGroupEnter(groupName, e)}
                    onMouseLeave={handleGroupLeave}
                    title={groupName}
                  >
                    <GroupIcon style={{ width: 18, height: 18 }} />
                  </div>
                );
              })}
            </div>
          ) : (
            /* Full mode: collapsible nav groups */
            <div>
              {canSeeGroup("START HERE") && (
                <NavGroup
                  label="START HERE"
                  items={startHereNav}
                  isActiveFn={isActive}
                  open={groupOpen["START HERE"]}
                  onToggle={() => toggleGroup("START HERE")}
                />
              )}
              {canSeeGroup("DAILY WORK") && (
                <NavGroup
                  label="DAILY WORK"
                  items={dailyWorkNav}
                  isActiveFn={isActive}
                  open={groupOpen["DAILY WORK"]}
                  onToggle={() => toggleGroup("DAILY WORK")}
                />
              )}
              {canSeeGroup("PURCHASING & RECEIVING") && (
                <NavGroup
                  label="PURCHASING & RECEIVING"
                  items={purchasingReceivingNav}
                  isActiveFn={isActive}
                  open={groupOpen["PURCHASING & RECEIVING"]}
                  onToggle={() => toggleGroup("PURCHASING & RECEIVING")}
                />
              )}
              {canSeeGroup("PRODUCTION") && (
                <NavGroup
                  label="PRODUCTION"
                  items={productionNav}
                  isActiveFn={isActive}
                  open={groupOpen["PRODUCTION"]}
                  onToggle={() => toggleGroup("PRODUCTION")}
                />
              )}
              {canSeeGroup("STORE") && (
                <NavGroup
                  label="STORE"
                  items={storeNav}
                  isActiveFn={isActive}
                  open={groupOpen["STORE"]}
                  onToggle={() => toggleGroup("STORE")}
                />
              )}
              {canSeeGroup("REPORTS") && (
                <NavGroup
                  label="REPORTS"
                  items={reportsNav}
                  isActiveFn={isActive}
                  open={groupOpen["REPORTS"]}
                  onToggle={() => toggleGroup("REPORTS")}
                />
              )}
              {canSeeGroup("MASTER DATA") && (
                <NavGroup
                  label="MASTER DATA"
                  items={masterDataNav}
                  isActiveFn={isActive}
                  open={groupOpen["MASTER DATA"]}
                  onToggle={() => toggleGroup("MASTER DATA")}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: railMode ? "center" : "space-between",
            borderTop: "1px solid rgba(100,116,139,0.15)",
          }}
        >
          {!railMode && (
            <p className="text-slate-500 text-xs font-mono">FY 2025–26</p>
          )}
          <button
            onClick={toggleRailMode}
            title={railMode ? "Expand sidebar" : "Switch to icon rail"}
            className="flex items-center justify-center h-7 w-7 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors"
          >
            {railMode ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Rail mode flyout — rendered into document.body via portal */}
      {railMode &&
        hoveredGroup &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: 52,
              top: flyoutY,
              zIndex: 9999,
              minWidth: 210,
              maxHeight: "70vh",
              overflowY: "auto",
              background: "#0f1623",
              border: "1px solid rgba(100,116,139,0.5)",
              borderRadius: "0 12px 12px 0",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
            onMouseEnter={handleFlyoutEnter}
            onMouseLeave={handleFlyoutLeave}
          >
            <p
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontWeight: 600,
                padding: "12px 12px 6px",
                color: "#94a3b8",
                borderBottom: "1px solid rgba(100,116,139,0.3)",
              }}
            >
              {hoveredGroup}
            </p>
            <div style={{ padding: "4px 0" }}>
              {(GROUP_ITEMS_MAP[hoveredGroup] ?? []).map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  end={item.url === "/"}
                  onClick={() => setHoveredGroup(null)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  activeClassName="text-white bg-blue-900/50"
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.title}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span
                      className={
                        item.badgeColor === "amber"
                          ? "bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                          : "bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                      }
                    >
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
