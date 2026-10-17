import React from 'react';

interface PageAccessControlProps {
  pageKey: string;
  children: React.ReactNode;
}

export function PageAccessControl({ children }: PageAccessControlProps) {
  return <>{children}</>;
}
