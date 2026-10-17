import * as React from "react";
import { View } from "react-native";
import { cn } from "../../../lib/utils";

interface SeparatorProps {
  className?: string;
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

function Separator({ className, orientation = "horizontal", decorative = true }: SeparatorProps) {
  return (
    <View
      role={decorative ? "none" : "separator"}
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
    />
  );
}

export { Separator };
