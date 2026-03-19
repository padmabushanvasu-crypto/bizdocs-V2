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
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchWipSummary } from "@/lib/job-cards-api";
import { fetchFatStats, fetchSerialStats } from "@/lib/fat-api";
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

const startHereNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Open Items", url: "/open-items", icon: ClipboardList },
];

const dailyWorkNav = [
  { title: "Job Cards", url: "/job-cards", icon: Activity },
  { title: "Assembly Orders", url: "/assembly-orders", icon: Layers },
];

const purchasingNav = [
  { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart },
  { title: "GRN", url: "/grn", icon: PackageCheck },
];

const dispatchBillingNav = [
  { title: "Delivery Challans", url: "/delivery-challans", icon: Truck },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Receipts", url: "/receipts", icon: Receipt },
];

const masterDataNav = [
  { title: "Parties", url: "/parties", icon: Users },
  { title: "Items", url: "/items", icon: Package },
  { title: "Bill of Materials", url: "/bill-of-materials", icon: GitFork },
  { title: "Stock Register", url: "/stock-register", icon: BarChart3 },
];

const reportsNav = [
  { title: "GST Reports", url: "/gst-reports", icon: FileSpreadsheet },
  { title: "Vendor Scorecards", url: "/vendor-scorecards", icon: Star },
  { title: "Stock Ledger", url: "/stock-ledger", icon: BookOpen },
];

const settingsNav = [
  { title: "Settings", url: "/settings", icon: Settings },
];

function NavGroup({
  label,
  items,
  collapsed,
  isActive,
}: {
  label: string;
  items: { title: string; url: string; icon: React.ComponentType<any> }[];
  collapsed: boolean;
  isActive: (path: string) => boolean;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
        {label}
      </SidebarGroupLabel>
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
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

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

  return (
    <Sidebar collapsible="icon" className="border-r-0">
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

      <SidebarContent>
        <NavGroup label="Start Here" items={startHereNav} collapsed={collapsed} isActive={isActive} />

        {/* Daily Work — includes WIP Register with badge */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
            Daily Work
          </SidebarGroupLabel>
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
        </SidebarGroup>

        <NavGroup label="Purchasing" items={purchasingNav} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Dispatch & Billing" items={dispatchBillingNav} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Master Data" items={masterDataNav} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Reports" items={reportsNav} collapsed={collapsed} isActive={isActive} />

        {/* Quality & Compliance — with FAT Pending + Expiring Soon badges */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
            Quality &amp; Compliance
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Serial Numbers */}
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
        </SidebarGroup>

        <NavGroup label="Settings" items={settingsNav} collapsed={collapsed} isActive={isActive} />
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        {!collapsed && (
          <p className="text-slate-500 text-xs font-mono">
            FY 2025–26
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
