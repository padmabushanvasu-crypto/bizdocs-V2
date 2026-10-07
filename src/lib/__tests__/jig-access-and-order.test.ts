import { describe, it, expect } from "vitest";
import { getRoleAccess, type AppRole } from "@/lib/role-access";
import { compareCustody, type JigCustodyRow } from "@/lib/jig-custody-api";

const ROLES: AppRole[] = ["admin", "finance", "purchase_team", "inward_team", "qc_team", "storekeeper", "assembly_team"];

describe("jig page access", () => {
  it("jig-tracker is view-only and visible to every role", () => {
    for (const role of ROLES) {
      expect(getRoleAccess(role, "jig-tracker").canView).toBe(true);
    }
    for (const role of ROLES.filter((r) => r !== "admin" && r !== "finance")) {
      expect(getRoleAccess(role, "jig-tracker").canEdit).toBe(false);
    }
  });

  it("jig-approvals is admin/finance only", () => {
    for (const role of ROLES) {
      expect(getRoleAccess(role, "jig-approvals").canView).toBe(role === "admin" || role === "finance");
    }
  });
});

describe("jig tracker ordering", () => {
  const r = (id: string, custody_status: any, days_out: number) => ({ dc_jig_id: id, custody_status, days_out } as JigCustodyRow);

  it("red (job closed, jig not returned) first, then Finance, work pending, written off, returned; longest out first within a status", () => {
    const rows = [
      r("returned", "returned", 90),
      r("wo", "written_off", 40),
      r("pending-short", "with_vendor_work_pending", 3),
      r("pending-long", "with_vendor_work_pending", 30),
      r("fin", "write_off_pending_finance", 10),
      r("red-short", "with_vendor_job_closed", 5),
      r("red-long", "with_vendor_job_closed", 50),
    ];
    expect(rows.sort(compareCustody).map((x) => x.dc_jig_id)).toEqual([
      "red-long", "red-short", "fin", "pending-long", "pending-short", "wo", "returned",
    ]);
  });
});
