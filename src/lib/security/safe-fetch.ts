import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isPrivateAddress, UrlRejectedError, validateImportUrl } from "./ssrf";

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Content types accepted from the server (matched on the media type only). */
  allowedContentTypes?: readonly string[];
  /** Restrict to specific hosts (used for YouTube). */
  allowedHosts?: readonly string[];
  headers?: Record<string, string>;
  /**
   * Resolves a host name to an address. Defaults to the system resolver. The result is ALWAYS checked
   * against the private-range blocklist, then pinned for the connection (no second lookup, so DNS
   * rebinding between check and connect is not possible). Overridable only for tests.
   */
  resolve?: (host: string) => Promise<string[]>;
  /** Test hook: skip the private-address check. Never exposed through any API route. */
  __unsafeAllowPrivateForTests?: boolean;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  charset: string | null;
  body: Buffer;
}

const DEFAULTS = {
  maxBytes: 2_000_000,
  timeoutMs: 10_000,
  maxRedirects: 5,
  allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
};

async function defaultResolve(host: string): Promise<string[]> {
  const results = await dns.promises.lookup(host, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

function charsetOf(header: string | undefined): string | null {
  const m = /charset="?([\w.:-]+)"?/i.exec(header ?? "");
  return m?.[1]?.toLowerCase() ?? null;
}

function mediaType(header: string | undefined): string {
  return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

async function requestOnce(
  url: URL,
  address: string,
  opts: Required<Pick<SafeFetchOptions, "maxBytes" | "timeoutMs" | "allowedContentTypes">> & {
    headers: Record<string, string>;
  },
  redirectsAllowed: boolean,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const req = lib.request(
      {
        protocol: url.protocol,
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: isIP(url.hostname) ? undefined : url.hostname, // TLS SNI/cert check uses the host name
        headers: {
          "User-Agent": "Ghadi-Importer/0.1 (+local study app)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "identity", // no compression: avoids decompression bombs
          ...opts.headers,
        },
        // Connection is pinned to the already-validated address: the OS resolver is never consulted again.
        lookup: (_host, _options, cb) => {
          const family = isIP(address);
          (cb as (err: Error | null, address: string, family: number) => void)(
            null,
            address,
            family,
          );
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const isRedirect = status >= 300 && status < 400 && res.headers.location;
        if (isRedirect) {
          res.resume();
          return finish(() => resolve({ status, headers: res.headers, body: Buffer.alloc(0) }));
        }
        const ct = mediaType(res.headers["content-type"]);
        if (status >= 200 && status < 300 && !opts.allowedContentTypes.includes(ct)) {
          res.destroy();
          return finish(() =>
            reject(
              new UrlRejectedError(
                `That page is not a supported type (${ct || "unknown"}). Only web pages and plain text can be imported.`,
              ),
            ),
          );
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > opts.maxBytes) {
          res.destroy();
          return finish(() => reject(new UrlRejectedError("That page is too large to import.")));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            res.destroy();
            finish(() => reject(new UrlRejectedError("That page is too large to import.")));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) })),
        );
        res.on("error", (e) => finish(() => reject(e)));
        void redirectsAllowed;
      },
    );
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy();
      finish(() => reject(new UrlRejectedError("The web site took too long to respond.")));
    });
    req.on("error", (e) => finish(() => reject(e)));
    req.end();
  });
}

/**
 * SSRF-hardened GET. Validates scheme/port/host, resolves DNS and rejects private addresses, pins the
 * connection to the validated IP, re-validates every redirect hop, limits time and size, refuses
 * compressed bodies and unsupported content types, and never executes anything it downloads.
 */
export async function safeFetch(
  inputUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const opts = {
    maxBytes: options.maxBytes ?? DEFAULTS.maxBytes,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    allowedContentTypes: options.allowedContentTypes ?? DEFAULTS.allowedContentTypes,
    headers: options.headers ?? {},
  };
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const resolver = options.resolve ?? defaultResolve;
  const deadline = Date.now() + opts.timeoutMs * 2;

  // Only the first hop may be relaxed (tests); every redirect hop is always validated strictly.
  let current = validateImportUrl(inputUrl, {
    allowedHosts: options.allowedHosts,
    unsafeLaxForTests: options.__unsafeAllowPrivateForTests === true,
  });

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (Date.now() > deadline) throw new UrlRejectedError("The web site took too long to respond.");
    const host = current.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    if (isIP(host)) {
      addresses = [host];
    } else {
      try {
        addresses = await resolver(host);
      } catch {
        throw new UrlRejectedError("That web address could not be found.");
      }
    }
    if (addresses.length === 0) throw new UrlRejectedError("That web address could not be found.");
    if (!options.__unsafeAllowPrivateForTests && addresses.some((a) => isPrivateAddress(a))) {
      throw new UrlRejectedError(
        "That address points to a private or local network and cannot be imported.",
      );
    }
    const address = addresses[0] as string;

    const res = await requestOnce(current, address, opts, hop < maxRedirects);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop === maxRedirects)
        throw new UrlRejectedError("The web site redirected too many times.");
      let next: URL;
      try {
        next = new URL(res.headers.location, current);
      } catch {
        throw new UrlRejectedError("The web site sent an invalid redirect.");
      }
      current = validateImportUrl(next.toString(), { allowedHosts: options.allowedHosts });
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new UrlRejectedError(`The web site answered with HTTP ${res.status}.`);
    }
    return {
      finalUrl: current.toString(),
      status: res.status,
      contentType: mediaType(res.headers["content-type"]),
      charset: charsetOf(res.headers["content-type"]),
      body: res.body,
    };
  }
  throw new UrlRejectedError("The web site redirected too many times.");
}
