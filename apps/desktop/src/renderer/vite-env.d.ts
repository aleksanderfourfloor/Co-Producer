/// <reference types="vite/client" />

import type { CoproducerDesktopApi } from '../main/preload';

declare global {
  interface Window {
    coproducer: CoproducerDesktopApi;
  }
}

export {};
