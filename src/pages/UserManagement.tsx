import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, ChevronLeft, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import type { AppRole } from "@/lib/role-access";

// last_sign_in_at lives on auth.users, not on the profiles table.
// Profiles columns: id, full_name, display_name, email, role, company_id,
//                   is_active, tour_completed, created_at, updated_at
interface ProfileRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "admin",         label: "Admin" },
  { value: "purchase_team", label: "Purchase Team" },
  { value: "inward_team",   label: "Inward Team" },
  { value: "qc_team",       label: "QC Team" },
  { value: "storekeeper",   label: "Storekeeper" },
  { value: "assembly_team", label: "Assembly Team" },
  { value: "finance",       label: "Finance" },
];

async function fetchProfiles(): Promise<ProfileRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, display_name, email, role, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function displayName(profile: ProfileRow): string {
  return profile.display_name || profile.full_name || profile.email || "—";
}

export default function UserManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [pendingRoles, setPendingRoles] = useState<Record<string, AppRole>>({});

  const {
    data: profiles = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["user-management-profiles"],
    queryFn: fetchProfiles,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ role })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_, { userId }) => {
      toast({ title: "Role updated successfully" });
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["user-management-profiles"] });
    },
    onError: () => {
      toast({ title: "Failed to update role", variant: "destructive" });
    },
  });

  const handleRoleChange = (
    userId: string,
    originalRole: string | null,
    newRole: AppRole,
  ) => {
    if (newRole === originalRole) {
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } else {
      setPendingRoles((prev) => ({ ...prev, [userId]: newRole }));
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Settings
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-6 w-6" /> User Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage team members and their roles</p>
        </div>
      </div>

      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 w-fit">
        To invite new users, use the Supabase dashboard.
      </p>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">
                  Name
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">
                  Email
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">
                  Role
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-3 py-3 border-b border-slate-100">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-3 py-3 border-b border-slate-100">
                        <Skeleton className="h-4 w-48" />
                      </td>
                      <td className="px-3 py-3 border-b border-slate-100">
                        <Skeleton className="h-8 w-36" />
                      </td>
                      <td className="px-3 py-3 border-b border-slate-100">
                        <Skeleton className="h-8 w-14 mx-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle className="h-8 w-8 text-red-400" />
                      <p className="text-sm text-slate-600 font-medium">
                        Failed to load team members
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        className="gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium text-sm">
                      No team members found
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      To invite new users, use the Supabase dashboard.
                    </p>
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => {
                  const isCurrentUser = profile.id === user?.id;
                  const pendingRole = pendingRoles[profile.id];
                  const hasChanged = !!pendingRole;
                  const roleValue = pendingRole ?? profile.role ?? "admin";

                  return (
                    <tr
                      key={profile.id}
                      className={`transition-colors ${
                        hasChanged
                          ? "bg-amber-50"
                          : isCurrentUser
                          ? "bg-blue-50/40"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      {/* Name — left accent border indicates pending change */}
                      <td
                        className={`px-3 py-2.5 border-b border-slate-100 border-l-2 ${
                          hasChanged ? "border-l-amber-400" : "border-l-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">
                            {displayName(profile)}
                          </span>
                          {isCurrentUser && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 leading-none"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 border-b border-slate-100 text-sm text-slate-600">
                        {profile.email || "—"}
                      </td>

                      <td className="px-3 py-2.5 border-b border-slate-100">
                        {isCurrentUser ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-36">
                                <Select disabled value={roleValue}>
                                  <SelectTrigger className="h-8 text-xs opacity-60 cursor-not-allowed">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ROLE_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Cannot change your own role</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="w-36">
                            <Select
                              value={roleValue}
                              onValueChange={(val) =>
                                handleRoleChange(profile.id, profile.role, val as AppRole)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2.5 border-b border-slate-100 text-center">
                        {hasChanged && (
                          <Button
                            size="sm"
                            className="h-7 text-xs px-3"
                            disabled={updateRoleMutation.isPending}
                            onClick={() =>
                              updateRoleMutation.mutate({
                                userId: profile.id,
                                role: pendingRole,
                              })
                            }
                          >
                            Save
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
