import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { Candidate, Decision, Quote, Position } from '../types.js';

const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

/** JSON schema the model must conform to (structured outputs). */
const decisionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['buy', 'sell', 'hold'] },
    conviction: { type: 'number' },
    reasoning: { type: 'string' },
    risks: { type: 'string' },
  },
  required: ['action', 'conviction', 'reasoning', 'risks'],
} as const;

const SYSTEM = `You are the decision engine for an automated equities trading bot.
You receive a single trade CANDIDATE plus a market snapshot, and you return a
conviction-scored recommendation.

Rules:
- conviction is a probability in [0,1] that acting on this candidate now is +EV.
- Be skeptical. A raw alert is not a reason to trade. Weigh the thesis, current
  exposure, the position you already hold, and obvious risks.
- If the case is weak, ambiguous, or you'd need information you don't have,
  return action "hold" with low conviction.
- Only recommend the candidate's own side (buy candidates -> buy or hold; sell
  candidates -> sell or hold). Never invert the side.
- Always fill "risks" with the main thing that could go wrong.
Keep reasoning concise and concrete.`;

export interface SnapshotContext {
  quote: Quote;
  position?: Position;
  account: { cash: number; equity: number };
}

/**
 * Score a candidate. Uses the Claude API when a key is configured; otherwise a
 * deterministic heuristic so the whole pipeline still runs offline.
 */
export async function decide(candidate: Candidate, ctx: SnapshotContext): Promise<Decision> {
  if (!client) return heuristicDecision(candidate, ctx);

  const userContent = JSON.stringify(
    {
      candidate: {
        symbol: candidate.symbol,
        side: candidate.side,
        source: candidate.source,
        condition: candidate.condition,
      },
      market: {
        price: ctx.quote.price,
        existingPosition: ctx.position
          ? { quantity: ctx.position.quantity, avgPrice: ctx.position.avgPrice, unrealizedPnl: ctx.position.unrealizedPnl }
          : null,
        account: ctx.account,
      },
    },
    null,
    2,
  );

  // `thinking: adaptive` and `output_config.format` are valid on the current
  // API but newer than this SDK's static types, so we build the body untyped
  // and cast — the fields pass through to the wire at runtime.
  const params = {
    model: config.claudeModel,
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: decisionSchema } },
    messages: [{ role: 'user', content: `Evaluate this candidate:\n${userContent}` }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const res = await client.messages.create(params);

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    const parsed = JSON.parse(text) as Decision;
    return {
      action: parsed.action,
      conviction: clamp01(parsed.conviction),
      reasoning: parsed.reasoning ?? '',
      risks: parsed.risks ?? '',
    };
  } catch {
    return {
      action: 'hold',
      conviction: 0,
      reasoning: `Could not parse model output; defaulting to hold. Raw: ${text.slice(0, 400)}`,
      risks: 'Decision engine returned malformed output.',
    };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Offline fallback: simple, transparent, and conservative. */
function heuristicDecision(candidate: Candidate, ctx: SnapshotContext): Decision {
  let conviction = 0.5;
  const reasons: string[] = [];

  if (candidate.condition && /rsi|oversold|breakout|momentum|golden cross/i.test(candidate.condition)) {
    conviction += 0.12;
    reasons.push('Recognized a known technical condition in the alert.');
  }
  if (candidate.source === 'morning_research') {
    conviction += 0.05;
    reasons.push('From scheduled deep research rather than a raw alert.');
  }
  if (candidate.side === 'sell' && ctx.position && ctx.position.unrealizedPnl < 0) {
    conviction += 0.1;
    reasons.push('Sell candidate on a losing position (risk management).');
  }
  if (candidate.side === 'buy' && ctx.position) {
    conviction -= 0.08;
    reasons.push('Already hold this name; adding increases concentration.');
  }

  conviction = clamp01(conviction);
  // Return the directional lean + conviction; the pipeline's (runtime) conviction
  // gate decides whether this actually routes. Don't gate here on static config.
  return {
    action: candidate.side,
    conviction,
    reasoning: `[Offline heuristic — no ANTHROPIC_API_KEY set] ${reasons.join(' ') || 'No strong signal.'}`,
    risks: 'Heuristic scoring only; not a substitute for the Claude decision engine.',
  };
}
