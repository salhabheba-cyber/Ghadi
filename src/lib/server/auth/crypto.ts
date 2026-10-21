import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: object,
) => Promise<Buffer>;

/** No 0/O/1/I/L/U: avoids look-alikes when a child copies the ID from paper. 31 symbols. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Ghadi Student ID: 12 random symbols (about 59 bits), shown as GH-XXXX-XXXX-XXXX. Never derived from personal data. */
export function generateStudentId(): string {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `GH-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Accepts what a child might type: any case, missing dashes/prefix, stray spaces. Returns null if not a valid ID. */
export function normalizeStudentId(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^GH/, "");
  if (s.length !== 12) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return `GH-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** IDs and session tokens are high-entropy random values, so a plain SHA-256 is the right storage form. */
export function hashStudentId(id: string): string {
  return sha256(`ghadi-student-id:${id}`);
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return sha256(`ghadi-token:${token}`);
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Slow, salted hash for low-entropy secrets (PINs, staff passwords). Format: scrypt$salt$hash (base64url). */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(secret.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(
    secret.normalize("NFKC"),
    Buffer.from(saltB64, "base64url"),
    expected.length,
    SCRYPT,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
/** School join code, e.g. SCH-7KQ4-M9XD (about 40 bits); can be rotated by the school. */
export function generateJoinCode(): string {
  let raw = "";
  for (let i = 0; i < 8; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function normalizeJoinCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 8) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
