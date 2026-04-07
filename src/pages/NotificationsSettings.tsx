import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Save, X, ChevronLeft, UserCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  savePOEmailSettingsToDB,
  type NotificationSettings,
} from "@/lib/settings-api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULTS: NotificationSettings = {
  stock_alert_enabled: false,
  stock_alert_time: "09:00",
  global_min_stock_default: 10,
  warning_threshold_pct: 10,
  stock_alert_recipients: [],
  weekly_summary_enabled: false,
  weekly_summary_day: "Monday",
  weekly_summary_time: "08:00",
  weekly_summary_recipients: [],
  po_email_enabled: true,
  po_email_recipients: [],
  stock_editor_names: [],
};

// ── Email Tag Input ───────────────────────────────────────────────────────────

function EmailTagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const email = draft.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !value.includes(email)) {
      onChange([...value, email]);
    }
    setDraft("");
  };

  const remove = (email: string) => onChange(value.filter((e) => e !== email));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          placeholder={placeholder ?? "email@example.com — press Enter to add"}
          className="h-9 text-sm"
        />
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={add}>
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-xs px-2.5 py-0.5"
            >
              {email}
              <button
                type="button"
                onClick={() => remove(email)}
                className="text-blue-500 hover:text-blue-800 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stock Editors Section ─────────────────────────────────────────────────────

function StockEditorsSection({
  names,
  onChange,
}: {
  names: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const add = () => {
    const name = draft.trim();
    if (!name) { setError("Name cannot be blank"); return; }
    if (names.map(n => n.toLowerCase()).includes(name.toLowerCase())) {
      setError("Name already exists");
      return;
    }
    onChange([...names, name]);
    setDraft("");
    setError("");
  };

  const remove = (name: string) => onChange(names.filter(n => n !== name));

  return (
    <div className="paper-card space-y-4">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-slate-600" />
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Stock Editor Names</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            These names appear in the Opening Stock edit dialog. Anyone editing stock must select their name.
          </p>
        </div>
      </div>

      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.map(name => (
            <span
              key={name}
              className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs px-2.5 py-0.5"
            >
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Enter a name — press Enter to add"
            className="h-9 text-sm"
          />
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NotificationsSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotificationSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const set = (patch: Partial<NotificationSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveNotificationSettings(settings);
      await savePOEmailSettingsToDB(settings.po_email_enabled, settings.po_email_recipients);
      toast({ title: "Notification settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-slate-900">Notification Settings</h2>
      </div>

      {/* Section 1 — Daily Stock Alert */}
      <div className="paper-card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Daily Stock Alert Email</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Send an email when items fall below their minimum stock levels
            </p>
          </div>
          <Switch
            checked={settings.stock_alert_enabled}
            onCheckedChange={(v) => set({ stock_alert_enabled: v })}
          />
        </div>

        <div className={`space-y-4 ${!settings.stock_alert_enabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">Alert Time (HH:MM)</Label>
              <Input
                type="time"
                value={settings.stock_alert_time}
                onChange={(e) => set({ stock_alert_time: e.target.value })}
                className="h-9 text-sm w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">
                Global Minimum Stock Default
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Used for items without a specific minimum set
              </p>
              <Input
                type="number"
                min={0}
                value={settings.global_min_stock_default}
                onChange={(e) => set({ global_min_stock_default: parseInt(e.target.value) || 0 })}
                className="h-9 text-sm w-32"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Warning Threshold %</Label>
            <p className="text-[11px] text-muted-foreground">
              Alert when stock is within this % of the minimum level
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.warning_threshold_pct}
                onChange={(e) => set({ warning_threshold_pct: parseInt(e.target.value) || 0 })}
                className="h-9 text-sm w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Recipients</Label>
            <EmailTagInput
              value={settings.stock_alert_recipients}
              onChange={(v) => set({ stock_alert_recipients: v })}
              placeholder="Add recipient email — press Enter"
            />
          </div>
        </div>
      </div>

      {/* Section 2 — Weekly Business Summary */}
      <div className="paper-card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Weekly Business Summary Email</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Send a weekly summary of key metrics to owners and managers
            </p>
          </div>
          <Switch
            checked={settings.weekly_summary_enabled}
            onCheckedChange={(v) => set({ weekly_summary_enabled: v })}
          />
        </div>

        <div className={`space-y-4 ${!settings.weekly_summary_enabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">Day of Week</Label>
              <Select
                value={settings.weekly_summary_day}
                onValueChange={(v) => set({ weekly_summary_day: v })}
              >
                <SelectTrigger className="h-9 text-sm w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">Send Time (HH:MM)</Label>
              <Input
                type="time"
                value={settings.weekly_summary_time}
                onChange={(e) => set({ weekly_summary_time: e.target.value })}
                className="h-9 text-sm w-32"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Recipients</Label>
            <EmailTagInput
              value={settings.weekly_summary_recipients}
              onChange={(v) => set({ weekly_summary_recipients: v })}
              placeholder="Owner/manager emails — press Enter"
            />
          </div>
        </div>
      </div>

      {/* Section 3 — Weekly PO Summary Email */}
      <div className="paper-card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Weekly PO Summary Email</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Every Monday at 8:00 AM — 3-sheet report: last week's POs, open POs, overdue POs
            </p>
          </div>
          <Switch
            checked={settings.po_email_enabled}
            onCheckedChange={(v) => set({ po_email_enabled: v })}
          />
        </div>

        <div className={`space-y-4 ${!settings.po_email_enabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground font-medium">Send Day</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">Monday</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground font-medium">Send Time</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">8:00 AM IST</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Purchase Team Recipients</Label>
            <EmailTagInput
              value={settings.po_email_recipients}
              onChange={(v) => set({ po_email_recipients: v })}
              placeholder="Purchase team emails — press Enter"
            />
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700 space-y-0.5">
            <p className="font-semibold">Report includes:</p>
            <p>Sheet 1 — POs raised last week with totals</p>
            <p>Sheet 2 — Open POs with due date alerts (amber: due in 7 days, red: overdue)</p>
            <p>Sheet 3 — All overdue POs sorted by days overdue</p>
          </div>
        </div>
      </div>

      {/* Section 4 — Stock Editors */}
      <StockEditorsSection
        names={settings.stock_editor_names ?? []}
        onChange={(names) => set({ stock_editor_names: names })}
      />

      {/* Save */}
      <div className="space-y-2">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save Notification Settings"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Emails are sent via scheduled Supabase Edge Functions. See the deployment guide for setup
          instructions.
        </p>
      </div>
    </div>
  );
}
