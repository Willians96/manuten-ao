import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * HTTP Action pública para o app Android salvar o FCM token.
 *
 * Fluxo:
 *   1. Android pega o token via FirebaseMessaging.getInstance().token
 *   2. WebView carrega, JS pega Clerk.user.id + window.__fcmToken
 *   3. JS faz POST pra cá com {clerkId, token, appSecret}
 *   4. A action valida secret, chama runQuery/runMutation e salva fcmToken
 *
 * Por que não usar a mutation saveFcmToken (autenticada)?
 *   - A mutation autenticada exige JWT do Clerk, que só existe no browser
 *   - Esta httpAction é stateless, validada por secret compartilhado
 *
 * IMPORTANTE: trocar FCM_APP_SECRET em produção!
 * Definir via: npx convex env set FCM_APP_SECRET "outro-valor-aqui"
 */
const APP_SECRET = process.env.FCM_APP_SECRET || "PMESP-FCM-2026-manutencao-drab";

const saveFcmToken = httpAction(async (ctx, request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const { clerkId, token, appSecret } = body || {};
  if (!clerkId || !token || typeof clerkId !== "string" || typeof token !== "string") {
    return new Response(
      JSON.stringify({ error: "clerkId and token are required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Valida secret
  if (appSecret !== APP_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Procura o user via query pública
  const user = await ctx.runQuery(api.mutations.findUserByClerkIdPublic, { clerkId });
  if (!user) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Salva token via mutation pública
  await ctx.runMutation(api.mutations.setFcmTokenByUserIdPublic, {
    userId: user._id,
    token,
  });

  return new Response(
    JSON.stringify({ ok: true, userId: user._id }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});

const http = httpRouter();
http.route({
  path: "/saveFcmToken",
  method: "POST",
  handler: saveFcmToken,
});

// HTTP action pra debug do FCM - loga cada passo do app Android
// Grava na tabela debugLogs que pode ser vista em /debug-fcm
const fcmDebugLog = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: any = {};
  try {
    body = await request.json();
  } catch {}
  const { step, info, hasToken, hasClerkUser, clerkId, error, source } = body || {};
  const msg = `[FCM-DEBUG] step=${step} hasToken=${!!hasToken} hasClerkUser=${!!hasClerkUser} clerkId=${clerkId || "?"} info=${info || ""} error=${error || ""}`;
  console.log(msg);

  // Grava na tabela debugLogs via mutation pública
  try {
    await ctx.runMutation(api.mutations.addDebugLogPublic, {
      source: source || "fcm-android",
      step: step || "unknown",
      info,
      clerkId,
      hasToken,
      hasClerkUser,
      error,
    });
  } catch (e) {
    console.error("[FCM-DEBUG] Erro ao gravar no debugLogs:", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

http.route({
  path: "/fcmDebugLog",
  method: "POST",
  handler: fcmDebugLog,
});

// HTTP action admin pra rodar migrations (valida via FCM_APP_SECRET)
// Usada pra corrigir dados do banco sem precisar de auth Clerk
const runMigration = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const APP_SECRET = process.env.FCM_APP_SECRET || "PMESP-FCM-2026-manutencao-drab";
  let body: any = {};
  try { body = await request.json(); } catch {}
  const { name, args: migArgs, appSecret } = body || {};

  if (appSecret !== APP_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "fixTecnicoUserLink") {
    const { re } = migArgs || {};
    if (!re) {
      return new Response(JSON.stringify({ error: "re is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Acha o tecnico via query pública
    const tecnico = await ctx.runQuery(api.mutations.findTecnicoByRePublic, { re });
    if (!tecnico) {
      return new Response(JSON.stringify({ error: `Técnico com RE ${re} não encontrado` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Acha o user real
    const realUser = await ctx.runQuery(api.mutations.findRealUserByRePublic, { re });
    if (!realUser) {
      return new Response(JSON.stringify({ error: `User real com RE ${re} não encontrado` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Atualiza o tecnico
    await ctx.runMutation(api.mutations.patchTecnicoUserIdPublic, {
      tecnicoId: tecnico._id,
      userId: realUser._id,
    });
    // Deleta placeholders
    const deleted = await ctx.runMutation(api.mutations.deletePlaceholderUsersByRePublic, { re });
    return new Response(JSON.stringify({
      ok: true,
      tecnicoId: tecnico._id,
      realUserId: realUser._id,
      realUserName: realUser.name,
      deletedPlaceholders: deleted,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "setDefaultModalidades") {
    // Migration: seta modalidades=["servicos_gerais"] em todos os tecnicos existentes
    // e modalidade="servicos_gerais" em todos os servicos existentes
    const allTecnicos = await ctx.runQuery(api.mutations.listAllTecnicosPublic, {});
    let tecnicosUpdated = 0;
    for (const t of allTecnicos) {
      if (!t.modalidades || t.modalidades.length === 0) {
        await ctx.runMutation(api.mutations.setDefaultTecnicoModalidadesPublic, {
          id: t._id,
          modalidades: ["servicos_gerais"],
        });
        tecnicosUpdated++;
      }
    }
    const allServicos = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    let servicosUpdated = 0;
    for (const s of allServicos) {
      if (!s.modalidade) {
        await ctx.runMutation(api.mutations.setDefaultServicoModalidadePublic, {
          id: s._id,
          modalidade: "servicos_gerais",
        });
        servicosUpdated++;
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      tecnicosUpdated,
      servicosUpdated,
      tecnicosTotal: allTecnicos.length,
      servicosTotal: allServicos.length,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "criarEquipeTIeMoverWilliam") {
    // Cria a equipe "Telemática" (modalidade=informatica) e move o William pra lá
    // Garante que Equipe A/B continuam como servicos_gerais

    // 1. Atualiza equipes existentes pra terem modalidade servicos_gerais (retroativo)
    const allEquipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    let equipesUpdated = 0;
    let equipeTICreated = null;
    for (const eq of allEquipes) {
      if (!eq.modalidade) {
        await ctx.runMutation(api.mutations.setEquipeModalidadePublic, {
          id: eq._id,
          modalidade: "servicos_gerais",
        });
        equipesUpdated++;
      }
    }
    // 2. Verifica se equipe "Telemática" já existe
    const telematica = allEquipes.find((e: any) => e.nome === "Telemática");
    if (telematica) {
      // Garante que tem modalidade informatica
      if (telematica.modalidade !== "informatica") {
        await ctx.runMutation(api.mutations.setEquipeModalidadePublic, {
          id: telematica._id,
          modalidade: "informatica",
        });
      }
      equipeTICreated = telematica;
    } else {
      // Cria a equipe "Telemática"
      const result = await ctx.runMutation(api.mutations.criarEquipeAdminPublic, {
        nome: "Telemática",
        modalidade: "informatica",
      });
      equipeTICreated = { _id: result.equipeId, nome: "Telemática", modalidade: "informatica" };
    }
    // 3. Acha o tecnico William (RE 111926-5) e move pra Telemática
    const williamTecnico = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re: "111926-5" });
    if (williamTecnico) {
      await ctx.runMutation(api.mutations.patchTecnicoEquipePublic, {
        id: williamTecnico._id,
        equipeId: equipeTICreated._id,
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      message: "Equipe Telemática criada/atualizada e William movido pra lá",
      equipeTI: equipeTICreated,
      williamTecnicoId: williamTecnico?._id,
      equipesUpdated,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "cadastrarWilliamComoTecnicoTI") {
    // Cadastra William (admin master, RE 111926-5) como técnico de TI na Equipe A
    // (vamos usar a Equipe A por padrão, pode mudar depois)
    const william = await ctx.runQuery(api.mutations.findUserByRePublicSafe, { re: "111926-5" });
    if (!william) {
      return new Response(JSON.stringify({ error: "William (RE 111926-5) não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Verifica se já é técnico
    const existing = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re: "111926-5" });
    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: "William já é técnico", tecnicoId: existing._id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Pega a primeira equipe (Equipe A)
    const equipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    if (equipes.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma equipe cadastrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const equipeA = equipes[0];
    const result = await ctx.runMutation(api.mutations.cadastrarTecnicoAdminPublic, {
      userId: william._id,
      equipeId: equipeA._id,
      graduacao: "Cb",
      nomeDeGuerra: "William",
      re: "111926-5",
      modalidades: ["informatica"],
    });
    return new Response(JSON.stringify({
      ok: true,
      message: "William cadastrado como técnico de TI!",
      tecnicoId: result.tecnicoId,
      equipe: equipeA.nome,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "createPastService") {
    // Cria um serviço retroativo (que aconteceu antes do sistema entrar em uso)
    if (!migArgs) {
      return new Response(JSON.stringify({ error: "args é obrigatório" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const required = ["criadoPorUserId", "titulo", "descricao", "local", "urgencia", "equipeId", "tecnicoId", "solicitanteNome", "solicitanteGraduacao", "solicitanteNomeDeGuerra", "solicitanteRe", "solicitanteSecao"];
    for (const f of required) {
      if (!migArgs[f]) {
        return new Response(JSON.stringify({ error: `Campo obrigatório: ${f}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    const result = await ctx.runMutation(api.mutations.criarServicoAdminPublic, migArgs);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }


  if (name === "reatribuirSolicitante") {
    // Reatribui o solicitante de um servico para o user de um RE especifico
    // Usado quando o servico foi cadastrado em nome de outra pessoa (cadastroDireto)
    // Args: { servicoId, solicitanteRe }
    if (!migArgs || !migArgs.servicoId || !migArgs.solicitanteRe) {
      return new Response(JSON.stringify({ error: "servicoId e solicitanteRe sao obrigatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const servico = await ctx.runQuery(api.mutations.findServicoByIdPublic, { id: migArgs.servicoId });
    if (!servico) {
      return new Response(JSON.stringify({ error: "Servico nao encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const novoSolicitante = await ctx.runQuery(api.mutations.findUserByRePublicSafe, { re: migArgs.solicitanteRe });
    if (!novoSolicitante) {
      return new Response(JSON.stringify({ error: "User com RE " + migArgs.solicitanteRe + " nao encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    await ctx.runMutation(api.mutations.patchServicoSolicitanteIdPublic, {
      id: migArgs.servicoId,
      solicitanteId: novoSolicitante._id,
    });
    return new Response(JSON.stringify({
      ok: true,
      servicoId: migArgs.servicoId,
      novoSolicitanteId: novoSolicitante._id,
      novoSolicitanteNome: novoSolicitante.nomeDeGuerra || novoSolicitante.name,
      novoSolicitanteGraduacao: novoSolicitante.graduacao,
      novoSolicitanteRe: novoSolicitante.re,
      antigoSolicitanteId: servico.solicitanteId,
      dadosSolicitanteAnterior: servico.dadosSolicitante,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

    return new Response(JSON.stringify({ error: `migration '${name}' not found` }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
});

http.route({
  path: "/runMigration",
  method: "POST",
  handler: runMigration,
});

export default http;
