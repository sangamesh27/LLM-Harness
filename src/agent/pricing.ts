// Pinned by BUILD.md. Anthropic's published per-token rates for this model.
export const MODEL = "claude-sonnet-4-6";
export const INPUT_COST_PER_MILLION = 3.0;
export const OUTPUT_COST_PER_MILLION = 15.0;
// Cache writes cost ~1.25x base input price; cache reads cost ~0.1x.
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCostUsd(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): number {
  const input = (usage.input_tokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const output = (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
  const cacheWrite =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * INPUT_COST_PER_MILLION * CACHE_WRITE_MULTIPLIER;
  const cacheRead =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * INPUT_COST_PER_MILLION * CACHE_READ_MULTIPLIER;
  return input + output + cacheWrite + cacheRead;
}
