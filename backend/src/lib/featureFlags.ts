import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

// Feature flags are stored in a small JSON file checked into the repo so a
// flag flip is a code change with normal review. We load it once at startup
// — flags don't change at runtime.
const FLAGS_PATH = path.resolve(__dirname, '../../feature-flags.json');

export type FeatureFlags = {
  enableAgentWorkload: boolean;
  enableDiagnosticsRoute: boolean;
  enableCacheWarmer: boolean;
  maxListLimit: number;
};

function load(): FeatureFlags {
  try {
    const raw = fs.readFileSync(FLAGS_PATH, 'utf8');
    return JSON.parse(raw) as FeatureFlags;
  } catch (err) {
    logger.warn({ err }, 'feature flags file missing, using defaults');
    return {
      enableAgentWorkload: true,
      enableDiagnosticsRoute: true,
      enableCacheWarmer: true,
      maxListLimit: 200,
    };
  }
}

export const featureFlags: FeatureFlags = load();
