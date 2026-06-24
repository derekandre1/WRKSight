import { config } from '../config.js';
import { state } from '../state.js';
import type { AdapterKind } from '../types.js';
import type { BrokerAdapter } from './types.js';
import { SimulationAdapter } from './simulation.js';
import { AlpacaPaperAdapter } from './alpacaPaper.js';
import { RobinhoodMcpAdapter } from './robinhoodMcp.js';

// Adapters are cached per kind so simulation/account state persists across calls.
const cache = new Map<AdapterKind, BrokerAdapter>();

function build(kind: AdapterKind): BrokerAdapter {
  switch (kind) {
    case 'SIM':
      return new SimulationAdapter(config.simStartingCash);
    case 'PAPER':
      return new AlpacaPaperAdapter(config.alpacaKeyId, config.alpacaSecretKey, config.alpacaBaseUrl);
    case 'LIVE':
      return new RobinhoodMcpAdapter(config.robinhoodMcpUrl);
    default:
      throw new Error(`Unknown broker adapter: ${kind}`);
  }
}

/** The adapter selected by current runtime state. */
export function activeAdapter(): BrokerAdapter {
  const kind = state.adapter;
  let adapter = cache.get(kind);
  if (!adapter) {
    adapter = build(kind);
    cache.set(kind, adapter);
  }
  return adapter;
}

export type { BrokerAdapter };
