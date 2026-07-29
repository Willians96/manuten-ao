import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, action } from "./_generated/server";
import { getCurrentUserId } from "./auth";

// â”€â”€ Helper: envia push notification via FCM HTTP v1 API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Requer variavel de ambiente FCM_SERVICE_ACCOUNT_JSON (JSON da Service Account)
//
// Cache simples de access_token (60 min)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.warn("FCM_SERVICE_ACCOUNT_JSON nao configurada - push desabilitado");
    return null;
  }

  // Usa cache se ainda vÃ¡lido (com 5min de margem)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  try {
    const sa = JSON.parse(saJson);
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // 1 hora

    // Header JWT
    const header = { alg: "RS256", typ: "JWT" };
    const headerB64 = Buffer.from(JSON.stringify(header))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    // Payload JWT (claim set do Google)
    const payload = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: exp,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    // Assinatura RSA-SHA256
    const crypto = await import("crypto");
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${headerB64}.${payloadB64}`);
    sign.end();
    const signature = sign
      .sign(sa.private_key)
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const jwt = `${headerB64}.${payloadB64}.${signature}`;

    // Troca JWT por access_token
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const data = await res.json();
    if (!data.access_token) {
      console.error("Falha ao obter access_token:", data);
      return null;
    }

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  } catch (e) {
    console.error("Erro ao gerar access_token:", e);
    return null;
  }
}

async function sendPushNotification(
  ctx: any,
  tokens: string[],
  title: string,
  body: string,
  url?: string
) {
  if (!tokens || tokens.length === 0) return;

  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.warn("FCM_SERVICE_ACCOUNT_JSON nao configurada - push desabilitado");
    return;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const sa = JSON.parse(saJson);
  const projectId = sa.project_id;

  for (const token of tokens) {
    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title,
                body,
              },
              data: {
                url: url || "",
              },
              android: {
                priority: "HIGH",
                notification: {
                  sound: "default",
                },
              },
            },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        console.error(`FCM erro ${res.status}:`, err);
      }
    } catch (e) {
      console.error("Erro ao enviar push:", e);
    }
  }
}

// Salva o FCM token do user (chamado pelo app no login)
export const saveFcmToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();
    if (!user) return;
    await ctx.db.patch(user._id, { fcmToken: args.token });
  },
});

// FunÃ§Ãµes usadas pela httpAction (nÃ£o exigem auth Clerk)
// ValidaÃ§Ã£o de seguranÃ§a fica na httpAction (via appSecret)
export const findUserByClerkIdPublic = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

export const setFcmTokenByUserIdPublic = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { fcmToken: args.token });
    return { ok: true };
  },
});


// â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();
  },
});

export const listServicos = query({
  args: {
    status: v.optional(v.string()),
    modalidade: v.optional(v.union(v.literal("servicos_gerais"), v.literal("informatica"))),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();

    if (!user) return [];

    // Filtro por modalidade (se passada, usa Ã­ndice; senÃ£o, filtra em memÃ³ria)
    let q: any = ctx.db.query("servicos").order("desc");
    if (args.modalidade) {
      q = ctx.db
        .query("servicos")
        .withIndex("by_modalidade", (q: any) => q.eq("modalidade", args.modalidade))
        .order("desc");
    }
    if (args.status) {
      q = ctx.db
        .query("servicos")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .order("desc");
    }

    const servicos = await q.collect();

    // Tecnicos veem sÃ³ os serviÃ§os da prÃ³pria equipe
    // EXCETO pausados: pausados aparecem pra QUALQUER equipe (outra equipe pode retomar)
    if (user.role === "tecnico") {
      const tecnico = await ctx.db
        .query("tecnicos")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();

      if (tecnico) {
        const tecModalidades = (tecnico.modalidades && tecnico.modalidades.length > 0) ? tecnico.modalidades : ["servicos_gerais"];
        return servicos.filter(
          (s: any) =>
            tecModalidades.includes(s.modalidade ?? "servicos_gerais") &&
            (
              // Pausados: qualquer tÃ©cnico de qualquer equipe vÃª
              (s.status === "pausado") ||
              // Demais status (aprovado, em_andamento): sÃ³ da prÃ³pria equipe
              ((s.status === "aprovado" || s.status === "em_andamento") &&
               s.equipeId === tecnico.equipeId)
            )
        );
      }
      return [];
    }

    return servicos;
  },
});

export const listTecnicos = query({
  args: {
    equipeId: v.optional(v.id("equipes")),
    modalidade: v.optional(v.union(v.literal("servicos_gerais"), v.literal("informatica"))),
  },
  handler: async (ctx, args) => {
    let tecnicos = await (args.equipeId
      ? ctx.db.query("tecnicos").withIndex("by_equipe", (q) => q.eq("equipeId", args.equipeId as Id<"equipes">))
      : ctx.db.query("tecnicos")
    ).collect();

    // Filtra por modalidade se passado (in-memory, pois modalidades Ã© array)
    if (args.modalidade) {
      tecnicos = tecnicos.filter((t) => {
        const mods = (t.modalidades && t.modalidades.length > 0) ? t.modalidades : ["servicos_gerais"];
        return mods.includes(args.modalidade!);
      });
    }

    // Traz user info
    const withUser = await Promise.all(
      tecnicos.map(async (t) => ({
        ...t,
        user: await ctx.db.get(t.userId),
      }))
    );
    return withUser;
  },
});

export const listEquipes = query({
  args: {
    modalidade: v.optional(v.union(v.literal("servicos_gerais"), v.literal("informatica"))),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("equipes").collect();
    if (args.modalidade) {
      return all.filter((e) => (e.modalidade ?? "servicos_gerais") === args.modalidade);
    }
    return all;
  },
});

export const dashboardStats = query({
  args: {
    modalidade: v.optional(v.union(v.literal("servicos_gerais"), v.literal("informatica"))),
  },
  handler: async (ctx, args) => {
    // Filtra por modalidade (se passada)
    let allEquipes = await ctx.db.query("equipes").collect();
    let allTecnicos = await ctx.db.query("tecnicos").collect();
    if (args.modalidade) {
      allEquipes = allEquipes.filter((e) => (e.modalidade ?? "servicos_gerais") === args.modalidade);
      const equipeIdsFiltradas = new Set(allEquipes.map((e) => e._id));
      allTecnicos = allTecnicos.filter((t) => equipeIdsFiltradas.has(t.equipeId));
    }
    let allServicos = await ctx.db.query("servicos").collect();
    if (args.modalidade) {
      allServicos = allServicos.filter((s) => (s.modalidade ?? "servicos_gerais") === args.modalidade);
    }
    const equipesFiltradas = allEquipes;
    const tecnicosFiltrados = allTecnicos;
    const servicosFiltrados = allServicos;

    // Conta por equipe
    const porEquipe: Record<string, { total: number; concluido: number; emAndamento: number; pausado: number }> = {};
    for (const eq of equipesFiltradas) {
      porEquipe[eq._id] = { total: 0, concluido: 0, emAndamento: 0, pausado: 0 };
    }

    for (const s of servicosFiltrados) {
      if (s.equipeId && porEquipe[s.equipeId]) {
        porEquipe[s.equipeId].total++;
        if (s.status === "concluido") porEquipe[s.equipeId].concluido++;
        if (s.status === "em_andamento") porEquipe[s.equipeId].emAndamento++;
        if (s.status === "pausado") porEquipe[s.equipeId].pausado++;
      }
    }

    // Tempos mÃ©dios (serviceLogs) - sÃ³ dos serviÃ§os filtrados
    const servicosConcluidos = servicosFiltrados.filter((s) => s.status === "concluido");

    const avgDurations = await Promise.all(
      servicosConcluidos.map(async (s) => {
        const logs = await ctx.db
          .query("serviceLogs")
          .withIndex("by_servico", (q) => q.eq("servicoId", s._id))
          .collect();
        const inicio = logs.find((l) => l.acao === "inicio")?.createdAt;
        const fim = logs.find((l) => l.acao === "fim")?.createdAt;
        if (inicio && fim) return (fim - inicio) / (1000 * 60); // minutos
        return null;
      })
    );

    const durations = avgDurations.filter((d) => d !== null) as number[];
    const tempoMedioMin =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    return {
      total: servicosFiltrados.length,
      pendente: servicosFiltrados.filter((s) => s.status === "pendente").length,
      emAndamento: servicosFiltrados.filter((s) => s.status === "em_andamento").length,
      pausado: servicosFiltrados.filter((s) => s.status === "pausado").length,
      concluido: servicosFiltrados.filter((s) => s.status === "concluido").length,
      porEquipe,
      equipes: equipesFiltradas,
      tempoMedioMin,
    };
  },
});

export const pendingUsers = query({
  args: {},
  handler: async (ctx) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) return [];
    return await ctx.db
      .query("users")
      .withIndex("by_approved", (q) => q.eq("approved", false))
      .collect();
  },
});

// â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const upsertUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    graduacao: v.optional(v.string()),
    nomeDeGuerra: v.optional(v.string()),
    re: v.optional(v.string()),
    secao: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("solicitante"),
        v.literal("gestor"),
        v.literal("tecnico"),
        v.literal("admin")
      )
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existing) {
      // User JÃ EXISTE - sÃ³ atualiza dados bÃ¡sicos, NÃƒO mexe em role
      // (a role Ã© gerenciada pelo gestor via approveUser/updateUserRole)
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        ...(args.graduacao && { graduacao: args.graduacao }),
        ...(args.nomeDeGuerra && { nomeDeGuerra: args.nomeDeGuerra }),
        ...(args.re && { re: args.re }),
        ...(args.secao && { secao: args.secao }),
      });
      return existing._id;
    } else {
      // â”€â”€ Verifica se Ã© um tecnico pre-cadastrado (placeholder) â”€â”€
      // Se o RE bater com um placeholder criado pelo cadastrarTecnico, vincula
      if (args.re) {
        const placeholder = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", `pendente:${args.re}`))
          .first();
        if (placeholder) {
          // Atualiza o placeholder com o clerkId real
          await ctx.db.patch(placeholder._id, {
            clerkId: args.clerkId,
            email: args.email,
            name: args.name,
            ...(args.graduacao && { graduacao: args.graduacao }),
            ...(args.nomeDeGuerra && { nomeDeGuerra: args.nomeDeGuerra }),
            ...(args.secao && { secao: args.secao }),
          });
          return placeholder._id;
        }
      }

      // â”€â”€ Primeiro acesso: vira admin master automaticamente â”€â”€
      const totalUsers = await ctx.db.query("users").take(2);
      const isFirstUser = totalUsers.length === 0;
      const isAdminMaster = isFirstUser;

      const id = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name,
        role: isAdminMaster ? "admin" : (args.role ?? "solicitante"),
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        re: args.re,
        secao: args.secao,
        approved: isAdminMaster,
        isAdminMaster: isAdminMaster, // marca o primeiro admin como master
        createdAt: Date.now(),
      });
      return id;
    }
  },
});

export const approveUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(
      v.union(
        v.literal("solicitante"),
        v.literal("gestor"),
        v.literal("tecnico")
      )
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("NÃ£o autorizado");
    }
    await ctx.db.patch(args.userId, {
      approved: true,
      ...(args.role && { role: args.role }),
    });
  },
});

// Atualizar role de um usuÃ¡rio jÃ¡ aprovado (e suspender/reativar)
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("solicitante"),
      v.literal("gestor"),
      v.literal("tecnico"),
      v.literal("admin")
    ),
    approved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("NÃ£o autorizado");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("UsuÃ¡rio nÃ£o encontrado");
    // NÃ£o pode rebaixar o prÃ³prio admin master (proteÃ§Ã£o)
    if (target.isAdminMaster && target._id !== user._id) {
      throw new Error("NÃ£o Ã© possÃ­vel alterar o Admin Master");
    }
    const updates: any = { role: args.role };
    if (args.approved !== undefined) updates.approved = args.approved;
    await ctx.db.patch(args.userId, updates);
  },
});

// Excluir usuÃ¡rio PERMANENTEMENTE - SÃ“ Admin Master
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user) throw new Error("NÃ£o autorizado");
    if (user.isAdminMaster !== true) {
      throw new Error("Apenas o Admin Master pode excluir usuÃ¡rios");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("UsuÃ¡rio nÃ£o encontrado");
    // ProteÃ§Ãµes
    if (target._id === user._id) {
      throw new Error("VocÃª nÃ£o pode excluir a si mesmo");
    }
    if (target.isAdminMaster) {
      throw new Error("NÃ£o Ã© possÃ­vel excluir o Admin Master");
    }
    // Verifica se tem serviÃ§os vinculados
    const servicos = await ctx.db
      .query("servicos")
      .withIndex("by_solicitante", (q) => q.eq("solicitanteId", args.userId))
      .collect();
    if (servicos.length > 0) {
      throw new Error(`UsuÃ¡rio tem ${servicos.length} serviÃ§o(s) vinculado(s). Use "Excluir em cascata" pra apagar tudo junto.`);
    }
    // Verifica se Ã© tÃ©cnico
    const tecnicos = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    if (tecnicos.length > 0) {
      throw new Error("UsuÃ¡rio Ã© tÃ©cnico cadastrado. Exclua-o na pÃ¡gina de Equipes primeiro.");
    }
    await ctx.db.delete(args.userId);
  },
});

// Debug: lista todos os users (apenas pra diagnÃ³stico)
export const debugListUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      clerkId: u.clerkId,
      email: u.email,
      name: u.name,
      role: u.role,
      graduacao: u.graduacao,
      nomeDeGuerra: u.nomeDeGuerra,
      re: u.re,
      approved: u.approved,
      isAdminMaster: u.isAdminMaster,
      fcmToken: u.fcmToken ?? null, // <- ADICIONADO pra diagnosticar push
      createdAt: u.createdAt,
    }));
  },
});

// Debug: lista os logs do app (FCM, login, etc) - Ãºltimos 50
export const debugListLogs = query({
  args: { source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("debugLogs").order("desc");
    if (args.source) {
      q = ctx.db.query("debugLogs").withIndex("by_source", (qq) => qq.eq("source", args.source as string));
    }
    const logs = await q.take(50);
    return logs;
  },
});

// Public mutation usada pela httpAction fcmDebugLog (nÃ£o exige auth)
export const addDebugLogPublic = mutation({
  args: {
    source: v.string(),
    step: v.string(),
    info: v.optional(v.string()),
    clerkId: v.optional(v.string()),
    hasToken: v.optional(v.boolean()),
    hasClerkUser: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("debugLogs", {
      source: args.source,
      step: args.step,
      info: args.info,
      clerkId: args.clerkId,
      hasToken: args.hasToken,
      hasClerkUser: args.hasClerkUser,
      error: args.error,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// Public mutation usada pela httpAction /runMigration para criar servicos retroativos
// (servicos que aconteceram antes do sistema entrar em uso)
export const criarServicoAdminPublic = mutation({
  args: {
    criadoPorUserId: v.id("users"),
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),
    urgencia: v.union(v.literal("baixa"), v.literal("media"), v.literal("alta"), v.literal("critica")),
    equipeId: v.id("equipes"),
    tecnicoId: v.id("tecnicos"),
    solicitanteNome: v.string(),
    solicitanteGraduacao: v.string(),
    solicitanteNomeDeGuerra: v.string(),
    solicitanteRe: v.string(),
    solicitanteSecao: v.string(),
    dataInicioExec: v.optional(v.string()),
    dataFimExec: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Valida que o user existe e Ã© admin
    const admin = await ctx.db.get(args.criadoPorUserId);
    if (!admin) throw new Error("User admin nÃ£o encontrado");
    if (admin.role !== "admin" || !admin.isAdminMaster) {
      throw new Error("Apenas Admin Master pode usar");
    }

    const status = args.dataFimExec ? "concluido" : "em_andamento";
    const servicoId = await ctx.db.insert("servicos", {
      solicitanteId: args.criadoPorUserId,
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      status: status as any,
      equipeId: args.equipeId,
      tecnicoId: args.tecnicoId,
      cadastroDireto: true,
      dadosSolicitante: {
        nome: args.solicitanteNome,
        graduacao: args.solicitanteGraduacao,
        nomeDeGuerra: args.solicitanteNomeDeGuerra,
        re: args.solicitanteRe,
        secao: args.solicitanteSecao,
      },
      dataInicioExec: args.dataInicioExec,
      dataFimExec: args.dataFimExec,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Log de inÃ­cio (se tiver dataInicioExec)
    if (args.dataInicioExec) {
      await ctx.db.insert("serviceLogs", {
        servicoId,
        tecnicoId: args.tecnicoId,
        acao: "inicio",
        observacao: `Cadastro retroativo â€” inÃ­cio: ${args.dataInicioExec}`,
        createdAt: new Date(args.dataInicioExec).getTime(),
      });
    }
    // Log de fim (se tiver dataFimExec)
    if (args.dataFimExec) {
      await ctx.db.insert("serviceLogs", {
        servicoId,
        tecnicoId: args.tecnicoId,
        acao: "fim",
        observacao: `Cadastro retroativo â€” fim: ${args.dataFimExec}`,
        createdAt: new Date(args.dataFimExec).getTime(),
      });
    }

    return { ok: true, servicoId };
  },
});

// Debug: lista todos os servicos (sem filtro de user) - pra verificar migrations
export const debugListAllServicos = query({
  args: {},
  handler: async (ctx) => {
    const servicos = await ctx.db.query("servicos").order("desc").take(50);
    return servicos;
  },
});

// Public mutations usadas pela httpAction /runMigration (migrations de schema)
export const setDefaultTecnicoModalidadesPublic = mutation({
  args: { id: v.id("tecnicos"), modalidades: v.array(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { modalidades: args.modalidades as any });
    return { ok: true };
  },
});

export const setDefaultServicoModalidadePublic = mutation({
  args: { id: v.id("servicos"), modalidade: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { modalidade: args.modalidade as any });
    return { ok: true };
  },
});

export const listAllTecnicosPublic = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tecnicos").collect(),
});

export const listAllServicosPublic = query({
  args: {},
  handler: async (ctx) => ctx.db.query("servicos").collect(),
});

export const findServicoByIdPublic = query({
  args: { id: v.id("servicos") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const patchServicoSolicitanteIdPublic = mutation({
  args: { id: v.id("servicos"), solicitanteId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { solicitanteId: args.solicitanteId });
    return { ok: true };
  },
});

export const findTecnicoByReAndEquipePublic = query({
  args: { re: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tecnicos")
      .filter((q) => q.eq(q.field("re"), args.re))
      .first();
  },
});

export const findUserByRePublicSafe = query({
  args: { re: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("re"), args.re))
      .collect();
    return users.find((u) => !u.clerkId.startsWith("pendente:")) ?? null;
  },
});

export const listEquipesPublic = query({
  args: {},
  handler: async (ctx) => ctx.db.query("equipes").collect(),
});

export const cadastrarTecnicoAdminPublic = mutation({
  args: {
    userId: v.id("users"),
    equipeId: v.id("equipes"),
    graduacao: v.string(),
    nomeDeGuerra: v.string(),
    re: v.string(),
    modalidades: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("tecnicos", {
      userId: args.userId,
      equipeId: args.equipeId,
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      ativo: true,
      status: "ativo",
      modalidades: args.modalidades as any,
      createdAt: Date.now(),
    });
    return { tecnicoId: id };
  },
});

export const setEquipeModalidadePublic = mutation({
  args: { id: v.id("equipes"), modalidade: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { modalidade: args.modalidade as any });
    return { ok: true };
  },
});

export const criarEquipeAdminPublic = mutation({
  args: { nome: v.string(), modalidade: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("equipes", {
      nome: args.nome,
      modalidade: args.modalidade as any,
      ativo: true,
      createdAt: Date.now(),
    });
    return { equipeId: id };
  },
});

export const patchTecnicoEquipePublic = mutation({
  args: { id: v.id("tecnicos"), equipeId: v.id("equipes") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { equipeId: args.equipeId });
    return { ok: true };
  },
});

// Queries/mutations pÃºblicas usadas pela httpAction /runMigration (correÃ§Ã£o de vÃ­nculo)
export const findTecnicoByRePublic = query({
  args: { re: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tecnicos")
      .filter((q) => q.eq(q.field("re"), args.re))
      .first();
  },
});

export const findRealUserByRePublic = query({
  args: { re: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("re"), args.re))
      .collect();
    return users.find((u) => !u.clerkId.startsWith("pendente:")) ?? null;
  },
});

export const patchTecnicoUserIdPublic = mutation({
  args: { tecnicoId: v.id("tecnicos"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tecnicoId, { userId: args.userId });
    return { ok: true };
  },
});

export const deletePlaceholderUsersByRePublic = mutation({
  args: { re: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("re"), args.re))
      .collect();
    let deleted = 0;
    for (const u of users) {
      if (u.clerkId.startsWith("pendente:")) {
        await ctx.db.delete(u._id);
        deleted++;
      }
    }
    return deleted;
  },
});

// Limpa o FCM token de um user (sÃ³ admin master) - usado na pÃ¡gina de debug
export const clearFcmTokenAdmin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || currentUser.role !== "admin" || !currentUser.isAdminMaster) {
      throw new Error("Apenas Admin Master pode limpar tokens de outros");
    }
    await ctx.db.patch(args.userId, { fcmToken: "" });
    return { ok: true };
  },
});

// Excluir usuÃ¡rio EM CASCATA - SÃ“ Admin Master
// Apaga TUDO do user: serviÃ§os onde foi solicitante, tÃ©cnicos vinculados, e o user
// (serviÃ§os onde o user Ã© TÃ‰CNICO nÃ£o sÃ£o apagados - sÃ³ ficam sem responsÃ¡vel)
export const forceDeleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!user) throw new Error("NÃ£o autorizado");
    if (user.isAdminMaster !== true) {
      throw new Error("Apenas o Admin Master pode excluir usuÃ¡rios");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("UsuÃ¡rio nÃ£o encontrado");
    if (target._id === user._id) {
      throw new Error("VocÃª nÃ£o pode excluir a si mesmo");
    }
    if (target.isAdminMaster) {
      throw new Error("NÃ£o Ã© possÃ­vel excluir o Admin Master");
    }

    // 1. Apaga tÃ©cnicos do user (e seus serviceLogs)
    const tecnicos = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const t of tecnicos) {
      const logs = await ctx.db
        .query("serviceLogs")
        .withIndex("by_tecnico", (q) => q.eq("tecnicoId", t._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      await ctx.db.delete(t._id);
    }

    // 2. Apaga serviÃ§os onde o user foi solicitante
    const servicos = await ctx.db
      .query("servicos")
      .withIndex("by_solicitante", (q) => q.eq("solicitanteId", args.userId))
      .collect();
    for (const s of servicos) {
      const logs = await ctx.db
        .query("serviceLogs")
        .withIndex("by_servico", (q) => q.eq("servicoId", s._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      await ctx.db.delete(s._id);
    }

    // 3. Apaga o user
    await ctx.db.delete(args.userId);
    return { ok: true, message: "UsuÃ¡rio e dependÃªncias excluÃ­dos" };
  },
});

export const criarServico = mutation({
  args: {
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),
    urgencia: v.union(
      v.literal("baixa"),
      v.literal("media"),
      v.literal("alta"),
      v.literal("critica")
    ),
    modalidade: v.optional(
      v.union(
        v.literal("servicos_gerais"),
        v.literal("informatica")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || !user.approved) throw new Error("UsuÃ¡rio nÃ£o aprovado");

    const modalidade = args.modalidade ?? "servicos_gerais";

    const newId = await ctx.db.insert("servicos", {
      solicitanteId: user._id,
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      modalidade: modalidade,
      status: "pendente",
      createdAt: Date.now(),
    });

    // PUSH: notifica todos os gestores
    const gestores = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "gestor"))
      .collect();
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    const tokens = [...gestores, ...admins]
      .map((u) => u.fcmToken)
      .filter((t): t is string => !!t);
    await sendPushNotification(
      ctx, tokens,
      "ðŸ”” Novo serviÃ§o aguardando aprovaÃ§Ã£o",
      `${user.graduacao ?? ""} ${user.nomeDeGuerra ?? user.name}: ${args.titulo}`,
      "/gestor"
    );

    return newId;
  },
});

export const atribuirServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    equipeId: v.id("equipes"),
    tecnicoId: v.optional(v.id("tecnicos")), // atribuir a um tecnico especifico (opcional)
    dataAgendada: v.optional(v.string()),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("NÃ£o autorizado");
    }

    const servico = await ctx.db.get(args.servicoId);
    if (!servico) throw new Error("ServiÃ§o nÃ£o encontrado");

    // Valida que a equipe Ã© da mesma modalidade do serviÃ§o
    const equipeDoServico = await ctx.db.get(args.equipeId);
    if (!equipeDoServico) throw new Error("Equipe nÃ£o encontrada");
    const servicoModalidade = servico.modalidade ?? "servicos_gerais";
    if (equipeDoServico.modalidade && equipeDoServico.modalidade !== servicoModalidade) {
      throw new Error(
        `A equipe "${equipeDoServico.nome}" Ã© de ${equipeDoServico.modalidade === "informatica" ? "InformÃ¡tica" : "ServiÃ§os Gerais"}, ` +
        `mas o serviÃ§o Ã© de ${servicoModalidade === "informatica" ? "InformÃ¡tica" : "ServiÃ§os Gerais"}. ` +
        `Selecione uma equipe da mesma modalidade.`
      );
    }

    // Valida que o tÃ©cnico (se especÃ­fico) pode atuar nessa modalidade
    if (args.tecnicoId) {
      const tec = await ctx.db.get(args.tecnicoId);
      if (!tec) throw new Error("TÃ©cnico nÃ£o encontrado");
      const tecModalidades = (tec.modalidades && tec.modalidades.length > 0) ? tec.modalidades : ["servicos_gerais"];
      if (!tecModalidades.includes(servicoModalidade)) {
        throw new Error(
          `Este tÃ©cnico nÃ£o atua em ${servicoModalidade === "informatica" ? "InformÃ¡tica" : "ServiÃ§os Gerais"}. ` +
          `Selecione um tÃ©cnico dessa modalidade.`
        );
      }
    }

    // Se estava pausado, mantÃ©m pausado (equipe nova vai retomar)
    // Se era pendente, volta pra aprovado
    const novoStatus = servico.status === "pausado" ? "pausado" : "aprovado";

    await ctx.db.patch(args.servicoId, {
      equipeId: args.equipeId,
      tecnicoId: args.tecnicoId, // se null, qualquer tecnico da equipe pode pegar
      dataAgendada: args.dataAgendada,
      observacaoGestor: args.observacao,
      status: novoStatus as any,
      updatedAt: Date.now(),
    });

    // PUSH: notifica o tÃ©cnico (se especÃ­fico) ou todos da equipe
    const tokens: string[] = [];
    if (args.tecnicoId) {
      const tec = await ctx.db.get(args.tecnicoId);
      if (tec) {
        const userTec = await ctx.db.get(tec.userId);
        if (userTec?.fcmToken) tokens.push(userTec.fcmToken);
      }
    } else {
      // Notifica todos os tÃ©cnicos ativos da equipe
      const tecs = await ctx.db
        .query("tecnicos")
        .withIndex("by_equipe", (q) => q.eq("equipeId", args.equipeId))
        .collect();
      for (const t of tecs) {
        if (t.ativo && (t.status === "ativo" || !t.status)) {
          const u = await ctx.db.get(t.userId);
          if (u?.fcmToken) tokens.push(u.fcmToken);
        }
      }
    }
    const equipePraNotif = await ctx.db.get(args.equipeId);
    await sendPushNotification(
      ctx, tokens,
      "ðŸ”§ Novo serviÃ§o atribuÃ­do",
      `${servico.titulo} â€” ${equipePraNotif?.nome ?? "equipe"}`,
      "/tecnico"
    );
  },
});

export const pausarServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    motivo: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("NÃ£o autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("TÃ©cnico nÃ£o cadastrado");

    const servico = await ctx.db.get(args.servicoId);
    if (!servico || servico.equipeId !== tecnico.equipeId) {
      throw new Error("ServiÃ§o nÃ£o pertence Ã  sua equipe");
    }

    await ctx.db.patch(args.servicoId, {
      status: "pausado",
      motivoPausa: args.motivo,
      pausadoEm: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "observacao",
      observacao: `â¸ Pausado: ${args.motivo}`,
      createdAt: Date.now(),
    });
  },
});

export const retomarServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("NÃ£o autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("TÃ©cnico nÃ£o cadastrado");

    const servico = await ctx.db.get(args.servicoId);
    if (!servico) throw new Error("ServiÃ§o nÃ£o encontrado");

    // Se NÃƒO Ã© pausado, mantÃ©m regra original: sÃ³ a equipe responsÃ¡vel pode retomar
    if (servico.status !== "pausado" && servico.equipeId !== tecnico.equipeId) {
      throw new Error("ServiÃ§o nÃ£o pertence Ã  sua equipe");
    }

    // Servico pausado: qualquer tecnico de qualquer equipe pode retomar
    // Ao retomar, transfere o servico pra equipe do novo tecnico
    const transferido = servico.status === "pausado" && servico.equipeId !== tecnico.equipeId;
    const equipeAnterior = servico.equipeId;

    await ctx.db.patch(args.servicoId, {
      status: "em_andamento",
      tecnicoId: tecnico._id,
      equipeId: tecnico.equipeId, // transfere pra equipe que estÃ¡ retomando
      motivoPausa: undefined,
      pausadoEm: undefined,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "inicio",
      observacao: transferido
        ? `â–¶ï¸ Retomado por outra equipe (anterior: ${equipeAnterior})`
        : "â–¶ï¸ Retomado",
      createdAt: Date.now(),
    });
  },
});

export const iniciarServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("NÃ£o autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("TÃ©cnico nÃ£o cadastrado");

    const servico = await ctx.db.get(args.servicoId);
    if (!servico || servico.equipeId !== tecnico.equipeId) {
      throw new Error("ServiÃ§o nÃ£o pertence Ã  sua equipe");
    }
    // Se jÃ¡ tem tecnicoId definido (especÃ­fico), sÃ³ esse pode iniciar
    if (servico.tecnicoId && servico.tecnicoId !== tecnico._id) {
      throw new Error("Este serviÃ§o estÃ¡ atribuÃ­do a outro tÃ©cnico da sua equipe");
    }

    await ctx.db.patch(args.servicoId, {
      tecnicoId: tecnico._id,
      status: "em_andamento",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "inicio",
      createdAt: Date.now(),
    });
  },
});

export const encerrarServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || user.role !== "tecnico") throw new Error("NÃ£o autorizado");

    const tecnico = await ctx.db
      .query("tecnicos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!tecnico) throw new Error("TÃ©cnico nÃ£o cadastrado");

    await ctx.db.patch(args.servicoId, {
      status: "concluido",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("serviceLogs", {
      servicoId: args.servicoId,
      tecnicoId: tecnico._id,
      acao: "fim",
      observacao: args.observacao,
      createdAt: Date.now(),
    });

    // PUSH: notifica o gestor e o solicitante (sÃ³ se NÃƒO for cadastroDireto)
    const servico = await ctx.db.get(args.servicoId);
    if (servico && !servico.cadastroDireto) {
      const tokens: string[] = [];
      // Gestores
      const gestores = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "gestor"))
        .collect();
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      for (const u of [...gestores, ...admins]) {
        if (u.fcmToken) tokens.push(u.fcmToken);
      }
      // Solicitante (sÃ³ se nÃ£o for cadastroDireto - aÃ­ tem user real)
      if (servico.solicitanteId) {
        const sol = await ctx.db.get(servico.solicitanteId);
        if (sol?.fcmToken) tokens.push(sol.fcmToken);
      }
      await sendPushNotification(
        ctx, tokens,
        "âœ… ServiÃ§o concluÃ­do",
        `${servico.titulo} â€” por ${tecnico.graduacao} ${tecnico.nomeDeGuerra}`,
        "/gestor"
      );
    }
  },
});

export const criarEquipe = mutation({
  args: { nome: v.string() },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user || (user.role !== "gestor" && user.role !== "admin")) {
      throw new Error("NÃ£o autorizado");
    }

    return await ctx.db.insert("equipes", {
      nome: args.nome,
      ativo: true,
      createdAt: Date.now(),
    });
  },
});

export const criarServicoDireto = mutation({
  args: {
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),
    urgencia: v.union(
      v.literal("baixa"),
      v.literal("media"),
      v.literal("alta"),
      v.literal("critica")
    ),
    modalidade: v.optional(
      v.union(
        v.literal("servicos_gerais"),
        v.literal("informatica")
      )
    ),
    // dados do solicitante
    solicitanteNome: v.string(),
    solicitanteGraduacao: v.string(),
    solicitanteNomeDeGuerra: v.string(),
    solicitanteRe: v.string(),
    solicitanteSecao: v.string(),
    // datas de execuÃ§Ã£o
    dataInicioExec: v.optional(v.string()),
    dataFimExec: v.optional(v.string()),
    // pra admin master escolher equipe + tÃ©cnico quando nÃ£o tem vÃ­nculo
    equipeId: v.optional(v.id("equipes")),
    tecnicoId: v.optional(v.id("tecnicos")),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("NÃ£o autenticado");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();

    if (!user) throw new Error("NÃ£o autorizado");
    if (user.role !== "tecnico" && user.role !== "admin") {
      throw new Error("Apenas tÃ©cnicos e Admin Master podem fazer cadastro direto");
    }

    // Pra tÃ©cnico: usa o prÃ³prio vÃ­nculo
    // Pra admin: usa o tecnicoId/equipeId passado
    let equipeIdFinal: any;
    let tecnicoIdFinal: any;

    if (user.role === "tecnico") {
      const tecnico = await ctx.db
        .query("tecnicos")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (!tecnico) throw new Error("TÃ©cnico nÃ£o cadastrado em nenhuma equipe");
      equipeIdFinal = tecnico.equipeId;
      tecnicoIdFinal = tecnico._id;
    } else {
      // admin master
      if (!args.equipeId) throw new Error("Admin Master precisa informar a equipe");
      if (!args.tecnicoId) throw new Error("Admin Master precisa informar o tÃ©cnico");
      equipeIdFinal = args.equipeId;
      tecnicoIdFinal = args.tecnicoId;
    }

    // Se forneceu dataFim â†’ jÃ¡ nasce concluÃ­do
    const status = args.dataFimExec ? "concluido" : "em_andamento";

    const servicoId = await ctx.db.insert("servicos", {
      solicitanteId: user._id,
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      status: status as any,
      equipeId: equipeIdFinal,
      tecnicoId: tecnicoIdFinal,
      cadastroDireto: true,
      dadosSolicitante: {
        nome: args.solicitanteNome,
        graduacao: args.solicitanteGraduacao,
        nomeDeGuerra: args.solicitanteNomeDeGuerra,
        re: args.solicitanteRe,
        secao: args.solicitanteSecao,
      },
      dataInicioExec: args.dataInicioExec,
      dataFimExec: args.dataFimExec,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Log de inÃ­cio
    if (args.dataInicioExec) {
      await ctx.db.insert("serviceLogs", {
        servicoId,
        tecnicoId: tecnicoIdFinal,
        acao: "inicio",
        observacao: `Cadastro direto â€” inÃ­cio: ${args.dataInicioExec}`,
        createdAt: new Date(args.dataInicioExec).getTime(),
      });
    }

    // Log de fim se fornecido
    if (args.dataFimExec) {
      await ctx.db.insert("serviceLogs", {
        servicoId,
        tecnicoId: tecnicoIdFinal,
        acao: "fim",
        observacao: `Cadastro direto â€” fim: ${args.dataFimExec}`,
        createdAt: new Date(args.dataFimExec).getTime(),
      });
    }

    return servicoId;
  },
});

export const cadastrarTecnico = mutation({
  args: {
    equipeId: v.id("equipes"),
    graduacao: v.string(),
    nomeDeGuerra: v.string(),
    re: v.string(),
    modalidades: v.optional(
      v.array(
        v.union(
          v.literal("servicos_gerais"),
          v.literal("informatica")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();

    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("NÃ£o autorizado");
    }

    // Verifica se jÃ¡ existe um tecnico com esse RE
    const existingTecnico = await ctx.db
      .query("tecnicos")
      .filter((q) => q.eq(q.field("re"), args.re))
      .first();

    if (existingTecnico) {
      // Se jÃ¡ existe o RE: atualiza SÃ“ se for da MESMA equipe
      // (se for de outra equipe, Ã© o mesmo PM com RE duplicado â€” nÃ£o mexe)
      if (existingTecnico.equipeId === args.equipeId) {
        // Modalidades: atualiza se informado, senÃ£o mantÃ©m as existentes
        const update: any = {
          graduacao: args.graduacao,
          nomeDeGuerra: args.nomeDeGuerra,
          ativo: true,
        };
        if (args.modalidades && args.modalidades.length > 0) {
          update.modalidades = args.modalidades;
        }
        await ctx.db.patch(existingTecnico._id, update);
        return existingTecnico._id;
      }
      // RE existe em outra equipe â†’ throw
      throw new Error(
        `JÃ¡ existe um tÃ©cnico com RE ${args.re} em outra equipe. Use o botÃ£o "Editar" para movÃª-lo.`
      );
    }

    // Verifica se jÃ¡ existe um USER (nÃ£o-placeholder) com esse RE
    // (Pode acontecer do tÃ©cnico ter logado no Clerk ANTES do gestor cadastrÃ¡-lo)
    let userId: Id<"users">;
    // Sem Ã­ndice by_re (pra evitar migration de schema), usa filter + first
    const candidates = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("re"), args.re))
      .collect();
    const realUserWithRe = candidates.find(
      (u) => u.re === args.re && !u.clerkId.startsWith("pendente:")
    );

    if (realUserWithRe) {
      // User jÃ¡ fez login com esse RE â†’ vincula o tecnico a ele
      userId = realUserWithRe._id;
      // Guarda o role antigo pro feedback
      const previousRole = realUserWithRe.role;
      // Atualiza dados do user pra refletir o cadastro
      await ctx.db.patch(userId, {
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        role: "tecnico",
        approved: true,
      });

      // Modalidades: se nÃ£o informado, define baseado na equipe
      let modalidades: any = args.modalidades;
      if (!modalidades || modalidades.length === 0) {
        const equipeTecReal = await ctx.db.get(args.equipeId);
        modalidades = equipeTecReal?.modalidade ? [equipeTecReal.modalidade] : ["servicos_gerais"];
      }

      const tecnicoId = await ctx.db.insert("tecnicos", {
        userId,
        equipeId: args.equipeId,
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        re: args.re,
        ativo: true,
        status: "ativo" as const,
        modalidades,
        createdAt: Date.now(),
      });
      return {
        tecnicoId,
        convertedFromExistingUser: true,
        previousRole,
        userName: realUserWithRe.name,
      };
    } else {
      // Cria um user PLACEHOLDER pro tecnico (clerkId fake)
      // Quando o tecnico real logar, o upsertUser vincula pelo RE
      const placeholderClerkId = `pendente:${args.re}`;
      userId = await ctx.db.insert("users", {
        clerkId: placeholderClerkId,
        email: `${args.re}@pendente.pmesp`,
        name: args.nomeDeGuerra,
        role: "tecnico",
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        re: args.re,
        secao: "ManutenÃ§Ã£o",
        approved: true,
        createdAt: Date.now(),
      });
    }

    // Modalidades: se nÃ£o informado, define baseado na equipe
    let modalidades: any = args.modalidades;
    if (!modalidades || modalidades.length === 0) {
      const equipeTecFinal = await ctx.db.get(args.equipeId);
      modalidades = equipeTecFinal?.modalidade ? [equipeTecFinal.modalidade] : ["servicos_gerais"];
    }

    return await ctx.db.insert("tecnicos", {
      userId,
      equipeId: args.equipeId,
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      ativo: true,
      status: "ativo" as const,
      modalidades,
      createdAt: Date.now(),
    });
  },
});

// -- Debug / Fix account -----------------------------------------------------
export const anyAdminExists = query({
  args: {},
  handler: async (ctx) => {
    const admin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    return { exists: !!admin, admin };
  },
});

// Corrige vÃ­nculo de tÃ©cnico: associa um tecnico existente ao user REAL que logou
// (caso o tÃ©cnico tenha logado no Clerk ANTES do gestor cadastrÃ¡-lo)
// Apenas Admin Master pode usar
export const fixTecnicoUserLink = mutation({
  args: { re: v.string() },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("NÃ£o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || !currentUser.isAdminMaster) {
      throw new Error("Apenas Admin Master pode usar");
    }

    // Acha o tecnico (com esse RE, ativo)
    const tecnico = await ctx.db
      .query("tecnicos")
      .filter((q) => q.eq(q.field("re"), args.re))
      .first();
    if (!tecnico) throw new Error(`TÃ©cnico com RE ${args.re} nÃ£o encontrado`);

    // Acha o user REAL (com clerkId nÃ£o-placeholder) com esse RE
    const allUsers = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("re"), args.re))
      .collect();
    const realUser = allUsers.find((u) => !u.clerkId.startsWith("pendente:"));
    if (!realUser) throw new Error(`User real com RE ${args.re} nÃ£o encontrado`);

    // Atualiza o tecnico pra apontar pro user real
    await ctx.db.patch(tecnico._id, { userId: realUser._id });

    // Deleta o placeholder orfÃ£o (se existir)
    for (const u of allUsers) {
      if (u.clerkId.startsWith("pendente:")) {
        await ctx.db.delete(u._id);
      }
    }

    return {
      ok: true,
      tecnicoId: tecnico._id,
      realUserId: realUser._id,
      deletedPlaceholders: allUsers.length - 1,
    };
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

export const forceAdminMaster = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Nï¿½o autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .first();
    if (!user) throw new Error("User nï¿½o existe no banco. Preencha o perfil em /pendente primeiro.");
    await ctx.db.patch(user._id, {
      role: "admin",
      approved: true,
      isAdminMaster: true,
    });
    return { ok: true, newRole: "admin" };
  },
});

// -- Editar / Excluir Tecnico ------------------------------------------------
export const alterarStatusTecnico = mutation({
  args: {
    tecnicoId: v.id("tecnicos"),
    status: v.union(
      v.literal("ativo"),
      v.literal("ferias"),
      v.literal("baixa")
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nao autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nao autorizado");
    }
    await ctx.db.patch(args.tecnicoId, { status: args.status });
    return { ok: true };
  },
});

export const editarTecnico = mutation({
  args: {
    tecnicoId: v.id("tecnicos"),
    graduacao: v.string(),
    nomeDeGuerra: v.string(),
    re: v.string(),
    equipeId: v.id("equipes"),
    ativo: v.boolean(),
    modalidades: v.optional(
      v.array(
        v.union(
          v.literal("servicos_gerais"),
          v.literal("informatica")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nï¿½o autenticado");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nï¿½o autorizado");
    }

    const tecnico = await ctx.db.get(args.tecnicoId);
    if (!tecnico) throw new Error("Tï¿½cnico nï¿½o encontrado");

    // Atualiza o tecnico
    const update: any = {
      graduacao: args.graduacao,
      nomeDeGuerra: args.nomeDeGuerra,
      re: args.re,
      equipeId: args.equipeId,
      ativo: args.ativo,
    };
    if (args.modalidades && args.modalidades.length > 0) {
      update.modalidades = args.modalidades;
    }
    await ctx.db.patch(args.tecnicoId, update);

    // Sincroniza os dados no user placeholder (se for placeholder)
    const user = await ctx.db.get(tecnico.userId);
    if (user && user.clerkId.startsWith("pendente:")) {
      await ctx.db.patch(tecnico.userId, {
        graduacao: args.graduacao,
        nomeDeGuerra: args.nomeDeGuerra,
        re: args.re,
        name: args.nomeDeGuerra,
      });
    }

    return args.tecnicoId;
  },
});

export const excluirTecnico = mutation({
  args: { tecnicoId: v.id("tecnicos") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nï¿½o autenticado");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nï¿½o autorizado");
    }

    const tecnico = await ctx.db.get(args.tecnicoId);
    if (!tecnico) throw new Error("Tï¿½cnico nï¿½o encontrado");

    // Verifica se hï¿½ serviï¿½os pendentes atribuï¿½dos a este tecnico
    const servicosPendentes = await ctx.db
      .query("servicos")
      .withIndex("by_status", (q) => q.eq("status", "em_andamento"))
      .filter((q) => q.eq(q.field("tecnicoId"), args.tecnicoId))
      .first();

    if (servicosPendentes) {
      throw new Error("Nï¿½o ï¿½ possï¿½vel excluir: tï¿½cnico tem serviï¿½os em andamento");
    }

    // Soft delete: marca como inativo
    await ctx.db.patch(args.tecnicoId, { ativo: false });

    return { ok: true, softDeleted: true };
  },
});

// -- Gestï¿½o de Serviï¿½os (admin/gestor) ---------------------------------------
export const excluirServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nï¿½o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nï¿½o autorizado");
    }
    // So o admin master pode excluir permanentemente
    if (!currentUser.isAdminMaster) {
      throw new Error("Apenas o Admin Master pode excluir. Use Cancelar.");
    }
    // Apaga os logs relacionados
    const logs = await ctx.db
      .query("serviceLogs")
      .withIndex("by_servico", (q) => q.eq("servicoId", args.servicoId))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
    // Apaga o serviï¿½o
    await ctx.db.delete(args.servicoId);
    return { ok: true };
  },
});

export const cancelarServico = mutation({
  args: { servicoId: v.id("servicos") },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nï¿½o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nï¿½o autorizado");
    }
    await ctx.db.patch(args.servicoId, {
      status: "cancelado",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const editarServico = mutation({
  args: {
    servicoId: v.id("servicos"),
    titulo: v.string(),
    descricao: v.string(),
    local: v.string(),
    urgencia: v.union(
      v.literal("baixa"),
      v.literal("media"),
      v.literal("alta"),
      v.literal("critica")
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getCurrentUserId(ctx);
    if (!currentUserId) throw new Error("Nï¿½o autenticado");
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", currentUserId))
      .first();
    if (!currentUser || (currentUser.role !== "gestor" && currentUser.role !== "admin")) {
      throw new Error("Nï¿½o autorizado");
    }
    await ctx.db.patch(args.servicoId, {
      titulo: args.titulo,
      descricao: args.descricao,
      local: args.local,
      urgencia: args.urgencia,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
