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
// Os logs aparecem no Convex Dashboard > Logs (filtrar por FCM-DEBUG)
const fcmDebugLog = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: any = {};
  try {
    body = await request.json();
  } catch {}
  const { step, info, hasToken, hasClerkUser, clerkId, error } = body || {};
  const msg = `[FCM-DEBUG] step=${step} hasToken=${!!hasToken} hasClerkUser=${!!hasClerkUser} clerkId=${clerkId || "?"} info=${info || ""} error=${error || ""}`;
  console.log(msg);
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

export default http;
