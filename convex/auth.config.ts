export default {
  providers: [
    {
      // Clerk Frontend API URL (issuer) - from env var
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      // Application ID = audience expected in the JWT (matches Clerk JWT template name)
      applicationID: "convex",
    },
  ],
};
