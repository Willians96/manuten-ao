"use client";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function PendentePage() {
  const { user, isLoaded } = useUser();
  const upsertUser = useMutation(api.mutations.upsertUser);
  const me = useQuery(api.mutations.me);
  const router = useRouter();

  const [graduacao, setGraduacao] = useState("");
  const [nomeDeGuerra, setNomeDeGuerra] = useState("");
  const [re, setRe] = useState("");
  const [secao, setSecao] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Se já tem user aprovado e logado, redireciona
  useEffect(() => {
    if (!isLoaded || !me) return;
    if (me.approved) {
      if (me.role === "solicitante") router.replace("/solicitar");
      else if (me.role === "tecnico") router.replace("/tecnico");
      else router.replace("/gestor");
    }
  }, [isLoaded, me, router]);

  if (!isLoaded) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    await upsertUser({
      clerkId: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? "",
      name: user.fullName ?? user.firstName ?? "",
      graduacao,
      nomeDeGuerra,
      re,
      secao,
      role: "solicitante",
    });

    setSubmitted(true);
  }

  // Após submit, mostra mensagem baseada no status do user
  if (submitted || (me && !me.approved)) {
    const isAdminMaster = me?.role === "admin" && me?.approved;

    if (isAdminMaster) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f6f9"
        }}>
          <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👑</div>
            <h2 style={{ color: "#003882", marginBottom: 8 }}>Bem-vindo, Admin Master!</h2>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
              Você é o primeiro usuário do sistema.<br />
              Acesso total liberado.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => router.replace("/gestor")}
            >
              Acessar Painel de Gestão
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f6f9"
      }}>
        <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: "#003882", marginBottom: 8 }}>Cadastro enviado!</h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Seu perfil foi enviado para aprovação.<br />
            Um gestor/admin vai validar seus dados em breve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f6f9",
      padding: 16
    }}>
      <div className="card" style={{ maxWidth: 480, width: "100%" }}>
        <h2 style={{ color: "#003882", marginBottom: 4 }}>Complete seu perfil</h2>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
          Preencha os dados abaixo para acessar o sistema.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Graduação</label>
            <select value={graduacao} onChange={(e) => setGraduacao(e.target.value)} required>
              <option value="">Selecione...</option>
              <option>Sd</option>
              <option>Cb</option>
              <option>3º Sgt</option>
              <option>2º Sgt</option>
              <option>1º Sgt</option>
              <option>Asp</option>
              <option>2º Ten</option>
              <option>1º Ten</option>
              <option>Cap</option>
              <option>Maj</option>
              <option>Ten Cel</option>
              <option>Cel</option>
              <option>Aluno</option>
              <option>Civil</option>
            </select>
          </div>

          <div className="form-group">
            <label>Nome de Guerra</label>
            <input
              type="text"
              value={nomeDeGuerra}
              onChange={(e) => setNomeDeGuerra(e.target.value)}
              placeholder="Ex: WILSON"
              required
            />
          </div>

          <div className="form-group">
            <label>RE (Registro do Expediente)</label>
            <input
              type="text"
              value={re}
              onChange={(e) => setRe(e.target.value)}
              placeholder="Ex: 123.456-7"
              required
            />
          </div>

          <div className="form-group">
            <label>Seção / Local de Trabalho</label>
            <input
              type="text"
              value={secao}
              onChange={(e) => setSecao(e.target.value)}
              placeholder="Ex: Almoxarifado, TI, Administrativo..."
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            Finalizar cadastro
          </button>
        </form>
      </div>
    </div>
  );
}
