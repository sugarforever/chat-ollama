import type { CompactionPolicy } from "@earendil-works/pi-durable";
import type { ModelLimits } from "../../contracts";
import { ApiError } from "../errors";

// Deliberately conservative and tokenizer-independent. Non-ASCII may consume
// several tokens per character; never apply the English chars/4 shortcut to it.
export function estimateFixedTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const character of text) {
    if (character.codePointAt(0)! < 128) ascii++;
    else other += Buffer.byteLength(character, "utf8");
  }
  return Math.ceil(ascii / 3) + other;
}

export function automaticCompactionPolicy(
  { contextWindow, maxTokens }: ModelLimits,
  fixedTokens: number,
): CompactionPolicy {
  if (![contextWindow, maxTokens, fixedTokens].every(Number.isSafeInteger) ||
      contextWindow <= 0 || maxTokens <= 0 || fixedTokens < 0 || maxTokens >= contextWindow)
    throw new ApiError(400, "CONTEXT_BUDGET", "Invalid model context limits or prompt overhead");
  const available = contextWindow - 2 * maxTokens - fixedTokens;
  // Reserve a full summary as well as output: native summaries can use up to
  // maxTokens. Message framing and estimation uncertainty need headroom
  // even when the selected model has a very small output allowance.
  const headroom = Math.max(256, Math.ceil(available * 0.15));
  const usable = available - headroom;
  if (usable < 512)
    throw new ApiError(400, "CONTEXT_BUDGET", "Model context cannot fit fixed prompt overhead and output limits");
  return {
    enabled: true,
    reserveTokens: 2 * maxTokens + fixedTokens + headroom,
    keepRecentTokens: Math.max(1, Math.floor(usable * 0.25)),
    backgroundTokens: Math.max(1, Math.floor(usable * 0.2)),
  };
}
