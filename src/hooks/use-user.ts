"use client";

import { useEffect, useState } from "react";
import type { AppUser } from "@/lib/auth";

export function useUser() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the current user");
        return response.json();
      })
      .then(({ user }: { user: AppUser | null }) => {
        if (active) setUser(user);
      })
      .catch((error) => console.error("Could not load current user:", error))
      .finally(() => {
        if (active) setLoading(false);
      });

    const refreshUser = () => {
      fetch("/api/auth/session", { cache: "no-store" })
        .then((response) => response.json())
        .then(({ user }: { user: AppUser | null }) => {
          if (active) setUser(user);
        })
        .catch((error) => console.error("Could not refresh current user:", error));
    };
    window.addEventListener("drivego-auth-change", refreshUser);
    return () => {
      active = false;
      window.removeEventListener("drivego-auth-change", refreshUser);
    };
  }, []);

  return { user, loading };
}