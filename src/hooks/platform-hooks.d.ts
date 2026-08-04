/**
 * Ambient types for the platform's JavaScript modules that the TypeScript
 * Sourcing module imports.
 *
 * WHY THIS FILE EXISTS: the platform (ARCA) is written in JavaScript, the
 * Sourcing module in TypeScript. `vite build` transpiles both without ever
 * type-checking, so this file is only consumed by `npm run typecheck`.
 *
 * WHEN TO EDIT: whenever Sourcing code starts importing another platform JS
 * module (e.g. api/stock.js for SKU promotion, lib/upload.js for TUS uploads),
 * add a matching `declare module` block here or typecheck will fail.
 */

declare module '@/hooks/useToast.jsx' {
  export function useToast(): {
    /** Sourcing-style call: toast('Saved') / toast('Failed', 'error'). */
    toast: (message: string, kind?: 'success' | 'error') => void;
    success: (message: string) => void;
    error: (message: string) => void;
    push: (t: { type?: string; message: string }) => number;
    dismiss: (id: number) => void;
  };
}

declare module '@/hooks/useAuth.jsx' {
  import type { Session } from '@supabase/supabase-js';

  export interface PlatformProfile {
    id: string;
    name: string;
    email: string;
    role: 'Super Admin' | 'Manager' | 'Sale' | 'PM' | 'Admin' | 'Store';
    is_active: boolean;
  }

  export function useAuth(): {
    session: Session | null;
    profile: PlatformProfile | null;
    loading: boolean;
    profileLoaded: boolean;
    isAuthenticated: boolean;
    signIn: (email: string, password: string) => Promise<{ error: unknown }>;
    signOut: () => Promise<void>;
  };

  /** Current user id, for created_by / evaluated_by attribution. */
  export function useUserId(): string;

  /** True when the signed-in user's role is in `roles`. */
  export function useHasRole(roles: readonly string[]): boolean;
}

declare module '../lib/supabaseClient.js' {
  import type { SupabaseClient } from '@supabase/supabase-js';
  export const supabase: SupabaseClient;
  export const FILES_BUCKET: string;
}
