import type * as React from "react";

import { cn } from "@/lib/utils";

const variants = {
  default: "bg-foreground text-background",
  muted: "bg-muted text-muted-foreground",
  outline: "border border-border text-foreground",
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: keyof typeof variants;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
