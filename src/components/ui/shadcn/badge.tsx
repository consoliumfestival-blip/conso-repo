import * as React from "react";
import { Text, View } from "react-native";
import { cn } from "../../../lib/utils";

const badgeVariants = {
  default: "bg-primary",
  secondary: "bg-secondary",
  destructive: "bg-destructive",
  outline: "border border-border bg-transparent",
  success: "bg-core-success-soft-emerald-100 dark:bg-core-success-action-emerald-900/30",
  warning: "bg-core-warning-soft-amber-100 dark:bg-core-warning-action-amber-900/30",
  info: "bg-core-info-soft-blue-100 dark:bg-core-info-action-blue-900/30",
};

const textVariants = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive",
  outline: "text-foreground",
  success: "text-core-success-emerald-700 dark:text-core-success-emerald-300",
  warning: "text-core-warning-amber-700 dark:text-core-warning-amber-300",
  info: "text-core-info-blue-700 dark:text-core-info-blue-300",
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
