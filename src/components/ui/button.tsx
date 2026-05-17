import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-10 px-4",
        icon: "size-10 p-0",
        sm: "h-9 px-3",
      },
      variant: {
        default:
          "bg-foreground text-background hover:bg-foreground/90 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200",
        ghost: "hover:bg-muted hover:text-foreground",
        outline:
          "border border-border bg-background hover:bg-muted hover:text-foreground",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
      },
    },
  },
);

export function Button({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
}
