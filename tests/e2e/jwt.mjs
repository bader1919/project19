import { createHmac } from "node:crypto";

export const JWT_SECRET = "refvault-e2e-secret-at-least-32-characters-long";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

export function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7, ...payload });
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verify(token) {
  const [h, b, s] = String(token).split(".");
  if (!s) return null;
  const expected = createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url");
  if (expected !== s) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString());
  return payload.exp * 1000 > Date.now() ? payload : null;
}

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const USER_EMAIL = "tester@example.com";
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
export const ANON_KEY = sign({ role: "anon" });
export const SERVICE_KEY = sign({ role: "service_role" });
export const userToken = (id = USER_ID, email = USER_EMAIL) => sign({ sub: id, role: "authenticated", aud: "authenticated", email });
