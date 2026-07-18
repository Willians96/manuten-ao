"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignedIn, SignOutButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const me = useQuery(api.mutations.me);

  const role = me?.role ?? "solicitante";

  const links = [
    { href: "/gestor", label: "Dashboard", icon: "📊", roles: ["gestor", "admin"] },
    { href: "/gestor/aprovar", label: "Aprovar Usuários", icon: "👥", roles: ["gestor", "admin"] },
    { href: "/gestor/equipes", label: "Equipes", icon: "🔧", roles: ["gestor", "admin"] },
    { href: "/tecnico", label: "Meus Serviços", icon: "📋", roles: ["tecnico"] },
    { href: "/solicitar", label: "Solicitar / Minhas", icon: "📝", roles: ["solicitante"] },
  ];

  const visibleLinks = links.filter((l) => l.roles.includes(role));

  // Sempre volta pra raiz (/) que redireciona pro dashboard certo via RoleRouter
  const homePath = "/";

  // Destino do dashboard baseado no role (pra brasão da sidebar)
  const dashboardPath =
    role === "gestor" || role === "admin" ? "/gestor" :
    role === "tecnico" ? "/tecnico" :
    "/solicitar";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <Link href={dashboardPath} className="logo-area" style={{ textDecoration: "none", color: "inherit" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escudo.png" alt="CPI-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="system-name">Manutenção CPI-7</div>
          <div className="org-name">Polícia Militar de São Paulo</div>
        </Link>

        <nav>
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href || (pathname?.startsWith(link.href + "/")) ? "active" : ""}
            >
              <span>{link.icon}</span> {link.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            {me?.nomeDeGuerra ?? user?.firstName ?? ""}
            <br />
            <span style={{ textTransform: "uppercase", fontSize: 10, color: "var(--pm-yellow)" }}>{role}</span>
          </div>
          <Link href={dashboardPath} className="btn" style={{
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            width: "100%",
            justifyContent: "center",
            fontSize: 13,
            padding: "8px",
            marginBottom: 6,
            display: "inline-flex",
            textDecoration: "none",
          }}>
            🏠 Início
          </Link>
          <SignOutButton>
            <button className="btn" style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.7)",
              width: "100%",
              justifyContent: "center",
              fontSize: 12,
              padding: "6px"
            }}>
              🚪 Sair
            </button>
          </SignOutButton>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Barra de navegação topo */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          marginBottom: 20, paddingBottom: 12,
          borderBottom: "1px solid #e2e8f0",
          position: "sticky", top: 0, background: "#f4f6f9", zIndex: 10
        }}>
          <button
            onClick={() => router.push(dashboardPath)}
            className="btn btn-primary"
            style={{ fontSize: 13, padding: "6px 14px" }}
            title="Ir para o Dashboard"
          >
            🏠 Dashboard
          </button>
          <button
            onClick={() => {
              try {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push(dashboardPath);
                }
              } catch {
                router.push(dashboardPath);
              }
            }}
            className="btn btn-outline"
            style={{ fontSize: 13, padding: "6px 12px" }}
            title="Voltar à página anterior"
          >
            ← Voltar
          </button>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
            <strong style={{ color: "#003882" }}>{me?.nomeDeGuerra ?? "—"}</strong>
            {me?.graduacao && <> · {me.graduacao}</>}
            {me?.secao && <> · {me.secao}</>}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
