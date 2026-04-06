import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS } from "@/lib/roles";
import type { AppRole } from "@/lib/roles";

async function fetchCompanyUsers(companyId: string) {
  const { data } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, display_name, email, role, is_active, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function updateUserRole(userId: string, role: string) {
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

async function toggleUserActive(userId: string, is_active: boolean) {
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ is_active })
    .eq("id", userId);
  if (error) throw error;
}

async function inviteUser(email: string, _displayName: string, _role: string, _companyId: string) {
  const { data, error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  return data;
}

export default function UserManagement() {
  const { companyId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>('admin');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: () => fetchCompanyUsers(companyId!),
    enabled: !!companyId,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users", companyId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, is_active }: { userId: string; is_active: boolean }) =>
      toggleUserActive(userId, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users", companyId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteUser(inviteEmail, inviteName, inviteRole, companyId!),
    onSuccess: () => {
      toast({ title: `Invitation sent to ${inviteEmail}` });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole('admin');
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invitation", description: err.message, variant: "destructive" });
    },
  });

  const roleKeys = Object.keys(ROLE_LABELS) as AppRole[];

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Users and Roles</h1>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading users...</p>}

      {!isLoading && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Name</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Email</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Role</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u: any) => {
                const isSelf = u.id === user?.id;
                const name = u.display_name || u.full_name || "—";
                return (
                  <tr key={u.id} className="bg-white hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{name}</span>
                        {isSelf && (
                          <Badge className="text-[10px] bg-blue-100 text-blue-800">You</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <Select
                        value={u.role ?? 'admin'}
                        onValueChange={(val) =>
                          roleMutation.mutate({ userId: u.id, role: val })
                        }
                        disabled={isSelf}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleKeys.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      <Switch
                        checked={u.is_active !== false}
                        onCheckedChange={(checked) =>
                          activeMutation.mutate({ userId: u.id, is_active: checked })
                        }
                        disabled={isSelf}
                      />
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                    No data found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Display Name</Label>
              <Input
                id="invite-name"
                placeholder="e.g. Ravi Kumar"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleKeys.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
              An email invitation will be sent. The user will set their own password. Role can be updated after they first log in.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
