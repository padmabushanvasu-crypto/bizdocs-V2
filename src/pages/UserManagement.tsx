import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, ChevronLeft, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/role-access";

interface ProfileRow {
  id: string;
  full_name: string | null;
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

function displayName(profile: ProfileRow): string {
  return profile.full_name || profile.email || "—";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function UserManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Table state ────────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | false>(false);
  const [pendingRoles, setPendingRoles] = useState<Record<string, AppRole>>({});

  // ── Add member form state ──────────────────────────────────────────────────
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<AppRole | "">("");
  const [addValidationError, setAddValidationError] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const loadUsers = useCallback(async () => {
    console.log("fetching users...");
    setIsLoading(true);
    setFetchError(false);

    await supabase.auth.getUser(); // refreshes the session if token is expiring
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    console.log("session:", session ? "found" : "null");
    console.log("accessToken:", accessToken ? accessToken.substring(0, 20) : "null");

    if (!accessToken) {
      console.warn("No access token — cannot fetch users");
      setFetchError("Failed to load team members");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-company-users`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("response status:", response.status);
      const text = await response.text();
      console.log("response body:", text);
      const { users } = JSON.parse(text);
      setProfiles(users ?? []);
    } catch (err) {
      console.error("fetch error:", err);
      setFetchError("Failed to load team members");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ── Validate add-member form ───────────────────────────────────────────────
  const validateAddForm = (): boolean => {
    if (!addEmail.trim() || !isValidEmail(addEmail)) {
      setAddValidationError("Enter a valid email address.");
      return false;
    }
    if (!addRole) {
      setAddValidationError("Select a role.");
      return false;
    }
    setAddValidationError("");
    return true;
  };

  // ── Assign Role (existing user) ────────────────────────────────────────────
  const handleAssignRole = async () => {
    if (!validateAddForm()) return;
    setIsAssigning(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assign-member`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
        },
      );

      const body = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        const msg = body.error ?? "Failed to assign role";
        if (msg.toLowerCase().includes("not found")) {
          toast({
            title: "No account found for this email. Use Send Invite instead.",
            variant: "destructive",
          });
        } else {
          toast({ title: msg, variant: "destructive" });
        }
        return;
      }

      toast({ title: "Role assigned successfully" });
      setAddEmail("");
      setAddRole("");
      loadUsers();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to assign role", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  // ── Send Invite (new user) ─────────────────────────────────────────────────
  const handleSendInvite = async () => {
    if (!validateAddForm()) return;
    setIsInviting(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
        },
      );

      const body = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        const msg = body.error ?? "Failed to send invite";
        if (msg.toLowerCase().includes("already registered")) {
          toast({
            title: "This email already has an account. Use Assign Role instead.",
            variant: "destructive",
          });
        } else {
          toast({ title: msg, variant: "destructive" });
        }
        return;
      }

      toast({ title: `Invite sent to ${addEmail.trim()}` });
      setAddEmail("");
      setAddRole("");
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to send invite", variant: "destructive" });
    } finally {
      setIsInviting(false);
    }
  };

  // ── Existing-user role update (table) ─────────────────────────────────────
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
      loadUsers();
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

  const anyActionLoading = isAssigning || isInviting;

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

      {/* ── Add Team Member card ── */}
      <div className="paper-card space-y-3">
        <p className="text-sm font-semibold text-slate-800">Add Team Member</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <Input
              type="email"
              placeholder="Enter email address"
              value={addEmail}
              onChange={(e) => {
                setAddEmail(e.target.value);
                if (addValidationError) setAddValidationError("");
              }}
              className="h-9 text-sm"
            />
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={addRole}
              onValueChange={(val) => {
                setAddRole(val as AppRole);
                if (addValidationError) setAddValidationError("");
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select role" />
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

          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="h-9 px-4 text-sm"
              disabled={anyActionLoading}
              onClick={handleAssignRole}
            >
              {isAssigning && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Assign Role
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 text-sm"
              disabled={anyActionLoading}
              onClick={handleSendInvite}
            >
              {isInviting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Send Invite
            </Button>
          </div>
        </div>

        {addValidationError && (
          <p className="text-xs text-red-500">{addValidationError}</p>
        )}

        <p className="text-xs text-slate-400">
          Use Send Invite for new users or Assign Role for existing BizDocs users.
        </p>
      </div>

      {/* ── Team members table ── */}
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
              ) : fetchError ? (
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
                        onClick={loadUsers}
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
                      Use Send Invite for new users or Assign Role for existing BizDocs users.
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
