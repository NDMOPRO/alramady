import { cn } from "@/lib/utils";

// E07-0132: Premium skeleton loaders (no harsh flashing)
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-muted/60 animate-pulse rounded-md",
        "[animation-duration:2s] [animation-timing-function:ease-in-out]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
