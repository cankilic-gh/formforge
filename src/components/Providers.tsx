'use client';

import { ReactNode } from 'react';
import { ModalProvider } from './Modal';

export const Providers: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <ModalProvider>{children}</ModalProvider>;
};
