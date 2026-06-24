import mongoose, { Schema } from 'mongoose';

/**
 * Every decision the bot makes — including holds and rejected webhooks — is
 * stored here with the full Claude reasoning and a market snapshot. "A trade
 * with no logged reasoning is a bug."
 */
const DecisionLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    source: String, // tradingview | morning_research | intraday_review | sentinel
    symbol: { type: String, index: true },
    side: String, // buy | sell
    action: String, // buy | sell | hold
    conviction: Number,
    threshold: Number,
    reasoning: String,
    risks: String,
    // What actually happened after the decision.
    outcome: String, // routed | held | rejected_risk | rejected_preview | rejected_paused | error
    riskReasons: [String],
    // Market snapshot at decision time.
    snapshot: Schema.Types.Mixed,
    candidate: Schema.Types.Mixed,
    order: Schema.Types.Mixed,
    adapter: String,
  },
  { versionKey: false },
);

const OrderLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    orderId: String,
    symbol: { type: String, index: true },
    side: String,
    quantity: Number,
    price: Number,
    status: String,
    adapter: String,
    decisionId: { type: Schema.Types.ObjectId, ref: 'DecisionLog' },
  },
  { versionKey: false },
);

export const DecisionLog = mongoose.model('DecisionLog', DecisionLogSchema);
export const OrderLog = mongoose.model('OrderLog', OrderLogSchema);
