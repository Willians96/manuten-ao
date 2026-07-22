"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { RoleGuard } from "../../components/RoleGuard";

export const dynamic = "force-dynamic";

export default function DebugFcmPage() {
  return (
    <RoleGuard allow={["admin"]}>
      <DebugFcmContent />
    </RoleGuard>
  );
}

function DebugFcmContent() {
  const users = useQuery(api.mutations.debugListUsers, {});
  const clearFcmToken = useMutation(api.mutations.clearFcmTokenAdmin);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (!autoRefresh) return;
    const i = setInterval(() => setLastUpdate(new Date()), 2000);
    return () => clearInterval(i);
  }, [autoRefresh]);

  const withToken = (users ?? []).filter((u: any) => u.fcmToken && u.fcmToken.length > 10);
  const withoutToken = (users ?? []).filter((u: any) => !u.fcmToken || u.fcmToken.length <= 10);

  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔔 Debug FCM — Tokens</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#6b7280" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />{" "}
            Auto-refresh 2s
          </label>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")}</span>
        </div>
      </div>

      <div className="card" style={{ background: "#ecfdf5", borderLeft: "4px solid #10b981", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "#065f46", marginBottom: 4 }}>
          ✅ {withToken.length} usuário(s) COM FCM token
        </div>
        <div style={{ fontSize: 13, color: "#047857" }}>
          Push deve funcionar pra esses.
        </div>
      </div>

      <div className="card" style={{ background: "#fef2f2", borderLeft: "4px solid #ef4444", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>
          ❌ {withoutToken.length} usuário(s) SEM FCM token
        </div>
        <div style={{ fontSize: 13, color: "#b91c1c" }}>
          Push NÃO vai chegar pra esses. Geralmente é técnico que não abriu o app ou admin que só usa o navegador.
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 12 }}>👥 Todos os usuários</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
              <th style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>Nome</th>
              <th style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>Email</th>
              <th style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>Role</th>
              <th style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>RE</th>
              <th style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>Token</th>
              <th style={{ padding: "10px 12px", fontSize: 12, color: "#374151" }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u: any) => (
              <tr key={u._id} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280" }}>{u.email}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className={`badge ${u.role}`}>{u.role}</span>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>{u.re || "—"}</td>
                <td style={{ padding: "10px 12px", fontSize: 11, fontFamily: "monospace" }}>
                  {u.fcmToken ? (
                    <span style={{ color: "#10b981" }} title={u.fcmToken}>
                      ✅ {u.fcmToken.substring(0, 16)}...
                    </span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>— vazio —</span>
                  )}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {u.fcmToken && (
                    <button
                      onClick={async () => {
                        if (confirm(`Limpar FCM token de ${u.name}?`)) {
                          await clearFcmToken({ userId: u._id });
                        }
                      }}
                      style={{ fontSize: 11, padding: "4px 8px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 4, cursor: "pointer" }}
                    >
                      🗑 Limpar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 24, background: "#fef9c3", borderLeft: "4px solid #eab308" }}>
        <div style={{ fontWeight: 700, color: "#854d0e", marginBottom: 8 }}>🧪 Como diagnosticar se push não chega</div>
        <ol style={{ paddingLeft: 20, fontSize: 13, color: "#713f12", lineHeight: 1.6 }}>
          <li>Confirme que o usuário abriu o app <strong>recentemente</strong> (página carregou normal)</li>
          <li>Veja se a linha dele aparece ✅ com token aqui nesta página (auto-refresh a cada 2s)</li>
          <li>Se aparecer ✅ com token mas push não chega: problema é no FCM V1 (env var FCM_SERVICE_ACCOUNT_JSON)</li>
          <li>Se aparecer vazio: problema é no app Android (WebView não está rodando o JS FCM_TOKEN_SAVE)</li>
        </ol>
      </div>
    </div>
  );
}
