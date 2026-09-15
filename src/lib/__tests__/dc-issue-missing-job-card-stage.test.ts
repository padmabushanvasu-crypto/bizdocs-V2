import { describe, it, expect } from "vitest";

// Regression test for the DeliveryChallanDetail.tsx "Issue" action bug:
// issuing an existing draft DC (issueDeliveryChallan -> rpc_issue_dc_plain_lines)
// had no client-side check for a job-card-linked line missing step_number.
// DeliveryChallanForm.tsx already had this exact guard for its own
// submit-as-issued path, but it was specific to that form's in-memory state
// (lineNewJobCardId / lineNewStepNumber Maps) and wasn't shared with the
// detail page's separate Issue action, which reads persisted dc_line_items
// rows instead.
//
// Verified live: DC-26-27/1066 (id 33fc15a2-3a14-44c4-967d-d5f2152a3ff1),
// line item id d6a5b2d1-0f11-4464-be81-b2436bc1a1f8, job_card_id
// 038f5525-4832-4b9c-8ea9-5d01b5269519 (JW-26-27/505), step_number NULL —
// the Issue button had no guard against this and would hit a raw RPC
// exception instead of a clear, actionable message.

import { isJobCardLineMissingStage, findLinesMissingJobCardStage } from "@/lib/delivery-challans-api";

describe("isJobCardLineMissingStage", () => {
  it("flags a job-card line with no stage resolved", () => {
    expect(isJobCardLineMissingStage("038f5525-4832-4b9c-8ea9-5d01b5269519", null)).toBe(true);
    expect(isJobCardLineMissingStage("038f5525-4832-4b9c-8ea9-5d01b5269519", undefined)).toBe(true);
  });

  it("does not flag a job-card line with a stage resolved", () => {
    expect(isJobCardLineMissingStage("038f5525-4832-4b9c-8ea9-5d01b5269519", 1)).toBe(false);
  });

  it("does not flag a plain line (no job card) regardless of step_number", () => {
    expect(isJobCardLineMissingStage(null, null)).toBe(false);
    expect(isJobCardLineMissingStage(undefined, undefined)).toBe(false);
  });
});

describe("findLinesMissingJobCardStage — DC-26-27/1066 reproduction", () => {
  it("returns the offending line for a DC with one job-card-linked line missing a stage", () => {
    const lineItems = [
      {
        id: "d6a5b2d1-0f11-4464-be81-b2436bc1a1f8",
        serial_number: 1,
        description: "230046 — Turning",
        job_card_id: "038f5525-4832-4b9c-8ea9-5d01b5269519",
        step_number: null,
      },
      {
        id: "other-line",
        serial_number: 2,
        description: "Plain line, no job card",
        job_card_id: null,
        step_number: null,
      },
    ];

    const missing = findLinesMissingJobCardStage(lineItems);

    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe("d6a5b2d1-0f11-4464-be81-b2436bc1a1f8");
  });

  it("returns an empty array once every job-card line has a stage", () => {
    const lineItems = [
      { id: "line-1", serial_number: 1, description: "x", job_card_id: "jc-1", step_number: 1 },
      { id: "line-2", serial_number: 2, description: "y", job_card_id: null, step_number: null },
    ];

    expect(findLinesMissingJobCardStage(lineItems)).toEqual([]);
  });
});
