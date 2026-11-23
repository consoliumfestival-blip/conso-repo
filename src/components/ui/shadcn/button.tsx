import { coreColor } from '@/constants/coreTheme';
import * as React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { cn } from "../../../lib/utils";

const variantStyles = {
  default: "bg-button-primary",
  destructive: "bg-destructive",
  outline: `border border-[color:var(--core-button-border,#B7D9D3)] bg-button-soft`,
  secondary: "bg-button-soft",
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
  default: "text-button-foreground",
  destructive: "text-destructive-foreground",
  outline: `text-core-text-hex-0f172a`,
  secondary: "text-button-text",
  ghost: "text-foreground",
  link: "text-button-text",
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
          <ActivityIndicator size="small" color={variant === "default" ? coreColor("white", 'buttonForeground') : coreColor("#0F766E", 'primaryText')} />
        ) : (
          <Text className={cn("text-sm font-medium", textVariantStyles[variant])}>
            {React.Children.map(children, child => variant === 'default' && React.isValidElement<{ color?: string }>(child) && 'color' in child.props ? React.cloneElement(child, { color: coreColor('white', 'buttonForeground') }) : child)}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
);
Button.displayName = "Button";

export { Button, variantStyles as buttonVariants };
