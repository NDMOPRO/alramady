import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const fieldVariants = cva("grid gap-2", {
  variants: {
    orientation: {
      vertical: "grid-cols-1",
      horizontal: "grid-cols-[auto_1fr] items-center gap-x-4",
      inline: "grid-cols-[1fr_auto] items-center",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

interface FieldProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof fieldVariants> {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
}

function Field({
  className,
  orientation,
  label,
  description,
  error,
  required,
  htmlFor,
  children,
  ...props
}: FieldProps) {
  return (
    <div
      data-slot="field"
      data-disabled={props["aria-disabled"]}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    >
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="text-destructive mr-1" aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}
      <div className="grid gap-1.5">
        {children}
        {description && !error && (
          <p className="text-muted-foreground text-[0.8rem]">{description}</p>
        )}
        {error && (
          <p className="text-destructive text-[0.8rem] font-medium">{error}</p>
        )}
      </div>
    </div>
  );
}

export { Field };
