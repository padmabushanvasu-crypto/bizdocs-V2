import { LayoutDashboard, FileText, Users, Package, MoreHorizontal } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Home", icon: LayoutDashboard, to: "/" },
  { label: "Parties", icon: Users, to: "/parties" },
  { label: "Invoices", icon: FileText, to: "/invoices" },
  { label: "Items", icon: Package, to: "/items" },
  { label: "More", icon: MoreHorizontal, to: "/more" },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground transition-colors",
                isActive && "text-primary"
              )
            }
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
