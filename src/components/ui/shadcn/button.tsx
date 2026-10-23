import { coreColor } from '@/constants/coreTheme';
import * as React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { cn } from "../../../lib/utils";

const variantStyles = {
  default: "bg-core-primary-hex-0f766e",
  destructive: "bg-destructive",
  outline: `border border-core-border-hex-b7d9d3 bg-core-primary-soft-hex-e7f6f3`,
  secondary: "bg-core-primary-soft-hex-e7f6f3",
  ghost: "bg-transparent",
  link: "bg-transparent",
};

const sizeStyles = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3",
  lg: "h-12 px-8",
  icon: "h-10 w-10",
};

const textVariantStyles = {
  default: "text-core-on-primary-white",
  destructive: "text-destructive-foreground",
  outline: `text-core-text-hex-0f172a`,
  secondary: "text-core-primary-text-hex-0f766e",
  ghost: "text-foreground",
  link: "text-primary",
};

export interface ButtonProps {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  className?: string;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, ButtonProps>(
  ({ className, variant = "default", size = "default", children, onPress, disabled, loading, ...props }, ref) => {
    return (
      <TouchableOpacity
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium",
          variantStyles[variant],
          sizeStyles[size],
          disabled && "opacity-50",
          className
        )}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color={variant === "default" ? coreColor("white", 'onPrimary') : coreColor("#0F766E", 'primaryText')} />
        ) : (
          <Text className={cn("text-sm font-medium", textVariantStyles[variant])}>
            {children}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
);
Button.displayName = "Button";

export { Button, variantStyles as buttonVariants };
