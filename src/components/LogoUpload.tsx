import { useState, useRef } from "react";
import { Upload, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCompanyId } from "@/lib/auth-helpers";

interface LogoUploadProps {
  currentLogoPath: string | null;
  onUploaded: (path: string | null) => void;
}

export function LogoUpload({ currentLogoPath, onUploaded }: LogoUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const logoUrl = currentLogoPath
    ? supabase.storage.from("company-assets").getPublicUrl(currentLogoPath).data.publicUrl
    : null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 2MB allowed", variant: "destructive" });
      return;
    }

    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      toast({ title: "Invalid format", description: "Only PNG, JPG, SVG allowed", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const companyId = await getCompanyId();
      const ext = file.name.split(".").pop();
      const path = `${companyId}/logo.${ext}`;

      // Remove old logo if exists
      if (currentLogoPath) {
        await supabase.storage.from("company-assets").remove([currentLogoPath]);
      }

      const { error } = await supabase.storage
        .from("company-assets")
        .upload(path, file, { upsert: true });

      if (error) throw error;
      onUploaded(path);
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!currentLogoPath) return;
    try {
      await supabase.storage.from("company-assets").remove([currentLogoPath]);
      onUploaded(null);
      toast({ title: "Logo removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium leading-none">Company Logo</label>
      {logoUrl ? (
        <div className="flex items-center gap-4">
          <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain border border-border rounded-md p-1" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Replace
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={handleRemove}>
              <X className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full max-w-xs border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors cursor-pointer"
        >
          <Image className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {uploading ? "Uploading..." : "Click to upload logo"}
          </span>
          <span className="text-xs text-muted-foreground">PNG, JPG, SVG • Max 2MB</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
