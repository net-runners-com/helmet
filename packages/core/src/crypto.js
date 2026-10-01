// Isomorphic crypto helpers (WebCrypto `crypto.subtle`, available in Cloudflare
// Workers and browsers). Used by @helmet/worker (server side) and @helmet/runtime
// (client side) so the two agree on the session handshake and asset masking.

export function b64e(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export const b64u = (buf) => b64e(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
}

const EC = { name: "ECDH", namedCurve: "P-256" };

// Server side: given the client's raw P-256 public key, derive an AES-GCM key and
// return it with our raw public key for the client to derive the same secret.
export async function serverHandshake(clientPubRaw) {
  const clientPub = await crypto.subtle.importKey("raw", clientPubRaw, EC, false, []);
  const pair = await crypto.subtle.generateKey(EC, true, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: clientPub }, pair.privateKey, 256);
  const aes = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt"]);
  const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { aes, serverPubRaw: new Uint8Array(pub) };
}

// Client side: generate our key pair, return raw public key and a finisher that
// takes the server's raw public key and yields the shared AES-GCM key.
export async function clientHandshake() {
  const pair = await crypto.subtle.generateKey(EC, false, ["deriveBits"]);
  const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const finish = async (serverPubRaw) => {
    const serverPub = await crypto.subtle.importKey("raw", serverPubRaw, EC, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: serverPub }, pair.privateKey, 256);
    return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  };
  return { pubRaw: new Uint8Array(pub), finish };
}

export async function encryptJSON(aes, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv, ct: new Uint8Array(ct) };
}
export async function decryptJSON(aes, iv, ct) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aes, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

// XOR mask/unmask (symmetric): makes a saved protected-asset response an unusable
// blob without the per-session key. Not confidentiality — a speed bump against
// "save the file" and casual inspection.
export function xorMask(data, key) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}

export const randomU32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
