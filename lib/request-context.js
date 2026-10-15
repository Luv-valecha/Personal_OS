import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Lets a route handler run existing server code "as" a user it has ALREADY authenticated by another means (a verified
// Android pairing token). Only set by app/api/mobile/* after verifying the token; the value is never read from the request.
const als = new AsyncLocalStorage();
export const actingUserId = () => als.getStore() || null;
export const runAsUser = (uid, fn) => als.run(uid, fn);
