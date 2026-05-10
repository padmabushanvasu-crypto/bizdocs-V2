import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

export default function CostMasterImport() {
  const { role } = useAuth();
  if (role !== "admin" && role !== "finance") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cost Master</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an Excel file to update standard cost across the items master.
          Other item fields are not changed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Upload Cost Master
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upload UI coming in next step.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
