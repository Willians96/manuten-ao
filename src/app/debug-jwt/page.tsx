"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: any;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

export default function DebugJwtPage() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<JwtPayload | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // template "convex" é o que criamos no Clerk
        const t = await getToken({ template: "convex" });
        if (!t) {
          setError("getToken() retornou null. Provável: template 'convex' não existe no Clerk.");
          return;
        }
        setToken(t);
        setDecoded(decodeJwt(t));
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [getToken]);

  if (!isLoaded) return <div style={{ padding: 40 }}>Carregando Clerk…</div>;
  if (!isSignedIn) return <div style={{ padding: 40 }}>Você não está logado. Faça login primeiro.</div>;

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 900 }}>
      <h2>🔍 Debug JWT — Manutenção CPI-7</h2>

      <div style={{ marginTop: 16, padding: 12, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
        <strong>userId (Clerk):</strong> <code>{userId}</code>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b" }}>
          <strong>❌ Erro:</strong> {error}
        </div>
      )}

      {token && (
        <>
          <div style={{ marginTop: 16, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, wordBreak: "break-all" }}>
            <strong>Token (template "convex"):</strong>
            <br />
            <code style={{ fontSize: 11 }}>{token}</code>
            <br />
            <button
              onClick={() => navigator.clipboard.writeText(token)}
              style={{ marginTop: 8, padding: "4px 12px", background: "#003882", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              📋 Copiar token
            </button>
          </div>

          {decoded && (
            <div style={{ marginTop: 16, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
              <strong>📦 Claims decodificadas:</strong>
              <pre style={{ marginTop: 8, fontSize: 12, overflow: "auto" }}>
{JSON.stringify(decoded, null, 2)}
              </pre>

              <div style={{ marginTop: 12, padding: 8, background: decoded.aud === "convex" ? "#d1fae5" : "#fee2e2", borderRadius: 4 }}>
                {decoded.aud === "convex" ? (
                  <strong style={{ color: "#065f46" }}>✅ aud = "convex" — Tá certinho! O Convex deveria aceitar.</strong>
                ) : (
                  <strong style={{ color: "#991b1b" }}>❌ aud = {JSON.stringify(decoded.aud)} — Não é "convex"! Esse é o problema.</strong>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: "#6b7280" }}>
        <strong>ℹ️ Pra Convex aceitar o token, esses campos são obrigatórios:</strong>
        <ul>
          <li><code>iss</code> = <code>https://becoming-serval-20.clerk.accounts.dev</code></li>
          <li><code>aud</code> = <code>convex</code></li>
        </ul>
        Se <code>aud</code> não for <code>convex</code>, edite o template no Clerk e adicione a claim <code>{`"aud": "convex"`}</code>.
      </div>
    </div>
  );
}
