import { AyaticLoadingScreen } from '@/components/loading-ui/AyaticLoadingScreen';
import { useCanvasStore } from '../Stores/canvasStore';

export default function CanvasSkeleton() {
  const { hydrationComplete } = useCanvasStore();
  return hydrationComplete ? null : <AyaticLoadingScreen />;
}
