"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "TECHNICIAN" | "ADMIN";
}

const DEMO_USER: User = {
  id: "u-demo-001",
  name: "Siddu (Demo)",
  email: "demo@lab.in",
  role: "OWNER",
};

interface AuthState {
  currentUser: User;
  setUser: (user: User) => void;
  /**
   * Pull the real signed-in identity from the JWT session via
   * `/api/auth/me` and replace the demo placeholder. Called by the
   * hydration driver at app boot. Audit stamps generated after this
   * call will attribute to the real lab, not "Siddu (Demo)".
   *
   * Falls back silently to the persisted state on 401 (pre-login) or
   * network error.
   */
  hydrateFromAPI: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: DEMO_USER,
      setUser: (user) => set({ currentUser: user }),
      hydrateFromAPI: async () => {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.status === 401) return; // not logged in yet
        if (!res.ok) throw new Error(`GET /api/auth/me ${res.status}`);
        const body = (await res.json()) as
          | {
              role: "lab";
              lab: {
                lab_id: string;
                lab_code: string;
                lab_name: string;
                lab_email?: string;
              };
            }
          | {
              role: "rep" | "admin";
              staff: {
                staff_id: string;
                display_name: string;
                email: string;
                role: "rep" | "admin";
              };
            };

        // Map the server identity onto the in-app UI role. Lab sessions
        // default to OWNER (full access inside the lab); staff sessions
        // present as ADMIN so they see the admin console nav. The
        // role switcher in the avatar menu still works for demo
        // technician views.
        if (body.role === "lab") {
          set({
            currentUser: {
              id: body.lab.lab_id,
              name: body.lab.lab_name,
              email: body.lab.lab_email ?? `${body.lab.lab_code.toLowerCase()}@lab.in`,
              role: "OWNER",
            },
          });
        } else {
          set({
            currentUser: {
              id: body.staff.staff_id,
              name: body.staff.display_name,
              email: body.staff.email,
              role: "ADMIN",
            },
          });
        }
      },
    }),
    {
      name: "rakshsetu-auth",
      version: 1,
      partialize: (state) => ({ currentUser: state.currentUser }),
    },
  ),
);

export function getCurrentUserSnapshot(): User {
  return useAuthStore.getState().currentUser;
}
