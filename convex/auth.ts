// Auth via Clerk — o frontend envia o token no header Authorization
// O middleware Clerk do Next.js valida o token antes de chegar ao frontend
// Aqui no Convex, extraímos o userId do token JWT
export async function getCurrentUserId(ctx: { auth: any }): Promise<string | null> {
  try {
    // Convex passa o token do Authorization header automaticamente
    // Clerk valida o JWT e expõe o subject como identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // identity.subject é o clerkId (same as user.id do Clerk)
    return identity.subject;
  } catch {
    return null;
  }
}
