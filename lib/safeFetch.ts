import dns from "node:dns/promises";
import net from "node:net";

/**
 * Protection SSRF pour les pages lues à partir d'un lien fourni par l'utilisateur.
 *
 * - Refuse toute adresse privée, locale, de lien local (métadonnées cloud 169.254.x),
 *   CGNAT, multicast… y compris en IPv6 et en IPv4 « mappée » dans de l'IPv6.
 * - Vérifie TOUTES les adresses renvoyées par le DNS, pas seulement la première.
 * - Suit les redirections à la main et revérifie chaque étape : sans ça, un site
 *   public pouvait rediriger notre serveur vers une adresse interne.
 */

export class UnsafeUrlError extends Error {}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return BLOCKED_V4.some(([base, bits]) => {
    const b = ipv4ToInt(base)!;
    const size = 2 ** (32 - bits);
    return n >= b && n < b + size;
  });
}

/** Développe une adresse IPv6 en 8 groupes de 16 bits. */
function expandV6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split("%")[0];
  // Partie IPv4 finale éventuelle (ex. ::ffff:1.2.3.4).
  const v4 = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    if (n === null) return null;
    addr = addr.slice(0, -v4[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail].map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !Number.isFinite(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  if (!net.isIPv6(ip)) return true;
  const g = expandV6(ip);
  if (!g) return true;
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  // :: et ::1
  if (g.slice(0, 7).every((x) => x === 0) && (g[7] === 0 || g[7] === 1)) return true;
  // IPv4 mappée (::ffff:a.b.c.d) ou compatible (::a.b.c.d)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isBlockedV4(embeddedV4());
  // NAT64 (64:ff9b::/96)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isBlockedV4(embeddedV4());
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (adresses uniques locales)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (lien local)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

/** Vérifie qu'une URL est en http(s) et que son hôte ne pointe que vers des adresses publiques. */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Protocole refusé.");
  if (url.username || url.password) throw new UnsafeUrlError("Identifiants dans l'URL refusés.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Hôte refusé.");
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError("Adresse refusée.");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("Impossible de résoudre cette adresse.");
  }
  if (!addresses.length || addresses.some((a) => isBlockedIp(a.address))) throw new UnsafeUrlError("Adresse refusée.");
}

/**
 * fetch() vers une URL publique, en suivant au plus `maxRedirects` redirections,
 * chacune revérifiée. Lève UnsafeUrlError si une étape vise une adresse interne.
 */
export async function safeFetch(
  input: string | URL,
  init: Omit<RequestInit, "redirect"> = {},
  maxRedirects = 5,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = new URL(input.toString());
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const response = await fetch(current, { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      // On libère la connexion avant de suivre la redirection.
      try { await response.body?.cancel(); } catch {}
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new UnsafeUrlError("Trop de redirections.");
}
