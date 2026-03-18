import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, type AuditEntry } from "@/lib/audit-api";
import {
  Clock,
  FileText,
  Edit,
  CheckCircle2,
  X,
  Package,
  CreditCard,
  Trash2,
  Factory,
  Truck,
  Pause,
  Play,
} from "lucide-react";

const actionIcons: Record<string, React.ElementType> = {
  // Legacy keys (used by other document types)
  created: FileText,
  edited: Edit,
  issued: CheckCircle2,
  cancelled: X,
  deleted: Trash2,
  receipt_recorded: Package,
  payment_recorded: CreditCard,
  return_recorded: Package,
  verified: CheckCircle2,
  sent: CheckCircle2,
  // Job Card actions
  "Job Card Created": FileText,
  "Internal Step Added": Factory,
  "External Job Work Added": Truck,
  "Step Updated": Edit,
  "Step Deleted": Trash2,
  "Return Recorded — Accepted": CheckCircle2,
  "Return Recorded — Partial": Package,
  "Return Recorded — Rejected": X,
  "Job Card Completed": CheckCircle2,
  "Placed On Hold": Pause,
  "Resumed": Play,
};

const actionColors: Record<string, string> = {
  // Legacy keys
  created: "text-muted-foreground",
  edited: "text-blue-600",
  issued: "text-blue-600",
  cancelled: "text-destructive",
  deleted: "text-destructive",
  receipt_recorded: "text-emerald-600",
  payment_recorded: "text-emerald-600",
  return_recorded: "text-amber-600",
  verified: "text-emerald-600",
  sent: "text-blue-600",
  // Job Card actions
  "Job Card Created": "text-muted-foreground",
  "Internal Step Added": "text-blue-600",
  "External Job Work Added": "text-amber-600",
  "Step Updated": "text-blue-600",
  "Step Deleted": "text-destructive",
  "Return Recorded — Accepted": "text-emerald-600",
  "Return Recorded — Partial": "text-amber-600",
  "Return Recorded — Rejected": "text-destructive",
  "Job Card Completed": "text-emerald-600",
  "Placed On Hold": "text-amber-600",
  "Resumed": "text-emerald-600",
};

function renderDetails(entry: AuditEntry) {
  const d = entry.details;
  if (!d || Object.keys(d).length === 0) return null;

  // Primary: show summary if present
  if (d.summary) {
    return <p className="text-xs text-muted-foreground mt-0.5">{d.summary}</p>;
  }

  // Fallback for legacy entries
  const parts: string[] = [];
  if (d.reason) parts.push(`Reason: ${d.reason}`);
  if (d.changed_fields) parts.push(`Fields: ${(d.changed_fields as string[]).join(", ")}`);
  if (parts.length === 0) return null;
  return <p className="text-xs text-muted-foreground mt-0.5">{parts.join(" · ")}</p>;
}

export function AuditTimeline({ documentId }: { documentId: string }) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit-log", documentId],
    queryFn: () => fetchAuditLog(documentId),
    enabled: !!documentId,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading audit trail...</p>;
  if (!entries || entries.length === 0) return null;

  return (
    <div className="paper-card">
      <h3 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-2 mb-4">
        Audit Trail
      </h3>
      <div className="space-y-4">
        {entries.map((entry) => {
          const Icon = actionIcons[entry.action] ?? Clock;
          const color = actionColors[entry.action] ?? "text-muted-foreground";
          return (
            <div key={entry.id} className="flex items-start gap-3">
              <div className={`mt-0.5 ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{entry.action}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {entry.user_name && ` · ${entry.user_name}`}
                  {!entry.user_name && entry.user_email && ` · ${entry.user_email}`}
                </p>
                {renderDetails(entry)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
