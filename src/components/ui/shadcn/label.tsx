import * as React from "react";
import { Text, TextProps } from "react-native";
import { cn } from "../../../lib/utils";

const Label = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm font-poppins-bold text-foreground leading-none", className)}
      {...props}
    />
  )
);
Label.displayName = "Label";

export { Label };
