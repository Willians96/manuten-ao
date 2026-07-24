"use client";
import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f6f9",
      padding: 16,
    }}>
      <SignUp
        appearance={{
          elements: {
            rootBox: { width: "100%", maxWidth: 440 },
            card: { boxShadow: "0 4px 16px rgba(0, 56, 130, 0.1)", border: "1px solid #e2e8f0" },
            headerTitle: { color: "#003882", fontSize: 20 },
            headerSubtitle: { color: "#6b7280" },
            formButtonPrimary: { background: "#003882", "&:hover": { background: "#001f47" } },
          },
        }}
      />
    </div>
  );
}
