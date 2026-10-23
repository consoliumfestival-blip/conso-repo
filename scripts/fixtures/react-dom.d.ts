declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export function createRoot(container: Element | DocumentFragment): {
    render(node: ReactNode): void;
    unmount(): void;
  };
}
