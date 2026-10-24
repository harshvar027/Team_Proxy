import { checkAuth, syncAccount } from "./auth.js";

async function boot() {
  const { user } = await checkAuth();
  syncAccount(user);
}

boot();
