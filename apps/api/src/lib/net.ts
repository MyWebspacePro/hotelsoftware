import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF-Schutz: erlaubt nur http(s)-Ziele, deren aufgelöste Adressen öffentlich
 * sind (kein Loopback, keine privaten/Link-local/Metadata-Bereiche).
 */
const blocked = new net.BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // Link-local / Cloud-Metadata
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("::1", 128, "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.google.internal."]);

function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address) === 4 ? "ipv4" : "ipv6";
  return blocked.check(address, family);
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Ungültige Import-URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http/https erlaubt");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) throw new Error("Ziel nicht erlaubt");

  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("Ziel nicht erlaubt");
    return url;
  }

  const records = await lookup(host, { all: true });
  if (!records.length || records.every((r) => isBlockedAddress(r.address))) {
    throw new Error("Ziel nicht erlaubt");
  }
  return url;
}