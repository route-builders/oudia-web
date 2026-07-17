// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// virtual:pwa-register の型(vite-plugin-pwa 提供)。動的 import で使う最小宣言。
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (
      swScriptUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
