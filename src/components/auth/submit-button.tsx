import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  loading: boolean;
  children: React.ReactNode;
  loadingText: string;
}

export function SubmitButton({ loading, children, loadingText }: SubmitButtonProps) {
  return (
    <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
