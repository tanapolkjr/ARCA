import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = "loading", null = "signed out"
  const [profile, setProfile] = useState(null);
  // `profile` starts null even for a signed-in user while the row is fetched.
  // Role-gated routes must not decide "no access" during that window, so they
  // wait on profileLoaded instead of on `profile` alone.
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setProfileLoaded(session === null); // signed out = nothing left to load
      return;
    }
    setProfileLoaded(false);
    // The `users` profile row is auto-created by a DB trigger on first
    // login (see supabase/migrations/0001_init.sql), same as 4 HAUS's
    // `handle_new_auth_user` trigger.
    supabase
      .from("users")
      .select("id, name, email, role, is_active")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error("Failed to load profile:", error);
        setProfile(data ?? null);
        setProfileLoaded(true);
      });
  }, [session?.user?.id]);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value = {
    session,
    profile,
    profileLoaded,
    loading: session === undefined,
    isAuthenticated: !!session,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Current user id, for created_by / evaluated_by attribution. */
export function useUserId() {
  const { session } = useAuth();
  return session?.user?.id ?? "";
}

/**
 * True when the signed-in user's role is one of `roles`.
 * Mirrors the RLS pattern used in the migrations:
 *   exists (select 1 from users u where u.id = auth.uid() and u.role in (...))
 * The UI check is convenience; RLS is the real gate.
 */
export function useHasRole(roles) {
  const { profile } = useAuth();
  return !!profile && roles.includes(profile.role);
}

/** Roles allowed into the Sourcing module (cost & margin figures). */
export const SOURCING_ROLES = ["Super Admin", "Manager"];

/** Roles allowed into Accounting and the cash book. */
export const ACCOUNTING_ROLES = ["Super Admin", "Manager", "Admin"];
