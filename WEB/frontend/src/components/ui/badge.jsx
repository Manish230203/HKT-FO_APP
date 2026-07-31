import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline:
          "text-foreground border-border bg-background hover:bg-muted/60 transition-colors",
        success:
          "border-status-active/20 bg-status-active/10 text-status-active hover:bg-status-active/15 transition-colors",
        warning:
          "border-status-warning/20 bg-status-warning/10 text-status-warning hover:bg-status-warning/15 transition-colors",
        danger:
          "border-status-critical/20 bg-status-critical/10 text-status-critical hover:bg-status-critical/15 transition-colors",
        info: "border-status-info/20 bg-status-info/10 text-status-info hover:bg-status-info/15 transition-colors",
        draft:
          "border-muted-foreground/20 bg-muted text-muted-foreground hover:bg-muted/80 transition-colors",
        interactive:
          "cursor-pointer transition-all duration-200 border border-slate-300/90 bg-white hover:bg-sky-500 hover:border-sky-500 hover:text-white text-slate-700 font-semibold shadow-sm hover:shadow active:scale-[0.97] dark:bg-slate-900/60 dark:border-sky-500/40 dark:text-sky-400 dark:hover:bg-sky-500/20 dark:hover:border-sky-400 dark:hover:text-sky-300 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] dark:hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
