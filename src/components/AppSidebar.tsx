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
  Receipt,
  Settings,
  ClipboardList,
  BarChart3,
  Activity,
  AlertTriangle,
  Star,
  FileSpreadsheet,
  GitFork,
  Layers,
  BookOpen,
  Hash,
  ClipboardCheck,
  Shield,
  ShoppingBag,
  ChevronRight,
  ChevronDown,
  TrendingDown,
  Settings2,
  Trash2,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchWipSummary } from "@/lib/job-cards-api";
import { fetchFatStats, fetchSerialStats } from "@/lib/fat-api";
import { fetchReorderSummary } from "@/lib/reorder-api";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<any>;
  badge?: number;
};

// ── Group definitions ─────────────────────────────────────────────────────────

const STORAGE_KEY = "bizdocs_sidebar_state";
const RAIL_MODE_KEY = "bizdocs_sidebar_mode";

const GROUP_PATHS: Record<string, string[]> = {
  "Start Here":           ["/", "/open-items"],
  "Daily Work":           ["/job-cards", "/assembly-orders", "/wip-register"],
  "Purchasing":           ["/purchase-orders", "/grn"],
  "Dispatch & Billing":   ["/sales-orders", "/dispatch-notes", "/delivery-challans", "/invoices", "/receipts"],
  "Master Data":          ["/parties", "/items", "/bill-of-materials", "/stock-register"],
  "Reports":              ["/gst-reports", "/vendor-scorecards", "/stock-ledger", "/reorder-intelligence", "/reorder-rules", "/scrap-register"],
  "Quality & Compliance": ["/serial-numbers", "/fat-certificates", "/warranty-tracker"],
  "Settings":             ["/settings"],
};

const DEFAULTS: Record<string, boolean> = {
  "Start Here":           true,
  "Daily Work":           true,
  "Purchasing":           false,
  "Dispatch & Billing":   false,
  "Master Data":          false,
  "Reports":              false,
  "Quality & Compliance": false,
  "Settings":             false,
};

// Group icons for rail mode
const GROUP_ICONS: Record<string, React.ComponentType<any>> = {
  "Start Here":           LayoutDashboard,
  "Daily Work":           Activity,
  "Purchasing":           ShoppingCart,
  "Dispatch & Billing":   FileText,
  "Master Data":          Package,
  "Reports":              BarChart3,
  "Quality & Compliance": ClipboardCheck,
  "Settings":             Settings,
};

const ALL_GROUP_NAMES = [
  "Start Here",
  "Daily Work",
  "Purchasing",
  "Dispatch & Billing",
  "Master Data",
  "Reports",
  "Quality & Compliance",
  "Settings",
];

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

const startHereNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Open Items", url: "/open-items", icon: ClipboardList },
];

const dailyWorkNav: NavItem[] = [
  { title: "Work Orders", url: "/job-cards", icon: Activity },
  { title: "Assembly Orders", url: "/assembly-orders", icon: Layers },
];

const purchasingNav: NavItem[] = [
  { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart },
  { title: "GRN", url: "/grn", icon: PackageCheck },
];

const dispatchBillingNav: NavItem[] = [
  { title: "Sales Orders", url: "/sales-orders", icon: ShoppingBag },
  { title: "Dispatch Notes", url: "/dispatch-notes", icon: Truck },
  { title: "Delivery Challans", url: "/delivery-challans", icon: Truck },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Receipts", url: "/receipts", icon: Receipt },
];

const masterDataNav: NavItem[] = [
  { title: "Parties", url: "/parties", icon: Users },
  { title: "Items", url: "/items", icon: Package },
  { title: "Bill of Materials", url: "/bill-of-materials", icon: GitFork },
  { title: "Stock Register", url: "/stock-register", icon: BarChart3 },
];

const settingsNav: NavItem[] = [
  { title: "Settings", url: "/settings", icon: Settings },
];

// ── NavGroup (collapsible, badge-aware) ──────────────────────────────────────

