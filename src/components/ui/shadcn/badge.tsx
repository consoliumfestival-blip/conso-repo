import * as React from "react";
import { Text, View } from "react-native";
import { cn } from "../../../lib/utils";

const badgeVariants = {
  default: "bg-primary",
  secondary: "bg-secondary",
  destructive: "bg-destructive",
  outline: "border border-border bg-transparent",
  success: "bg-emerald-100 dark:bg-emerald-900/30",
  warning: "bg-amber-100 dark:bg-amber-900/30",
  info: "bg-blue-100 dark:bg-blue-900/30",
};

const textVariants = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive",
  outline: "text-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  info: "text-blue-700 dark:text-blue-300",
};

export interface BadgeProps {
  variant?: keyof typeof badgeVariants;
  className?: string;
  children: React.ReactNode;
}

function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <View
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5",
        badgeVariants[variant],
        className
      )}
    >
      <Text className={cn("text-xs font-medium", textVariants[variant])}>
        {children}
      </Text>
    </View>
  );
}

export { Badge, badgeVariants };
