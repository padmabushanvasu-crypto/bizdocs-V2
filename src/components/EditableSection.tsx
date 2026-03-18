import { ReactNode } from "react";
import { Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface EditableSectionProps {
  children: ReactNode;
  onEdit?: () => void;
  className?: string;
  label?: string;
  editable?: boolean;
}

export function EditableSection({ children, onEdit, className, label = "Click to edit", editable = true }: EditableSectionProps) {
  if (!editable || !onEdit) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "group relative rounded-lg transition-all cursor-pointer",
            "hover:ring-2 hover:ring-primary/20 hover:bg-primary/[0.02]",
            className
          )}
          onClick={onEdit}
        >
          {children}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm">
              <Edit className="h-2.5 w-2.5" />
              {label}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
