import GRNForm from "@/pages/GRNForm";

/**
 * DcGrnForm — renders GRNForm with grn_type pre-set to 'dc_grn'.
 * Used for /dc-grn/new and /dc-grn/:id routes.
 */
export default function DcGrnForm() {
  return <GRNForm defaultGrnType="dc_grn" />;
}
