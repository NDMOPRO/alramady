import * as React from "react";

import { cn } from "@/lib/utils";

function Item({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item"
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent",
        className
      )}
      {...props}
    />
  );
}

function ItemMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-media"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted [&>svg]:size-5 [&>svg]:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn("truncate font-medium", className)}
      {...props}
    />
  );
}

function ItemDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-description"
      className={cn("text-muted-foreground truncate text-xs", className)}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn(
        "flex shrink-0 items-center gap-1 [&>button]:size-8",
        className
      )}
      {...props}
    />
  );
}

export { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions };
