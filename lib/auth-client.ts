import { apiKeyClient } from "@better-auth/api-key/client";
import { createAuthClient } from "better-auth/react";

/** Browser-side auth. Same origin as the app, so no baseURL is needed. */
export const authClient = createAuthClient({
  plugins: [apiKeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
