import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground hover:bg-muted/10 hover:border-border/80 focus-visible:bg-background focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/80 aria-invalid:focus-visible:ring-destructive/10 aria-invalid:hover:border-destructive/90 transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };