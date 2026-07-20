"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignedIn, SignOutButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";

// Mapeia URL → label legível
const PATH_LABELS: Record<string, string> = {
  "/gestor": "Dashboard",
  "/gestor/relatorios": "Relatórios",
  "/gestor/aprovar": "Aprovar Usuários",
  "/gestor/equipes": "Equipes",
  "/tecnico": "Meus Serviços",
  "/solicitar": "Solicitar Serviço",
};

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string; icon: string }[] = [
    // sempre começa com Início (raiz) → o RoleRouter redireciona pro dashboard certo
    { href: "/", label: "Início", icon: "🏠" },
  ];
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    path += "/" + segments[i];
    const label = PATH_LABELS[path] || segments[i];
    crumbs.push({ href: path, label, icon: "›" });
  }
  return crumbs;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const me = useQuery(api.mutations.me);

  const role = me?.role ?? "solicitante";

  const links = [
    { href: "/gestor", label: "Dashboard", icon: "📊", roles: ["gestor", "admin"] },
    { href: "/gestor/relatorios", label: "Relatórios", icon: "📈", roles: ["gestor", "admin"] },
    { href: "/gestor/aprovar", label: "Aprovar Usuários", icon: "👥", roles: ["gestor", "admin"] },
    { href: "/gestor/equipes", label: "Equipes", icon: "🔧", roles: ["gestor", "admin"] },
    { href: "/tecnico", label: "Meus Serviços", icon: "📋", roles: ["tecnico"] },
    { href: "/solicitar", label: "Solicitar / Minhas", icon: "📝", roles: ["solicitante"] },
  ];

  const visibleLinks = links.filter((l) => l.roles.includes(role));

  // Destino do dashboard baseado no role
  const dashboardPath =
    role === "gestor" || role === "admin" ? "/gestor" :
    role === "tecnico" ? "/tecnico" :
    "/solicitar";

  // Página pai (pra onde "Voltar" deve ir baseado no path)
  const parentPath = (() => {
    if (!pathname) return dashboardPath;
    if (pathname.startsWith("/gestor/")) return "/gestor";
    return dashboardPath;
  })();

  const breadcrumbs = getBreadcrumbs(pathname || "");

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
          <Link
            href="/download"
            target="_blank"
            style={{ background: "rgba(246, 215, 0, 0.15)", color: "#f6d700", marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14, borderRadius: 0 }}
            title="Baixar app Android"
          >
            <span>📱</span> Baixar App Android
          </Link>
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
        {/* ── Breadcrumbs + nav bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          marginBottom: 20, paddingBottom: 12,
          borderBottom: "1px solid #e2e8f0",
          flexWrap: "wrap"
        }}>
          {/* Breadcrumbs */}
          <nav aria-label="breadcrumb" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, flexWrap: "wrap" }}>
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <span key={crumb.href} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {idx > 0 && <span style={{ color: "#9ca3af" }}>›</span>}
                  {isLast ? (
                    <span style={{ fontWeight: 600, color: "#003882" }}>{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} style={{ color: "#003882", textDecoration: "none" }}>
                      {crumb.label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>

          {/* User info (direita) */}
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
            <strong style={{ color: "#003882" }}>
              {me?.graduacao ? `${me.graduacao} ` : ""}{me?.nomeDeGuerra ?? "—"}
            </strong>
            {me?.secao && <> · {me.secao}</>}
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
