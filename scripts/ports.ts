import fs from 'node:fs';

export interface SystemLabPortConfig {
  host: string;
  devPort: number;
  demoPort: number;
  previewPort: number;
  e2ePort: number;
  reservedExternalPorts: readonly number[];
  appIdentityMarker: string;
}

const rawPorts = fs.readFileSync(new URL('./ports.json', import.meta.url), 'utf8');

export const PORTS: SystemLabPortConfig = JSON.parse(rawPorts) as SystemLabPortConfig;

/**
 * Resolves an explicit SystemLab port override while rejecting invalid port
 * numbers and external reserved ports (e.g., VCraft 5173/8080/3307).
 * Never silently falls back to another port.
 */
export function resolvePort(envVar: string, defaultPort: number): number {
  const raw = process.env[envVar]?.trim();
  if (!raw) {
    return defaultPort;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid port value "${raw}" for ${envVar}: expected an integer 1024..65535.`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`Invalid port ${parsed} for ${envVar}: must be in range 1024..65535.`);
  }
  if (PORTS.reservedExternalPorts.includes(parsed)) {
    throw new Error(
      `Port ${parsed} from ${envVar} is reserved for external services (VCraft / local databases) and cannot be used by SystemLab.`,
    );
  }
  return parsed;
}