function NavGroup({
  label,
  items,
  collapsed,
  isActive,
  open,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  collapsed: boolean;
  isActive: (path: string) => boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const showContent = collapsed || open;

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel
          className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold cursor-pointer flex items-center justify-between hover:text-slate-300 transition-colors select-none"
          onClick={onToggle}
        >
          {label}
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
          )}
        </SidebarGroupLabel>
      )}
      {showContent && (
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      item.badge != null && item.badge > 0 ? (
                        <span className="flex-1 flex items-center justify-between">
                          {item.title}
                          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {item.badge}
                          </span>
                        </span>
                      ) : (
                        <span>{item.title}</span>
                      )
                    )}
                    {collapsed && item.badge != null && item.badge > 0 && (
                      <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

// ── AppSidebar ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(loadGroupState);
  const [railMode, setRailMode] = useState<boolean>(() => {
    try { return localStorage.getItem(RAIL_MODE_KEY) === "rail"; } catch { return false; }
  });
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [flyoutY, setFlyoutY] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  // Force sidebar collapsed when in rail mode
  useEffect(() => {
    if (railMode && state !== "collapsed") {
      setOpen(false);
    }
  }, [railMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist rail mode
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_MODE_KEY, railMode ? "rail" : "full");
    } catch {}
  }, [railMode]);

  const toggleRailMode = () => {
    setRailMode((prev) => {
      const next = !prev;
      if (!next) setOpen(true);
      return next;
    });
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
    return paths.some((p) => p === "/" ? location.pathname === "/" : location.pathname.startsWith(p));
  };

  // Rail mode hover handlers
  const cancelClose = () => clearTimeout(closeTimer.current);

  const startClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHoveredGroup(null), 300);
  };

  const handleGroupEnter = (groupName: string, e: React.MouseEvent) => {
    cancelClose();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFlyoutY(rect.top);
    setHoveredGroup(groupName); // instant open
  };

  const handleGroupLeave = () => startClose();
  const handleFlyoutEnter = () => cancelClose();
  const handleFlyoutLeave = () => startClose();

  // Queries
  const { data: wipSummary } = useQuery({
    queryKey: ["wip-summary-sidebar"],
    queryFn: fetchWipSummary,
    refetchInterval: 60000,
  });

  const { data: fatStats } = useQuery({
    queryKey: ["fat-stats-sidebar"],
    queryFn: fetchFatStats,
    refetchInterval: 60000,
  });

  const { data: serialStats } = useQuery({
    queryKey: ["serial-stats-sidebar"],
    queryFn: fetchSerialStats,
    refetchInterval: 60000,
  });

  const { data: reorderSummary } = useQuery({
    queryKey: ["reorder-summary-sidebar"],
    queryFn: async () => {
      try {
        return await fetchReorderSummary();
      } catch {
        return { critical: 0, warning: 0 };
      }
    },
    refetchInterval: 120000,
  });

  // Build dynamic reportsNav with badge
  const reorderCritical = reorderSummary?.critical ?? 0;
  const reportsNav: NavItem[] = [
    { title: "GST Reports", url: "/gst-reports", icon: FileSpreadsheet },
    { title: "Vendor Scorecards", url: "/vendor-scorecards", icon: Star },
    { title: "Stock Ledger", url: "/stock-ledger", icon: BookOpen },
    {
      title: "Reorder Alerts",
      url: "/reorder-intelligence",
      icon: TrendingDown,
      badge: reorderCritical > 0 ? reorderCritical : undefined,
    },
    { title: "Reorder Rules", url: "/reorder-rules", icon: Settings2 },
    { title: "Scrap Register", url: "/scrap-register", icon: Trash2 },
  ];

  // Group items map for rail flyout
  const GROUP_ITEMS_MAP: Record<string, NavItem[]> = {
    "Start Here": startHereNav,
    "Daily Work": [
      ...dailyWorkNav,
      { title: "WIP Register", url: "/wip-register", icon: AlertTriangle, badge: wipSummary?.overdueReturns },
    ],
    "Purchasing": purchasingNav,
    "Dispatch & Billing": dispatchBillingNav,
    "Master Data": masterDataNav,
    "Reports": reportsNav,
    "Quality & Compliance": [
      { title: "Serial Numbers", url: "/serial-numbers", icon: Hash },
      { title: "FAT Certificates", url: "/fat-certificates", icon: ClipboardCheck, badge: fatStats?.pending },
      { title: "Warranty Tracker", url: "/warranty-tracker", icon: Shield, badge: serialStats?.expiringSoon },
    ],
    "Settings": settingsNav,
  };

  const dailyWorkOpen = collapsed || groupOpen["Daily Work"];
  const qualityOpen   = collapsed || groupOpen["Quality & Compliance"];

  // Rail mode content
  const railContent = (
    <SidebarContent>
      <div className="flex flex-col items-center py-2 gap-0.5">
        {ALL_GROUP_NAMES.map((groupName) => {
          const GroupIcon = GROUP_ICONS[groupName] ?? LayoutDashboard;
          const active = isGroupActive(groupName);
          const hovered = hoveredGroup === groupName;
          return (
            <div
              key={groupName}
              className={`flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer transition-all ${
                active ? "bg-blue-900/40 text-white" :
                hovered ? "bg-white/10 text-white" :
                "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
              onMouseEnter={(e) => handleGroupEnter(groupName, e)}
              onMouseLeave={handleGroupLeave}
              title={groupName}
            >
              <GroupIcon className="h-[18px] w-[18px]" />
            </div>
          );
        })}
      </div>
    </SidebarContent>
  );

  // Full sidebar content
  const fullContent = (
    <SidebarContent>
      <NavGroup
        label="Start Here"
        items={startHereNav}
        collapsed={collapsed}
        isActive={isActive}
        open={groupOpen["Start Here"]}
        onToggle={() => toggleGroup("Start Here")}
      />

      {/* Daily Work — inline with WIP badge */}
      <SidebarGroup>
        {!collapsed && (
          <SidebarGroupLabel
            className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold cursor-pointer flex items-center justify-between hover:text-slate-300 transition-colors select-none"
            onClick={() => toggleGroup("Daily Work")}
          >
            Daily Work
            {groupOpen["Daily Work"] ? (
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
            )}
          </SidebarGroupLabel>
        )}
        {dailyWorkOpen && (
          <SidebarGroupContent>
            <SidebarMenu>
              {dailyWorkNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {/* WIP Register with overdue badge */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/wip-register")}>
                  <NavLink
                    to="/wip-register"
                    className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between">
                        WIP Register
                        {wipSummary && wipSummary.overdueReturns > 0 && (
                          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {wipSummary.overdueReturns}
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && wipSummary && wipSummary.overdueReturns > 0 && (
                      <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        )}
      </SidebarGroup>

      <NavGroup
        label="Purchasing"
        items={purchasingNav}
        collapsed={collapsed}
        isActive={isActive}
        open={groupOpen["Purchasing"]}
        onToggle={() => toggleGroup("Purchasing")}
      />
      <NavGroup
        label="Dispatch & Billing"
        items={dispatchBillingNav}
        collapsed={collapsed}
        isActive={isActive}
        open={groupOpen["Dispatch & Billing"]}
        onToggle={() => toggleGroup("Dispatch & Billing")}
      />
      <NavGroup
        label="Master Data"
        items={masterDataNav}
        collapsed={collapsed}
        isActive={isActive}
        open={groupOpen["Master Data"]}
        onToggle={() => toggleGroup("Master Data")}
      />
      <NavGroup
        label="Reports"
        items={reportsNav}
        collapsed={collapsed}
        isActive={isActive}
        open={groupOpen["Reports"]}
        onToggle={() => toggleGroup("Reports")}
      />

      {/* Quality & Compliance — inline with FAT + Warranty badges */}
      <SidebarGroup>
        {!collapsed && (
          <SidebarGroupLabel
            className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold cursor-pointer flex items-center justify-between hover:text-slate-300 transition-colors select-none"
            onClick={() => toggleGroup("Quality & Compliance")}
          >
            Quality &amp; Compliance
            {groupOpen["Quality & Compliance"] ? (
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
            )}
          </SidebarGroupLabel>
        )}
        {qualityOpen && (
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/serial-numbers")}>
                  <NavLink
                    to="/serial-numbers"
                    className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                  >
                    <Hash className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Serial Numbers</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* FAT Certificates with pending badge */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/fat-certificates")}>
                  <NavLink
                    to="/fat-certificates"
                    className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                  >
                    <ClipboardCheck className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between">
                        FAT Certificates
                        {fatStats && fatStats.pending > 0 && (
                          <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {fatStats.pending}
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && fatStats && fatStats.pending > 0 && (
                      <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-amber-500" />
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Warranty Tracker with expiring soon badge */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/warranty-tracker")}>
                  <NavLink
                    to="/warranty-tracker"
                    className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                  >
                    <Shield className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between">
                        Warranty Tracker
                        {serialStats && serialStats.expiringSoon > 0 && (
                          <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {serialStats.expiringSoon}
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && serialStats && serialStats.expiringSoon > 0 && (
                      <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-amber-500" />
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        )}
      </SidebarGroup>

      <NavGroup
        label="Settings"
        items={settingsNav}
        collapsed={collapsed}
        isActive={isActive}
        open={groupOpen["Settings"]}
        onToggle={() => toggleGroup("Settings")}
      />
    </SidebarContent>
  );

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-r-0 transition-all duration-200"
        style={railMode ? { "--sidebar-width-icon": "4rem" } as React.CSSProperties : undefined}
      >
        <SidebarHeader className="px-4 py-5">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shadow-sm">
                <span className="font-bold text-sm text-white">B</span>
              </div>
              <span className="font-bold text-lg text-sidebar-foreground tracking-tight">
                BizDocs
              </span>
            </div>
          )}
          {collapsed && (
            <div className="h-8 w-8 rounded bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center mx-auto shadow-sm">
              <span className="font-bold text-sm text-white">B</span>
            </div>
          )}
        </SidebarHeader>

        {railMode && collapsed ? railContent : fullContent}

        <SidebarFooter className="px-4 py-3">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <p className="text-slate-500 text-xs font-mono">FY 2025–26</p>
            )}
            <button
              onClick={toggleRailMode}
              title={railMode ? "Expand sidebar" : "Switch to icon rail"}
              className={`flex items-center justify-center h-7 w-7 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors ${collapsed ? "mx-auto" : ""}`}
            >
              {railMode ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Rail mode flyout — rendered into document.body via portal to escape any stacking context */}
      {railMode && collapsed && hoveredGroup && createPortal(
        <div
          style={{
            position: "fixed",
            left: 64,
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
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, padding: "12px 12px 6px", color: "#94a3b8", borderBottom: "1px solid rgba(100,116,139,0.3)" }}>
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
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
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
