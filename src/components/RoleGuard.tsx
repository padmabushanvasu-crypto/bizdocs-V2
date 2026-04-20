import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ShieldX } from "lucide-react";

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { role } = useAuth();
  const navigate = useNavigate();

  if (role === 'admin' || (role !== null && allowedRoles.includes(role))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-sm p-6">
        <ShieldX className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this page. Contact your admin if you think this is a mistake.
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    </div>
  );
}
