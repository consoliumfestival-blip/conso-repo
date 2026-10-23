import React from 'react';
import { Modal as NativeModal, ModalProps } from 'react-native';
import { CoreThemeSurface, useCoreAppearance } from '@/core/contexts/CoreAppearanceContext';

/** React context survives a Modal, but web CSS inheritance does not. */
export function Modal({ children, ...props }: ModalProps) {
  const appearance = useCoreAppearance();
  return <NativeModal {...props}>{appearance ? <CoreThemeSurface style={{ flex: 1 }} pointerEvents="box-none">{children}</CoreThemeSurface> : children}</NativeModal>;
}
