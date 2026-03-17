"use client";
import React from "react";
import { AuthProvider } from "./utils/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
