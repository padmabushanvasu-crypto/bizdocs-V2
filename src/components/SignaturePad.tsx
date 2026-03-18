import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Pen, Type, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { useToast } from "@/hooks/use-toast";

interface SignaturePadProps {
  currentSignatureUrl: string | null;
  onSignatureSaved: (url: string | null) => void;
  label?: string;
  storagePath?: string; // e.g. "default" or a document-specific id
}

const CURSIVE_FONTS = [
  "'Dancing Script', cursive",
  "'Great Vibes', cursive",
  "'Pacifico', cursive",
  "'Caveat', cursive",
];

export function SignaturePad({
  currentSignatureUrl,
  onSignatureSaved,
  label = "Signature",
  storagePath = "default",
}: SignaturePadProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"upload" | "draw" | "type">("upload");
  const [uploading, setUploading] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Load Google Fonts for typed signatures
  useEffect(() => {
    const link = document.getElementById("sig-fonts") as HTMLLinkElement | null;
    if (!link) {
      const el = document.createElement("link");
      el.id = "sig-fonts";
      el.rel = "stylesheet";
      el.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Pacifico&family=Caveat:wght@700&display=swap";
      document.head.appendChild(el);
    }
  }, []);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasDrawn(false);
  }, []);

  useEffect(() => {
    if (mode === "draw") {
      setTimeout(initCanvas, 50);
    }
  }, [mode, initCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDraw = () => setIsDrawing(false);

  const uploadToStorage = async (blob: Blob, filename: string) => {
    setUploading(true);
    try {
      const companyId = await getCompanyId();
      const path = `${companyId}/signatures/${storagePath}-${filename}`;
      const { error } = await supabase.storage
        .from("company-assets")
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw error;
      const url = supabase.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
      onSignatureSaved(url);
      toast({ title: "Signature saved" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      toast({ title: "Invalid format", description: "PNG or JPG only", variant: "destructive" });
      return;
    }
    await uploadToStorage(file, `upload.${file.name.split(".").pop()}`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const saveDrawnSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await uploadToStorage(blob, "drawn.png");
    }, "image/png");
  };

  const saveTypedSignature = async () => {
    if (!typedName.trim()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 120);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `bold 40px ${selectedFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, 200, 60);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await uploadToStorage(blob, "typed.png");
    }, "image/png");
  };

  const clearSignature = () => {
    onSignatureSaved(null);
    toast({ title: "Signature cleared" });
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium leading-none">{label}</label>

      {currentSignatureUrl ? (
        <div className="space-y-2">
          <div className="border border-border rounded-md p-3 bg-background inline-block">
            <img
              src={currentSignatureUrl}
              alt="Signature"
              className="h-16 max-w-[200px] object-contain"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onSignatureSaved(null)}>
              <X className="h-3.5 w-3.5 mr-1" /> Change
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={clearSignature}>
              <X className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full max-w-md">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="upload" className="text-xs gap-1"><Upload className="h-3.5 w-3.5" /> Upload</TabsTrigger>
            <TabsTrigger value="draw" className="text-xs gap-1"><Pen className="h-3.5 w-3.5" /> Draw</TabsTrigger>
            <TabsTrigger value="type" className="text-xs gap-1"><Type className="h-3.5 w-3.5" /> Type</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploading ? "Uploading..." : "Click to upload signature image"}
              </span>
              <span className="text-xs text-muted-foreground">PNG, JPG • Max 2MB</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileUpload}
            />
          </TabsContent>

          <TabsContent value="draw" className="mt-3 space-y-2">
            <div className="border border-border rounded-lg overflow-hidden bg-background">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full cursor-crosshair touch-none"
                style={{ maxHeight: "150px" }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={initCanvas}>Clear</Button>
              <Button
                size="sm"
                disabled={!hasDrawn || uploading}
                onClick={saveDrawnSignature}
              >
                <Check className="h-3.5 w-3.5 mr-1" /> {uploading ? "Saving..." : "Save"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="type" className="mt-3 space-y-3">
            <Input
              placeholder="Type your name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
            />
            {typedName && (
              <div className="space-y-2">
                {CURSIVE_FONTS.map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => setSelectedFont(font)}
                    className={`w-full p-3 border rounded-md text-left text-2xl transition-colors ${
                      selectedFont === font
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                    style={{ fontFamily: font }}
                  >
                    {typedName}
                  </button>
                ))}
              </div>
            )}
            <Button
              size="sm"
              disabled={!typedName.trim() || uploading}
              onClick={saveTypedSignature}
            >
              <Check className="h-3.5 w-3.5 mr-1" /> {uploading ? "Saving..." : "Save Signature"}
            </Button>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
