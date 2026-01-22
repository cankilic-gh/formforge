'use client';

import { ReactNode } from 'react';
import { ModalProvider } from './Modal';
import { AuthGuard } from './AuthGuard';

export const Providers: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthGuard>
      <ModalProvider>{children}</ModalProvider>
    </AuthGuard>
  );
};
