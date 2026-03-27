import BackgroundImportDialog from "@/components/BackgroundImportDialog";
import { importItemsBatch } from "@/lib/items-api";
import { ITEMS_IMPORT_CONFIG, ITEM_FIELD_MAP } from "@/lib/import-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ItemsImportDialog({ open, onOpenChange }: Props) {
  return (
    <BackgroundImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import Items"
      entityName="items"
      fieldMap={ITEM_FIELD_MAP}
      requiredFields={["description"]}
      importConfig={ITEMS_IMPORT_CONFIG}
      batchFn={importItemsBatch}
      invalidateKeys={[["items"]]}
    />
  );
}
