import { isIP } from "node:net";

/**
 * SSRF guard helpers for server-side fetching. Pure functions (easy to unit test); the DNS and
 * connection pinning lives in safe-fetch.ts.
 */

export class UrlRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlRejectedError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".lan",
  ".home",
  ".corp",
  ".intranet",
];
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

export function isPrivateIPv4(ip: string): boolean {
  const p = parseIPv4(ip);
  if (!p) return true; // unparseable: treat as unsafe
  const [a, b, c] = p as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, includes cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);

  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1)
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const [a, b, c, d] = v4 as [number, number, number, number];
    addr = `${addr.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] !== undefined && halves[1] !== "" ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups =
    halves.length === 1 ? head : [...head, ...Array<string>(missing).fill("0"), ...rest];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const allZeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (allZeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the embedded IPv4
  if (allZeroPrefix && (g5 === 0xffff || g5 === 0)) {
    return isPrivateIPv4(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
  }
  if (g0 === 0x64 && g1 === 0xff9b) return true; // NAT64 64:ff9b::/96
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // deprecated site-local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2002) return true; // 6to4 can embed private v4
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true;
}

/** Normalises numeric-looking hosts such as 2130706433 or 0x7f.0.0.1 which URL may leave untouched. */
function looksLikeObfuscatedIp(host: string): boolean {
  return /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){0,3}$/i.test(host) && isIP(host) === 0;
}

/**
 * Validates a user-supplied URL before any network request. Throws UrlRejectedError with a
 * message that is safe to show to the user.
 */
export function validateImportUrl(
  input: string,
  opts: {
    allowedHosts?: readonly string[];
    /** Tests only: skip port/host/private checks. Never set from request data. */ unsafeLaxForTests?: boolean;
  } = {},
): URL {
  if (typeof input !== "string" || input.length === 0 || input.length > 2000) {
    throw new UrlRejectedError("Enter a web address (URL) of at most 2000 characters.");
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UrlRejectedError("That does not look like a valid web address.");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UrlRejectedError("Only http:// and https:// addresses can be imported.");
  }
  if (url.username || url.password) {
    throw new UrlRejectedError("Addresses containing a username or password are not allowed.");
  }
  if (opts.unsafeLaxForTests) return url;
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UrlRejectedError("Only the default web ports (80 and 443) are allowed.");
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host) throw new UrlRejectedError("That address has no host name.");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UrlRejectedError("Local and internal network addresses cannot be imported.");
  }
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host))
      throw new UrlRejectedError("Private and local network addresses cannot be imported.");
  } else if (looksLikeObfuscatedIp(host)) {
    throw new UrlRejectedError("Numeric host names are not allowed.");
  } else if (!host.includes(".")) {
    throw new UrlRejectedError("Single-label host names (internal names) are not allowed.");
  }
  if (opts.allowedHosts && !opts.allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new UrlRejectedError("That web site is not supported for this kind of import.");
  }
  return url;
}
