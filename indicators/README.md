# Indicators

Standalone Pine Script indicators for use on TradingView. These are not part of the WRKSight desktop app — they live here for version control only.

## `no_wick_candle_detector.pine`

Detects candles whose top wick or bottom wick is effectively zero (the bar closed at its high or low — Marubozu-style closes).

### Features

- **Top / bottom detection toggles** — turn either side on or off independently.
- **Directional filter** — restrict to bullish-only or bearish-only candles, or accept both.
- **Arrows** — normal-sized triangle arrows printed above/below the qualifying bar.
- **Volume label** — the bar's volume is shown next to the arrow.
- **Support / Resistance** — a horizontal line is drawn at the detection price (high for no-top-wick, low for no-bottom-wick). Length, width, color, and an "extend right" option are configurable. The number of lines kept on chart is capped to keep the chart clean.
- **Alerts** — three alertconditions: top-only, bottom-only, and combined.

### Install

1. Open TradingView → Pine Editor.
2. Paste the contents of `no_wick_candle_detector.pine`.
3. Save → Add to chart.

### Tuning

The detection uses a one-tick tolerance (`syminfo.mintick`) so floating-point comparisons stay robust across instruments. If you want stricter or looser detection, change the `tol` expression in the script.
