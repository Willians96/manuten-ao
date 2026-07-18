import { auth } from "@clerk/nextjs/server";
import { convexAuth } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const { isAuthenticated } = convexAuth();

// Helper: retorna o userId do Clerk logado, ou null
export async function getCurrentUserId() {
  const { userId } = await auth();
  return userId ?? null;
}
