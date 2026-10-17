import * as React from "react";
import { Pressable, Text, View, ScrollView } from "react-native";
import { cn } from "../../../lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  onValueChange: () => {},
});

function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <View className={cn("w-full", className)}>{children}</View>
    </TabsContext.Provider>
  );
}

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn(
        "flex flex-row items-center rounded-lg bg-muted p-1",
        className
      )}
    >
      {children}
    </ScrollView>
  );
}

function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  const isActive = ctx.value === value;

  return (
    <Pressable
      onPress={() => ctx.onValueChange(value)}
      className={cn(
        "flex-none items-center justify-center rounded-md px-3 py-1.5",
        isActive ? "bg-background shadow-sm" : "bg-transparent",
        className
      )}
    >
      <Text
        className={cn(
          "text-sm font-medium",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <View className={cn("mt-2", className)}>{children}</View>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
