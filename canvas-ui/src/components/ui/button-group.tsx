import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonGroupVariants = cva(
  "inline-flex items-center justify-center [&>button]:rounded-none [&>button]:border-r-0 [&>button:first-child]:rounded-r-md [&>button:last-child]:rounded-l-md [&>button:last-child]:border-r",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical:
          "flex-col [&>button]:border-r [&>button]:border-b-0 [&>button]:rounded-none [&>button:first-child]:rounded-t-md [&>button:first-child]:rounded-b-none [&>button:last-child]:rounded-b-md [&>button:last-child]:rounded-t-none [&>button:last-child]:border-b",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
);

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      data-slot="button-group"
      role="group"
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

export { ButtonGroup };
