# Manutenção CPI-7

Sistema de gestão de solicitações de manutenção para o CPI-7 / PMESP.

## Stack

- **Frontend**: Next.js 15 (App Router)
- **Backend**: Convex (self-hosted na VPS ou Convex Cloud)
- **Auth**: Clerk (Google OAuth)
- **Deploy**: Vercel (frontend) + Convex (backend)

## Roles

| Role | Descrição |
|------|-----------|
| `solicitante` | Qualquer PM aprobado → cria solicitações |
| `gestor` | Aprova usuários, atribui equipes, vê dashboard |
| `tecnico` | Vê serviços da equipe, inicia/encerra execução |
| `admin` | Acesso total |

## Fluxo

1. Usuário faz login com Google (Clerk)
2. Preenche perfil (graduação, nome de guerra, RE, seção)
3. Gestor aprova → usuário fica habilitado
4. Solicitante cria chamado com título, local, urgência e descrição
5. Gestor atribui equipe + data agendada
6. Técnico da equipe见「Meus Serviços」, clica "Começar" → "Encerrar"
7. Dashboard em tempo real + exportação de relatórios

## Setup local

```bash
cd Manutencao
npm install

# Clerk — criar arquivo .env.local com:
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
# CLERK_SECRET_KEY=sk_...

# Convex — criar projeto em dashboard.convex.dev
# depois: npx convex dev
```

## Deploy

```bash
# Convex (backend)
npx convex deploy --yes

# Vercel (frontend)
vercel --prod
```
