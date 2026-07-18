"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignOutButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const me = useQuery(api.mutations.me);

  const role = me?.role ?? "solicitante";

  const links = [
    { href: "/gestor", label: "Dashboard", icon: "📊", roles: ["gestor", "admin"] },
    { href: "/gestor/aprovar", label: "Aprovar Usuários", icon: "👥", roles: ["gestor", "admin"] },
    { href: "/gestor/equipes", label: "Equipes", icon: "🔧", roles: ["gestor", "admin"] },
    { href: "/tecnico", label: "Meus Serviços", icon: "📋", roles: ["tecnico"] },
    { href: "/solicitar", label: "Solicitar Serviço", icon: "📝", roles: ["solicitante"] },
    { href: "/solicitar", label: "Minhas Solicitações", icon: "📋", roles: ["solicitante"] },
  ];

  const visibleLinks = links.filter((l) => l.roles.includes(role));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-area">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/escudo.png" alt="CPI-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="system-name">Manutenção CPI-7</div>
          <div className="org-name">Polícia Militar de São Paulo</div>
        </div>

        <nav>
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href || pathname.startsWith(link.href + "/") ? "active" : ""}
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
          <SignOutButton>
            <button className="btn" style={{
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              width: "100%",
              justifyContent: "center",
              fontSize: 13,
              padding: "8px"
            }}>
              🚪 Sair
            </button>
          </SignOutButton>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
