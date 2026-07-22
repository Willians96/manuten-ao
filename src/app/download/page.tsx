"use client";
import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function DownloadPage() {
  const [appUrl, setAppUrl] = useState("https://manutencao-drab.vercel.app");
  const apkFileName = "manutencao-cpi7-v1.0.25.apk";
  const apkDownloadUrl = `${appUrl}/apk/${apkFileName}`;
  const apkSize = "3.3 MB";
  const version = "1.0.25";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin);
    }
  }, []);

  // QR Code via API pública (rápido, sem dependência)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(apkDownloadUrl)}`;

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <h1 className="page-title">📱 App Android — Manutenção CPI-7</h1>

      <div className="card" style={{ marginBottom: 20, textAlign: "center", background: "linear-gradient(135deg, #003882 0%, #001f47 100%)", color: "#fff", border: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/escudo.png"
          alt="Escudo PMESP"
          style={{ width: 90, height: "auto", marginBottom: 8, display: "block", marginLeft: "auto", marginRight: "auto" }}
        />
        <h2 style={{ color: "#f6d700", margin: "0 0 8px 0", fontSize: 22 }}>
          Manutenção CPI-7 — Versão {version}
        </h2>
        <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>
          Aplicativo nativo Android com escudo da PMESP
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* QR Code + ícone do app */}
        <div className="card" style={{ textAlign: "center" }}>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: "#003882" }}>📷 Escaneie com o celular</h3>
          <a href={apkDownloadUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={qrCodeUrl}
              alt="QR Code para download"
              style={{ width: 200, height: 200, display: "block", margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: 8 }}
            />
          </a>
          <div style={{ marginTop: 14, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
            <img
              src="/escudo.png"
              alt="Escudo PMESP"
              style={{ width: 64, height: "auto", display: "block", margin: "0 auto" }}
            />
            <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6, marginBottom: 0 }}>
              Abra a câmera do celular e aponte pro QR
            </p>
          </div>
        </div>

        {/* Botão de download + info */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: "#003882" }}>⬇️ Baixar APK</h3>
          <a
            href={apkDownloadUrl}
            download={apkFileName}
            className="btn btn-primary"
            style={{
              fontSize: 18, padding: "16px 20px", textAlign: "center",
              display: "block", textDecoration: "none", marginBottom: 12
            }}
          >
            📥 Baixar agora ({apkSize})
          </a>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            <div>📦 <strong>Versão:</strong> {version}</div>
            <div>💾 <strong>Tamanho:</strong> {apkSize}</div>
            <div>🤖 <strong>Compatível:</strong> Android 7.0+</div>
          </div>
        </div>
      </div>

      {/* Instruções */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12, color: "#003882" }}>📋 Como instalar</h3>
        <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.8, color: "#1a1a2e" }}>
          <li>
            <strong>Baixe o APK</strong> no celular (via botão acima ou QR code).
            O navegador vai pedir permissão pra instalar apps — clique em <em>"Permitir"</em>.
          </li>
          <li>
            Se o celular bloquear a instalação, vá em:
            <br />
            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
              Configurações → Apps → Acesso especial → Instalar apps desconhecidos
            </code>
            <br />
            Selecione o navegador/Chrome e marque <em>"Permitir desta fonte"</em>.
          </li>
          <li>
            Abra o arquivo <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{apkFileName}</code> baixado
            e clique em <strong>"Instalar"</strong>.
          </li>
          <li>
            Pronto! O app <strong>"Manutenção CPI-7"</strong> aparece na gaveta de apps.
            Abra e faça login com seu usuário.
          </li>
        </ol>
      </div>

      {/* Recursos */}
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12, color: "#003882" }}>✨ O que tem no app</h3>
        <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: "#1a1a2e", listStyle: "none" }}>
          <li>🌐 Acesso direto ao sistema (mesmo login do navegador)</li>
          <li>📱 Interface otimizada pra celular (botões maiores, tabelas em cards)</li>
          <li>🧭 Menu de navegação em dropdown (sem poluir a tela)</li>
          <li>🔄 Pull-to-refresh (arrasta pra baixo pra recarregar)</li>
          <li>🔙 Botão voltar navega no histórico (não fecha o app)</li>
          <li>👑 Escudo oficial da PMESP como ícone</li>
          <li>📊 Tudo que você faz no PC funciona igual no celular</li>
        </ul>
      </div>

      {/* Atualizações */}
      <div style={{ marginTop: 16, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
        <strong>💡 Atualização:</strong> sempre que sair uma versão nova, é só baixar e instalar por cima.
        <br />Suas configurações e login continuam salvos.
      </div>

      <div style={{ textAlign: "center", marginTop: 20, color: "#6b7280", fontSize: 12 }}>
        🛡️ Sistema Manutenção CPI-7 — PMESP<br />
        <a href={appUrl} style={{ color: "#003882" }}>← Voltar para o sistema</a>
      </div>
    </div>
  );
}
