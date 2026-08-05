import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground hover:bg-muted/10 hover:border-border/80 focus-visible:bg-background focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/80 aria-invalid:focus-visible:ring-destructive/10 aria-invalid:hover:border-destructive/90 transition-all duration-200",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };