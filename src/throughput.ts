export interface ThroughputState {
	requestStartedAt?: number;
	firstOutputAt?: number;
	lastOutputAt?: number;
	ttftSeconds?: number;
	streamedChars: number;
	lastDisplayAt: number;
	displayText?: string;
}

export interface ThroughputUsage {
	input?: number;
	output?: number;
	cacheWrite?: number;
}

const CHARS_PER_TOKEN = 4;
const UPDATE_INTERVAL_MS = 200;

export function createThroughputState(): ThroughputState {
	return { streamedChars: 0, lastDisplayAt: 0 };
}

export function markProviderRequest(state: ThroughputState, now: number): void {
	state.requestStartedAt = now;
}

export function startAssistantStream(state: ThroughputState, now: number): void {
	state.firstOutputAt = undefined;
	state.lastOutputAt = undefined;
	state.ttftSeconds = undefined;
	state.streamedChars = 0;
	state.lastDisplayAt = 0;
	state.requestStartedAt ??= now;
	state.displayText = "TTFT: waiting · Decode: waiting";
}

function positiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function deltaChars(event: unknown): number {
	if (!event || typeof event !== "object") return 0;
	const streamEvent = event as { type?: string; delta?: unknown };
	if (
		streamEvent.type !== "text_delta" &&
		streamEvent.type !== "thinking_delta" &&
		streamEvent.type !== "toolcall_delta"
	) {
		return 0;
	}
	return typeof streamEvent.delta === "string" ? streamEvent.delta.length : 0;
}

function seconds(milliseconds: number): number {
	return Math.max(0, milliseconds) / 1000;
}

function rate(value: number, durationSeconds: number): string {
	return (value / Math.max(0.001, durationSeconds)).toFixed(1);
}

export function recordThroughputDelta(state: ThroughputState, event: unknown, now: number): string | undefined {
	const chars = deltaChars(event);
	if (chars <= 0) return undefined;

	if (state.firstOutputAt === undefined) {
		state.firstOutputAt = now;
		state.ttftSeconds = seconds(now - (state.requestStartedAt ?? now));
	}
	state.lastOutputAt = now;
	state.streamedChars += chars;

	if (now - state.lastDisplayAt < UPDATE_INTERVAL_MS) return undefined;
	state.lastDisplayAt = now;

	const decodeSeconds = seconds(now - state.firstOutputAt);
	const estimatedTokens = state.streamedChars / CHARS_PER_TOKEN;
	const text = `TTFT: ${state.ttftSeconds!.toFixed(2)}s · Decode: ~${rate(estimatedTokens, decodeSeconds)} tok/s · ~${Math.round(estimatedTokens)} tok`;
	state.displayText = text;
	return text;
}

export function finishAssistantStream(state: ThroughputState, usage?: ThroughputUsage): string {
	const outputTokens = positiveNumber(usage?.output);
	const uncachedInputTokens = positiveNumber(usage?.input);
	const cacheWriteTokens = positiveNumber(usage?.cacheWrite) ?? 0;
	const decodeSeconds =
		state.firstOutputAt !== undefined && state.lastOutputAt !== undefined
			? seconds(state.lastOutputAt - state.firstOutputAt)
			: undefined;

	const parts: string[] = [];
	if (state.ttftSeconds !== undefined) {
		parts.push(`TTFT: ${state.ttftSeconds.toFixed(2)}s`);
	}

	const processedInputTokens = (uncachedInputTokens ?? 0) + cacheWriteTokens;
	if (processedInputTokens > 0 && state.ttftSeconds !== undefined && state.ttftSeconds > 0) {
		parts.push(`Input/TTFT: ~${rate(processedInputTokens, state.ttftSeconds)} tok/s`);
	}

	if (outputTokens !== undefined && outputTokens > 1 && decodeSeconds !== undefined && decodeSeconds > 0) {
		parts.push(`Decode: ${rate(outputTokens - 1, decodeSeconds)} tok/s · ${outputTokens} tok`);
	} else if (outputTokens !== undefined) {
		parts.push(`Decode: ${outputTokens} tok · rate unavailable`);
	} else if (state.streamedChars > 0 && decodeSeconds !== undefined && decodeSeconds > 0) {
		const estimatedTokens = state.streamedChars / CHARS_PER_TOKEN;
		parts.push(`Decode: ~${rate(estimatedTokens, decodeSeconds)} tok/s · ~${Math.round(estimatedTokens)} tok`);
	} else {
		parts.push("Decode: no output tokens");
	}

	state.displayText = parts.join(" · ");
	state.requestStartedAt = undefined;
	return state.displayText;
}

export function getThroughputText(state: ThroughputState): string | undefined {
	return state.displayText;
}
