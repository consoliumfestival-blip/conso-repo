import { AyaticLoadingScreen } from '@/components/loading-ui/AyaticLoadingScreen';

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  compact?: boolean;
};

// Keep the existing exports so page loading states share the same full-screen loader.
export function SsfSkeleton() {
  return <AyaticLoadingScreen />;
}

export function SsfTableSkeleton(_props: TableSkeletonProps) {
  return <AyaticLoadingScreen />;
}

export function SsfProfileSkeleton() {
  return <AyaticLoadingScreen />;
}

export function SsfDashboardSkeleton() {
  return <AyaticLoadingScreen />;
}
