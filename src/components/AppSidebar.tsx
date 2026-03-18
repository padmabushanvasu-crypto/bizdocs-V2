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
  GitBranch,
  AlertTriangle,
  Star,
  FileSpreadsheet,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchWipSummary } from "@/lib/job-cards-api";
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

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Open Items", url: "/open-items", icon: ClipboardList },
  { title: "Parties", url: "/parties", icon: Users },
  { title: "Items", url: "/items", icon: Package },
  { title: "Stock Register", url: "/stock-register", icon: BarChart3 },
];

const documentsNav = [
  { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart },
  { title: "Delivery Challans", url: "/delivery-challans", icon: Truck },
  { title: "GRN", url: "/grn", icon: PackageCheck },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Receipts", url: "/receipts", icon: Receipt },
  { title: "GST Reports", url: "/gst-reports", icon: FileSpreadsheet },
];

const operationsNav = [
  { title: "Job Cards", url: "/job-cards", icon: Activity },
  { title: "Stage Templates", url: "/stage-templates", icon: GitBranch },
];

const settingsNav = [
  { title: "Settings", url: "/settings", icon: Settings },
];

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
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
            Documents
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {documentsNav.map((item) => (
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationsNav.map((item) => (
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
              {/* Vendor Scorecards */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/vendor-scorecards")}>
                  <NavLink
                    to="/vendor-scorecards"
                    className="text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    activeClassName="text-white bg-blue-900/40 border-l-[3px] border-blue-500"
                  >
                    <Star className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Vendor Scorecards</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
            Configuration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => (
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
