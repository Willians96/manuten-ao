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
  const logs = useQuery(api.mutations.debugListLogs, { source: "fcm-android" });
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
    <div className="page-container" style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔔 Debug FCM — Tokens & Logs</h1>
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

      {/* LOGS DO APP - seção chave pra debugar */}
      <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 12 }}>📡 Logs do App Android (últimos 50)</h2>
      <div className="card" style={{ background: "#0f172a", color: "#e2e8f0", fontFamily: "monospace", fontSize: 11 }}>
        {logs && logs.length > 0 ? (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {logs.map((log: any) => (
              <div key={log._id} style={{ padding: "4px 0", borderBottom: "1px solid #1e293b" }}>
                <span style={{ color: "#64748b" }}>{new Date(log.createdAt).toLocaleTimeString("pt-BR")}</span>
                {" "}
                <span style={{ color: log.error ? "#ef4444" : "#10b981", fontWeight: 700 }}>
                  [{log.step}]
                </span>
                {" "}
                <span style={{ color: "#94a3b8" }}>
                  token={String(log.hasToken)} clerk={String(log.hasClerkUser)}
                </span>
                {log.clerkId && <span style={{ color: "#fbbf24" }}> user={log.clerkId.substring(0, 12)}...</span>}
                {log.info && <span style={{ color: "#60a5fa" }}> info={log.info}</span>}
                {log.error && <span style={{ color: "#ef4444" }}> ❌ {log.error}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
            Nenhum log ainda. Abra o app no celular do João pra começar a ver.
          </div>
        )}
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
        <div style={{ fontWeight: 700, color: "#854d0e", marginBottom: 8 }}>🧪 Como diagnosticar</div>
        <ol style={{ paddingLeft: 20, fontSize: 13, color: "#713f12", lineHeight: 1.6 }}>
          <li>Abra o app no celular do João</li>
          <li>Volte nessa página e olhe os <strong>Logs do App Android</strong> (caixa preta acima)</li>
          <li>Se aparecer <code>[script_injected]</code> → JS rodou, problema é no Clerk ou no fetch</li>
          <li>Se aparecer <code>[sending_save]</code> → fetch foi disparado</li>
          <li>Se aparecer <code>[response_status 200]</code> → salvou com sucesso!</li>
          <li>Se <strong>nada</strong> aparecer → JS não está executando (WebView com problema)</li>
        </ol>
      </div>
    </div>
  );
}

