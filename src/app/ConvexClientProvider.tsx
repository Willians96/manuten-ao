"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

// Sobrescreve getToken pra usar SEMPRE o template "convex"
// (que tem o aud="convex" que o Convex backend espera)
function useAuthWithConvexTemplate() {
  const auth = useAuth();
  return {
    ...auth,
    getToken: async (options?: any) => {
      return auth.getToken({ ...options, template: "convex" });
    },
  };
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuthWithConvexTemplate}>
      {children}
    </ConvexProviderWithClerk>
  );
}
