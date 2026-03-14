import * as React from "react";

import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-background text-foreground inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] font-medium tracking-widest opacity-100 select-none pointer-events-none",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
