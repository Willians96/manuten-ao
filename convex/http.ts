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
    // Args: { servicoId? OU titulo, solicitanteRe }
    if (!migArgs || !migArgs.solicitanteRe) {
      return new Response(JSON.stringify({ error: "solicitanteRe e obrigatorio (use servicoId OU titulo)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!migArgs.servicoId && !migArgs.titulo) {
      return new Response(JSON.stringify({ error: "informe servicoId OU titulo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    let servico;
    if (migArgs.servicoId) {
      servico = await ctx.runQuery(api.mutations.findServicoByIdPublic, { id: migArgs.servicoId });
    } else {
      const matches = await ctx.runQuery(api.mutations.findServicoByTituloPublic, { titulo: migArgs.titulo });
      if (matches.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum servico encontrado com esse titulo" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (matches.length > 1) {
        return new Response(JSON.stringify({
          error: "Multiplos servicos encontrados, use servicoId",
          matches: matches.map((m: any) => ({ _id: m._id, titulo: m.titulo, data: m._creationTime })),
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      servico = matches[0];
    }
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
      id: servico._id,
      solicitanteId: novoSolicitante._id,
    });
    return new Response(JSON.stringify({
      ok: true,
      servicoId: servico._id,
      servicoTitulo: servico.titulo,
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

    if (name === "limparTecnicosInativos") {
    // Lista tecnicos com ativo=false e que NAO tem servicos vinculados
    // Deleta eles via deleteTecnicoPublic
    const inativos = await ctx.runQuery(api.mutations.listTecnicosInativosPublic, {});
    const removidos: any[] = [];
    const erros: any[] = [];
    for (const t of inativos) {
      const r = await ctx.runMutation(api.mutations.deleteTecnicoPublic, { id: t._id });
      if (r.ok) {
        removidos.push({ id: t._id, nome: t.nomeDeGuerra, re: t.re });
      } else {
        erros.push({ id: t._id, nome: t.nomeDeGuerra, erro: r.error });
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      totalInativos: inativos.length,
      removidos: removidos.length,
      erros: erros.length,
      detalhes: { removidos, erros },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "corrigirHorariosServicos") {
    // Ajusta dataInicioExec, dataFimExec e status de uma lista de servicos
    // Args: { updates: [{ servicoId, dataInicioExec?, dataFimExec?, status? }] }
    if (!migArgs || !Array.isArray(migArgs.updates) || migArgs.updates.length === 0) {
      return new Response(JSON.stringify({ error: "updates (array) obrigatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const resultados: any[] = [];
    for (const u of migArgs.updates) {
      if (!u.servicoId) {
        resultados.push({ ok: false, error: "servicoId obrigatorio" });
        continue;
      }
      const servico = await ctx.runQuery(api.mutations.findServicoByIdPublic, { id: u.servicoId });
      if (!servico) {
        resultados.push({ ok: false, servicoId: u.servicoId, error: "Servico nao encontrado" });
        continue;
      }
      const patch: any = { updatedAt: Date.now() };
      if (u.dataInicioExec !== undefined) patch.dataInicioExec = u.dataInicioExec;
      if (u.dataFimExec !== undefined) patch.dataFimExec = u.dataFimExec;
      if (u.status) patch.status = u.status;
      const { updatedAt, ...campos } = patch;
      await ctx.runMutation(api.mutations.patchServicoCamposPublic, { id: u.servicoId, ...campos });
      resultados.push({ ok: true, servicoId: u.servicoId, titulo: servico.titulo, patch });
    }
    return new Response(JSON.stringify({
      ok: true,
      total: migArgs.updates.length,
      sucessos: resultados.filter((r: any) => r.ok).length,
      erros: resultados.filter((r: any) => !r.ok).length,
      detalhes: resultados,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }


    if (name === "inferirDatasDosLogs") {
    // Para servicos concluidos sem dataFimExec OU em_andamento sem dataInicioExec,
    // infere as datas dos serviceLogs (acao=inicio -> dataInicioExec, acao=fim -> dataFimExec)
    const semFim = await ctx.runQuery(api.mutations.listServicosSemDataFimPublic, {});
    const semInicio = await ctx.runQuery(api.mutations.listServicosSemDataInicioPublic, {});
    const alvos = [...semFim, ...semInicio];
    const resultados: any[] = [];
    for (const serv of alvos) {
      const logs = await ctx.runQuery(api.mutations.listServiceLogsByServicoPublic, { servicoId: serv._id });
      const inicioLog = logs.find((l: any) => l.acao === "inicio");
      const fimLog = logs.find((l: any) => l.acao === "fim");
      const patch: any = {};
      if (!serv.dataInicioExec && inicioLog) {
        patch.dataInicioExec = new Date(inicioLog.createdAt).toISOString();
      } else if (!serv.dataInicioExec) {
        // Sem log de inicio: usa dataFimExec ou _creationTime como fallback
        const ref = serv.dataFimExec || serv._creationTime;
        patch.dataInicioExec = new Date(ref).toISOString();
      }
      if (serv.status === "concluido" && !serv.dataFimExec) {
        if (fimLog) {
          patch.dataFimExec = new Date(fimLog.createdAt).toISOString();
        } else if (serv.dataInicioExec) {
          // Fallback: 30min depois do inicio
          patch.dataFimExec = new Date(new Date(serv.dataInicioExec).getTime() + 30 * 60000).toISOString();
        } else if (inicioLog) {
          patch.dataFimExec = new Date(new Date(inicioLog.createdAt).getTime() + 30 * 60000).toISOString();
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.runMutation(api.mutations.patchServicoCamposPublic, { id: serv._id, ...patch });
        resultados.push({ ok: true, servicoId: serv._id, titulo: serv.titulo, patch, usouFallback: !inicioLog && !fimLog });
      } else {
        resultados.push({ ok: false, servicoId: serv._id, titulo: serv.titulo, error: "nada para inferir" });
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      total: alvos.length,
      atualizados: resultados.filter((r: any) => r.ok).length,
      semLogs: resultados.filter((r: any) => r.usouFallback).length,
      detalhes: resultados,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "seedFeriadosNacionais") {
    // Adiciona feriados nacionais BR 2026 + 2027 (idempotente)
    const feriados2026 = [
      { data: "2026-01-01", nome: "Confraternizacao Universal" },
      { data: "2026-04-03", nome: "Paixao de Cristo" },
      { data: "2026-04-21", nome: "Tiradentes" },
      { data: "2026-05-01", nome: "Dia do Trabalho" },
      { data: "2026-09-07", nome: "Independencia" },
      { data: "2026-10-12", nome: "N. Sra. Aparecida" },
      { data: "2026-11-02", nome: "Finados" },
      { data: "2026-11-15", nome: "Proclamacao da Republica" },
      { data: "2026-11-20", nome: "Consciencia Negra" },
      { data: "2026-12-25", nome: "Natal" },
    ];
    const feriados2027 = [
      { data: "2027-01-01", nome: "Confraternizacao Universal" },
      { data: "2027-03-26", nome: "Paixao de Cristo" },
      { data: "2027-04-21", nome: "Tiradentes" },
      { data: "2027-05-01", nome: "Dia do Trabalho" },
      { data: "2027-09-07", nome: "Independencia" },
      { data: "2027-10-12", nome: "N. Sra. Aparecida" },
      { data: "2027-11-02", nome: "Finados" },
      { data: "2027-11-15", nome: "Proclamacao da Republica" },
      { data: "2027-11-20", nome: "Consciencia Negra" },
      { data: "2027-12-25", nome: "Natal" },
    ];
    const todos = [...feriados2026, ...feriados2027];
    const adicionados: any[] = [];
    const jaExistentes: any[] = [];
    for (const f of todos) {
      const r = await ctx.runMutation(api.mutations.addFeriadoPublic, {
        data: f.data, nome: f.nome, tipo: "nacional",
      });
      if (r.ok) adicionados.push(f);
      else jaExistentes.push(f);
    }
    return new Response(JSON.stringify({
      ok: true,
      adicionados: adicionados.length,
      jaExistentes: jaExistentes.length,
      detalhes: { adicionados, jaExistentes },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "addFolgaRetroativa") {
    // Cadastra folga retroativa: { userId, data, motivo, observacao }
    if (!migArgs || !migArgs.userId || !migArgs.data || !migArgs.motivo) {
      return new Response(JSON.stringify({ error: "userId, data e motivo sao obrigatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Verifica se ja existe
    const existing = await ctx.runQuery("servicosPorUserData" as any, { userId: migArgs.userId, data: migArgs.data }).catch(() => null);
    // Usa mutation direta via api
    const r = await ctx.runMutation(api.mutations.addFolgaRetroativa, {
      userId: migArgs.userId,
      data: migArgs.data,
      motivo: migArgs.motivo,
      observacao: migArgs.observacao,
    });
    return new Response(JSON.stringify({ ok: true, result: r }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "criarEquipesMecanica") {
    // Cria 2 equipes de mecanica (se nao existirem): "Equipe A (Mecanica)" e "Equipe B (Mecanica)"
    // Modalidade = "mecanica" (regime 12x36, mesmo do SG)
    const allEquipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    const jaExistem = allEquipes.filter((e: any) => e.modalidade === "mecanica");
    if (jaExistem.length >= 2) {
      return new Response(JSON.stringify({ ok: true, skipped: true, msg: "Ja existem " + jaExistem.length + " equipes de mecanica", equipes: jaExistem }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const criadas: any[] = [];
    for (const nome of ["Equipe A (Mecanica)", "Equipe B (Mecanica)"]) {
      const jaTem = allEquipes.find((e: any) => e.nome === nome);
      if (jaTem) { criadas.push(jaTem); continue; }
      const result = await ctx.runMutation(api.mutations.criarEquipeAdminPublic, { nome, modalidade: "mecanica" });
      criadas.push({ _id: result.equipeId, nome, modalidade: "mecanica" });
    }
    return new Response(JSON.stringify({ ok: true, criadas }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "cadastrarMecanicos") {
    // Migration: cria 2 equipes de mecanica (se nao existem) + cadastra 4 tecnicos placeholder
    // Vincula cada tecnico a equipe de mecanica correspondente com modalidades=["mecanica"]
    // Args opcional { forcar: true } pra recadastrar mesmo se ja existe
    const forcar = !!(migArgs && migArgs.forcar);

    // 1) Criar equipes de mecanica (se nao existem)
    const allEquipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    const nomesEquipesMec = ["Equipe A (Mecanica)", "Equipe B (Mecanica)"];
    const equipesMec: Record<string, any> = {};
    for (const nome of nomesEquipesMec) {
      let eq = allEquipes.find((e: any) => e.nome === nome);
      if (!eq) {
        const r = await ctx.runMutation(api.mutations.criarEquipeAdminPublic, { nome, modalidade: "mecanica" });
        eq = { _id: r.equipeId, nome, modalidade: "mecanica" } as any;
      } else if (eq.modalidade !== "mecanica") {
        // Garante que a modalidade esta correta
        await ctx.runMutation(api.mutations.setEquipeModalidadePublic, { id: eq._id, modalidade: "mecanica" });
        eq.modalidade = "mecanica";
      }
      equipesMec[nome] = eq;
    }

    // 2) Cadastrar os 4 mecanicos
    const mecanicos = [
      { re: "133587-1", graduacao: "Cb", nomeDeGuerra: "Ramos",   secao: "Mecanica", equipe: "Equipe A (Mecanica)" },
      { re: "124472-8", graduacao: "Cb", nomeDeGuerra: "Teles",   secao: "Mecanica", equipe: "Equipe A (Mecanica)" },
      { re: "130602-2", graduacao: "Cb", nomeDeGuerra: "Joelson", secao: "Mecanica", equipe: "Equipe B (Mecanica)" },
      { re: "211466-6", graduacao: "Cb", nomeDeGuerra: "Jesus",   secao: "Mecanica", equipe: "Equipe B (Mecanica)" },
    ];

    const resultados: any[] = [];
    for (const m of mecanicos) {
      // Acha/cria user placeholder
      let user = await ctx.runQuery(api.mutations.findUserByRePublicSafe, { re: m.re });
      let userId: any;
      if (user) {
        userId = user._id;
        // Atualiza dados (caso tenha vindo de cadastro antigo)
        if (user.graduacao !== m.graduacao || user.nomeDeGuerra !== m.nomeDeGuerra) {
          await ctx.runMutation(api.mutations.insertPlaceholderUserPublic, {
            re: m.re, graduacao: m.graduacao, nomeDeGuerra: m.nomeDeGuerra, secao: m.secao,
          });
        }
      } else {
        const r = await ctx.runMutation(api.mutations.insertPlaceholderUserPublic, {
          re: m.re, graduacao: m.graduacao, nomeDeGuerra: m.nomeDeGuerra, secao: m.secao,
        });
        userId = r.userId;
      }

      // Verifica se ja e tecnico (nessa equipe OU em qualquer)
      const tecExistente = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re: m.re });
      if (tecExistente && !forcar) {
        resultados.push({ re: m.re, jaExistia: true, tecnicoId: tecExistente._id, equipe: m.equipe });
        continue;
      }
      if (tecExistente && forcar) {
        // Atualiza equipe + modalidades
        const eq = equipesMec[m.equipe];
        await ctx.runMutation(api.mutations.patchTecnicoEquipePublic, { id: tecExistente._id, equipeId: eq._id });
        resultados.push({ re: m.re, atualizado: true, tecnicoId: tecExistente._id, equipe: m.equipe });
        continue;
      }

      // Cria o tecnico
      const eq = equipesMec[m.equipe];
      const result = await ctx.runMutation(api.mutations.cadastrarTecnicoAdminPublic, {
        userId,
        equipeId: eq._id,
        graduacao: m.graduacao,
        nomeDeGuerra: m.nomeDeGuerra,
        re: m.re,
        modalidades: ["mecanica"],
      });
      resultados.push({ re: m.re, criado: true, tecnicoId: result.tecnicoId, equipe: m.equipe });
    }

    return new Response(JSON.stringify({ ok: true, equipes: equipesMec, mecanicos: resultados }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "debugListarUsers") {
    // Lista todos os users (com clerkId, email, role, re)
    const allUsers = await ctx.runQuery("users" as any, {}).catch(async () => {
      // Tenta via query publica
      return await ctx.runQuery(api.mutations.debugListUsers, {});
    });
    return new Response(JSON.stringify({ total: allUsers.length, users: allUsers }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "deletePlaceholdersByRe") {
    // Migration: deleta todos os placeholders (clerkId="pendente:RE") de um RE especifico
    const { re } = migArgs || {};
    if (!re) {
      return new Response(JSON.stringify({ error: "re obrigatorio" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const r = await ctx.runMutation(api.mutations.deletePlaceholderUsersByRePublic, { re });
    return new Response(JSON.stringify({ ok: true, re, resultado: r }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (name === "setGestorModalidade") {
    // Wrapper pra setGestorModalidadePublic (mutation que NAO pode ser chamada de httpAction direto)
    const { userId, modalidade } = migArgs || {};
    if (!userId || !modalidade) {
      return new Response(JSON.stringify({ error: "userId e modalidade sao obrigatorios" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const r = await ctx.runMutation(api.mutations.setGestorModalidadePublic, { userId, modalidade });
    return new Response(JSON.stringify({ ok: true, r }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (name === "clearGestorModalidade") {
    const { userId } = migArgs || {};
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId obrigatorio" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const r = await ctx.runMutation(api.mutations.clearGestorModalidadePublic, { userId });
    return new Response(JSON.stringify({ ok: true, r }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (name === "resetTecnicoParaPendente") {
    // Deleta o user REAL vinculado ao tecnico e cria um NOVO placeholder pendente:RE
    // Aí o tecnico pode logar de novo no Clerk (com email diferente se quiser) e o upsertUser
    // converte o placeholder pra user real automaticamente
    // Args: { re: string, graduacao?: string, nomeDeGuerra?: string, secao?: string }
    const { re, graduacao = "Cb", nomeDeGuerra, secao = "Mecanica" } = migArgs || {};
    if (!re) {
      return new Response(JSON.stringify({ error: "re obrigatorio" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    // 1) Acha o tecnico
    const tec = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re });
    if (!tec) {
      return new Response(JSON.stringify({ error: "tecnico nao encontrado com RE " + re }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const oldUserId = tec.userId;
    const oldUser = await ctx.runQuery(api.mutations.findUserByIdPublic, { id: oldUserId });
    // 2) Verifica se o user tem servicos vinculados
    const allServicos: any[] = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    const servicosComoSolicitante = allServicos.filter((s: any) => s.solicitanteId === oldUserId);
    const servicosComoTecnico = allServicos.filter((s: any) => s.tecnicoId === oldUserId);
    if (servicosComoSolicitante.length > 0 || servicosComoTecnico.length > 0) {
      return new Response(JSON.stringify({ error: "user tem servicos vinculados. Reatribua antes.", detalhes: { comoSolicitante: servicosComoSolicitante.length, comoTecnico: servicosComoTecnico.length } }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    // 3) NAO pode deletar admin master
    if (oldUser?.isAdminMaster) {
      return new Response(JSON.stringify({ error: "NAO pode resetar admin master" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    // 4) Deleta o user antigo
    if (oldUser) {
      await ctx.runMutation(api.mutations.deleteUserByIdPublic, { id: oldUserId });
    }
    // 5) Cria novo placeholder
    const newPh = await ctx.runMutation(api.mutations.insertPlaceholderUserPublic, {
      re,
      graduacao,
      nomeDeGuerra: nomeDeGuerra || tec.nomeDeGuerra,
      secao,
    });
    // 6) Atualiza o userId do tecnico pro novo placeholder
    await ctx.runMutation(api.mutations.patchTecnicoUserIdPublic, { tecnicoId: tec._id, userId: newPh.userId });
    return new Response(JSON.stringify({
      ok: true,
      re,
      antes: { oldUserId, oldUserName: oldUser?.name, oldUserEmail: oldUser?.email },
      depois: { newUserId: newPh.userId, newClerkId: "pendente:" + re },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (name === "cleanupUserDuplicado") {
    // Deleta um user duplicado (user real) por ID, APENAS se:
    // 1. Tem clerkId que NAO eh "pendente:..." (ou seja, ja logou)
    // 2. Existe OUTRO user com o mesmo RE (pra garantir que eh duplicado mesmo)
    // 3. Nenhum servico onde ele eh o criador (solicitanteId)
    // 4. Nenhum servico onde ele eh o criador por cadastroDireto
    // Args: { userId: string, dryRun?: boolean }
    const { userId, dryRun = false } = migArgs || {};
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId obrigatorio" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const user = await ctx.runQuery(api.mutations.findUserByIdPublic, { id: userId });
    if (!user) {
      return new Response(JSON.stringify({ error: "user nao encontrado" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    if (user.clerkId?.startsWith("pendente:")) {
      return new Response(JSON.stringify({ error: "user eh placeholder, use deletePlaceholderUsersByRePublic" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    let outros: any[] = [];
    if (user.re) {
      const allUsers: any[] = await ctx.runQuery(api.mutations.debugListUsers, {});
      outros = allUsers.filter((u: any) => u.re === user.re && u._id !== user._id);
    }
    if (outros.length === 0) {
      return new Response(JSON.stringify({ error: "user NAO eh duplicado (outros com mesmo RE: 0). Cuidado ao deletar!" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const allServicos: any[] = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    const servicosComoSolicitante = allServicos.filter((s: any) => s.solicitanteId === user._id);
    const servicosComoTecnico = allServicos.filter((s: any) => s.tecnicoId === user._id);
    if (servicosComoSolicitante.length > 0 || servicosComoTecnico.length > 0) {
      return new Response(JSON.stringify({ error: "user tem servicos vinculados. Tem que reatribuir antes.", detalhes: { comoSolicitante: servicosComoSolicitante.length, comoTecnico: servicosComoTecnico.length } }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (user.isAdminMaster) {
      return new Response(JSON.stringify({ error: "NAO pode deletar admin master" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dryRun: true, user: { _id: user._id, name: user.name, email: user.email, re: user.re, role: user.role }, outros }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    await ctx.runMutation(api.mutations.deleteUserByIdPublic, { id: user._id });
    return new Response(JSON.stringify({ ok: true, deletado: { _id: user._id, name: user.name, email: user.email, re: user.re, role: user.role }, outros }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (name === "fixTecnicoUserLinkPublic") {
    // Igual fixTecnicoUserLink (autenticado), mas roda via httpAction (sem precisar de Admin Master logado)
    // Args: { re: string, dryRun?: boolean }
    // 1. Acha o tecnico ativo com esse RE
    // 2. Acha o user real (clerkId="user_...") com esse RE
    // 3. Atualiza o userId do tecnico pro user real
    // 4. Deleta os placeholders orfaos (clerkId="pendente:RE")
    const { re, dryRun = false } = migArgs || {};
    if (!re) {
      return new Response(JSON.stringify({ error: "re obrigatorio" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    // 1) Acha o tecnico
    const tec = await ctx.runQuery(api.mutations.findTecnicoByReAndEquipePublic, { re });
    if (!tec) {
      return new Response(JSON.stringify({ error: "tecnico nao encontrado com RE " + re }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    // 2) Acha o user real
    const realUser = await ctx.runQuery(api.mutations.findRealUserByRePublic, { re });
    if (!realUser) {
      return new Response(JSON.stringify({ error: "user real nao encontrado com RE " + re + " (ninguem logou com esse RE ainda?)" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const antes = { tecnicoUserId: tec.userId, tecnicoId: tec._id, tecnicoNome: tec.graduacao + " " + tec.nomeDeGuerra, realUserId: realUser._id, realUserName: realUser.name, realUserEmail: realUser.email, realUserClerkId: realUser.clerkId };
    if (tec.userId === realUser._id) {
      return new Response(JSON.stringify({ ok: true, msg: "ja esta vinculado", antes }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dryRun: true, antes }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    // 3) Atualiza o userId do tecnico
    await ctx.runMutation(api.mutations.patchTecnicoUserIdPublic, { tecnicoId: tec._id, userId: realUser._id });
    // 4) Deleta placeholders orfaos
    const delResult = await ctx.runMutation(api.mutations.deletePlaceholderUsersByRePublic, { re });
    return new Response(JSON.stringify({ ok: true, antes, depois: { tecnicoUserId: realUser._id, placeholdersDeletados: delResult } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (name === "backfillModalidadeCadastroDireto") {
    // Migration: servicos sem modalidade ganham a modalidade da equipe
    // (apenas servicos com cadastroDireto=true e equipeId apontando pra uma equipe com modalidade)
    const allServicos = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    const allEquipes = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    const equipeModMap: Record<string, string> = {};
    for (const eq of allEquipes) {
      if (eq.modalidade) equipeModMap[eq._id] = eq.modalidade;
    }
    let atualizados = 0;
    const detalhes: any[] = [];
    for (const s of allServicos) {
      if (s.modalidade) continue; // ja tem
      if (!s.equipeId) continue; // sem equipe, nao da pra inferir
      const mod = equipeModMap[s.equipeId];
      if (!mod) continue; // equipe sem modalidade (SG legacy)
      await ctx.runMutation(api.mutations.patchServicoModalidadePublic, { id: s._id, modalidade: mod as any });
      atualizados++;
      detalhes.push({ _id: s._id, titulo: s.titulo, novaModalidade: mod });
    }
    return new Response(JSON.stringify({ ok: true, atualizados, detalhes }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "debugContarPorStatus") {
    const all = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    const counts: Record<string, number> = {};
    for (const s of all) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return new Response(JSON.stringify({ total: all.length, porStatus: counts }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "debugListarServicosRecentes") {
    // Lista os 10 servicos mais recentes com modalidade
    const all = await ctx.runQuery(api.mutations.listAllServicosPublic, {});
    const sorted = [...all].sort((a: any, b: any) => (b._creationTime || 0) - (a._creationTime || 0));
    const top10 = sorted.slice(0, 10).map((s: any) => ({
      _id: s._id,
      titulo: s.titulo,
      local: s.local,
      modalidade: s.modalidade,
      status: s.status,
      equipeId: s.equipeId,
      cadastroDireto: s.cadastroDireto,
      dadosSolicitante: s.dadosSolicitante,
      createdAt: s._creationTime,
    }));
    return new Response(JSON.stringify({ total: all.length, top10 }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "debugListarTecnicos") {
    // Lista TODOS os tecnicos com info do user (clerkId, RE, role, isAdminMaster)
    // Util pra debug
    const allTecs = await ctx.runQuery(api.mutations.listAllTecnicosPublic, {});
    const lista = await Promise.all(allTecs.map(async (t: any) => {
      const u = t.user;
      return {
        tecnicoId: t._id,
        graduacao: t.graduacao,
        nomeDeGuerra: t.nomeDeGuerra,
        re: t.re,
        ativo: t.ativo,
        status: t.status,
        modalidades: t.modalidades,
        equipeId: t.equipeId,
        user: u ? { _id: u._id, name: u.name, role: u.role, isAdminMaster: u.isAdminMaster, re: u.re } : null,
      };
    }));
    return new Response(JSON.stringify({ total: lista.length, tecnicos: lista }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "debugListarServicosPorRe") {
    // DEBUG: dado um RE, simula o filtro que o listServicos aplica para esse tecnico
    // Retorna: user, tecnico, todos os servicos do banco, e os que passariam o filtro
    const { re } = migArgs || {};
    if (!re) {
      return new Response(JSON.stringify({ error: "re is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Tenta achar o user pelo RE. Se nao achar, tenta achar via tecnico (pre-cadastrado)
    let user: any = await ctx.runQuery(api.mutations.findUserByRePublicSafe, { re });
    if (!user) {
      const tec = await ctx.runQuery(api.mutations.findTecnicoByRePublic, { re });
      if (tec) {
        user = await ctx.runQuery(api.mutations.findUserByIdPublic, { id: tec.userId });
      }
    }
    if (!user) {
      return new Response(JSON.stringify({ error: "user nao encontrado com RE " + re + " (e nem via tecnico)" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const tecnico = await ctx.runQuery(api.mutations.findTecnicoByRePublic, { re });
    const allServicos = await ctx.runQuery(api.mutations.listAllServicosPublic, {});

    let filtrados: any[] = [];
    let log: string[] = [];
    if (!tecnico) {
      log.push("Usuario nao tem registro na tabela tecnicos - listServicos retornaria []");
    } else {
      const tecModalidades = (tecnico.modalidades && tecnico.modalidades.length > 0) ? tecnico.modalidades : ["servicos_gerais"];
      log.push("Tecnico: " + tecnico.graduacao + " " + tecnico.nomeDeGuerra + " | equipeId=" + tecnico.equipeId + " | modalidades=" + JSON.stringify(tecModalidades));
      for (const s of allServicos) {
        const sModalidade = s.modalidade ?? "servicos_gerais";
        const passaModalidade = tecModalidades.includes(sModalidade);
        const ehPausado = s.status === "pausado";
        const ehAguardandoOuAndamento = (s.status === "aprovado" || s.status === "em_andamento");
        const mesmaEquipe = s.equipeId === tecnico.equipeId;
        const passa = passaModalidade && (ehPausado || (ehAguardandoOuAndamento && mesmaEquipe));
        if (passa) {
          filtrados.push({ _id: s._id, titulo: s.titulo, status: s.status, modalidade: sModalidade, equipeId: s.equipeId });
        }
      }
      log.push("Total no banco: " + allServicos.length);
      log.push("Total que passaria o filtro: " + filtrados.length);
    }

    return new Response(JSON.stringify({
      user: { name: user.name, role: user.role, isAdminMaster: user.isAdminMaster },
      tecnico: tecnico ? { _id: tecnico._id, graduacao: tecnico.graduacao, nomeDeGuerra: tecnico.nomeDeGuerra, equipeId: tecnico.equipeId, modalidades: tecnico.modalidades, ativo: tecnico.ativo } : null,
      log,
      totalBanco: allServicos.length,
      totalFiltrado: filtrados.length,
      servicosFiltrados: filtrados,
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (name === "listEquipesPorModalidade") {
    // Lista todas as equipes agrupadas por modalidade (util pro debug/UI)
    const all = await ctx.runQuery(api.mutations.listEquipesPublic, {});
    const porMod: Record<string, any[]> = { servicos_gerais: [], informatica: [], mecanica: [] };
    for (const e of all) {
      const m = e.modalidade ?? "servicos_gerais";
      if (!porMod[m]) porMod[m] = [];
      porMod[m].push({ _id: e._id, nome: e.nome, modalidade: e.modalidade ?? "servicos_gerais", ativo: e.ativo });
    }
    return new Response(JSON.stringify(porMod, null, 2), {
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
