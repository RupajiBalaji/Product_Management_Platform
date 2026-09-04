import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import {
  authRegister,
  authLogin,
  createServerSession,
  getCurrentServerSession,
  logoutServerSession,
  switchUserSession,
} from "@/lib/db";
import type { UserProfile, UserType } from "@/lib/types";

interface AuthContextValue {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    pass: string,
    name: string,
    roleTitle?: string,
    userType?: UserType
  ) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync profile & issue HTTP-only server cookie session
  const establishSession = async (
    uid: string,
    email: string,
    name?: string,
    roleTitle?: string,
    photoUrl?: string,
    userType?: UserType
  ) => {
    try {
      const profile = await createServerSession({
        uid,
        email,
        full_name: name || email.split("@")[0] || "User",
        role_title: roleTitle || ((userType === "product_lead" || userType === "pm") ? "Product Lead" : (userType === "lead_architect" ? "Lead Architect" : "Developer / Contributor")),
        photo_url: photoUrl || "",
        user_type: userType || "product_lead",
      });
      setUserProfile(profile);
    } catch (err) {
      console.error("Session creation error:", err);
      // Fallback in-memory
      setUserProfile({
        id: uid,
        email,
        full_name: name || email.split("@")[0] || "User",
        role_title: roleTitle || ((userType === "product_lead" || userType === "pm") ? "Product Lead" : (userType === "lead_architect" ? "Lead Architect" : "Developer / Contributor")),
        user_type: userType || "product_lead",
        status: "active",
        created_at: new Date().toISOString(),
      });
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const existingProfile = await getCurrentServerSession();
        if (isMounted && existingProfile) {
          setUserProfile(existingProfile);
        }
      } catch (err) {
        console.warn("Session restore check:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    // Listen to Firebase Auth state only if auth is initialized
    if (auth) {
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (!isMounted) return;
        setFirebaseUser(user);
        if (user) {
          await establishSession(
            user.uid,
            user.email || "",
            user.displayName || undefined,
            undefined,
            user.photoURL || undefined
          );
        }
        if (isMounted) {
          setLoading(false);
        }
      });

      return () => {
        isMounted = false;
        unsub();
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    // 1. Authenticate via backend API & obtain HTTP-only JWT session cookie
    const profile = await authLogin({ email, password: pass });
    setUserProfile(profile);

    // 2. Optionally attempt Firebase if key is configured
    try {
      if (auth) {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch {
      // Ignore Firebase errors since local/MongoDB JWT session is active
    }
  };

  const registerWithEmail = async (
    email: string,
    pass: string,
    name: string,
    roleTitle: string = "Product Lead",
    userType: UserType = "product_lead"
  ) => {
    // 1. Register account via backend API & obtain HTTP-only JWT session cookie
    const profile = await authRegister({
      email,
      password: pass,
      full_name: name,
      role_title: roleTitle,
      user_type: userType,
    });
    setUserProfile(profile);

    // 2. Optionally attempt Firebase if key is configured
    try {
      if (auth) {
        await createUserWithEmailAndPassword(auth, email, pass);
      }
    } catch {
      // Ignore Firebase errors since local/MongoDB JWT session is active
    }
  };

  const loginWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error("Google Sign-In is not configured in this environment. Please sign in with email and password.");
    }
    const cred = await signInWithPopup(auth, googleProvider);
    await establishSession(
      cred.user.uid,
      cred.user.email || "",
      cred.user.displayName || undefined,
      undefined,
      cred.user.photoURL || undefined
    );
  };

  const switchUser = async (userId: string) => {
    setLoading(true);
    try {
      const switchedProfile = await switchUserSession(userId);
      setUserProfile(switchedProfile);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await logoutServerSession();
    if (auth) {
      await signOut(auth).catch(() => {});
    }
    setUserProfile(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        isAuthenticated: Boolean(userProfile || firebaseUser),
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        switchUser,
        logout,
        setUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
