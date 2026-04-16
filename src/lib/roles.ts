export type AppRole =
  | 'admin'
  | 'finance'
  | 'purchase_team'
  | 'inward_team'
  | 'qc_team'
  | 'storekeeper'
  | 'assembly_team';

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  finance: 'Finance',
  purchase_team: 'Purchase Team',
  inward_team: 'Inward Team',
  qc_team: 'QC Team',
  storekeeper: 'Storekeeper',
  assembly_team: 'Assembly Team',
};

// Roles that bypass the normal sidebar/dashboard and get a focused view
export const FOCUSED_ROLES: AppRole[] = ['qc_team', 'storekeeper', 'assembly_team'];

export const FOCUSED_ROLE_REDIRECT: Record<string, string> = {
  qc_team: '/qc-queue',
  storekeeper: '/storekeeper',
  assembly_team: '/sub-assembly-work-orders',
};

export const ROLE_PERMISSIONS = {
  admin: { allAccess: true },

  purchase_team: {
    canView: ['purchase_orders','grns','delivery_challans','dc_grn','parties','items','stock_register','reorder_alerts','open_items','gst_reports'],
    canCreate: ['purchase_orders','grns','dc_grn','delivery_challans'],
    canEdit: ['purchase_orders_draft','grns','dc_grn','delivery_challans_draft'],
    hidePricing: false,
    receivesPOEmail: true,
  },

  inward_team: {
    canView: ['grns_full','dc_grn_full'],
    canEdit: ['grn_stage1','dc_grn_stage1'],
    hidePricing: true,
    focusedView: 'grn_queue',
  },

  qc_team: {
    canView: ['grns_full','dc_grn_full'],
    canEdit: ['grn_stage2','dc_grn_stage2'],
    hidePricing: true,
    focusedView: 'qc_queue',
  },

  storekeeper: {
    canView: ['material_issue_requests'],
    canEdit: ['mir_issued_qty'],
    hidePricing: true,
    focusedView: 'storekeeper_queue',
  },

  assembly_team: {
    canView: ['assembly_work_orders','bom_view','stock_register_no_price','grns_no_price','wip_register','serial_numbers','fat_certificates'],
    canCreate: ['assembly_work_orders','serial_numbers','fat_certificates'],
    canEdit: ['assembly_work_orders_own','fat_certificates_own'],
    hidePricing: true,
  },
} as const;
