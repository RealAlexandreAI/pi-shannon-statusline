export interface ThroughputState {
	requestStartedAt?: number;
	firstOutputAt?: number;
	lastOutputAt?: number;
	ttftSeconds?: number;
	streamedChars: number;
	lastDisplayAt: number;
	displayText?: string;
	displayParts?: ThroughputPart[];
}

export interface ThroughputPart {
	key: string;
	value: string;
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
	state.displayParts = [
		{ key: "TTFT", value: "waiting" },
		{ key: "Decode", value: "waiting" },
	];
	state.displayText = partsToText(state.displayParts);
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

function partsToText(parts: ThroughputPart[]): string {
	return parts.map((part) => `${part.key}: ${part.value}`).join(" · ");
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
	state.displayParts = [
		{ key: "TTFT", value: `${state.ttftSeconds!.toFixed(2)}s` },
		{ key: "Decode", value: `~${rate(estimatedTokens, decodeSeconds)} tok/s · ~${Math.round(estimatedTokens)} tok` },
	];
	state.displayText = partsToText(state.displayParts);
	return state.displayText;
}

export function finishAssistantStream(state: ThroughputState, usage?: ThroughputUsage): string {
	const outputTokens = positiveNumber(usage?.output);
	const uncachedInputTokens = positiveNumber(usage?.input);
	const cacheWriteTokens = positiveNumber(usage?.cacheWrite) ?? 0;
	const decodeSeconds =
		state.firstOutputAt !== undefined && state.lastOutputAt !== undefined
			? seconds(state.lastOutputAt - state.firstOutputAt)
			: undefined;

	const parts: ThroughputPart[] = [];
	if (state.ttftSeconds !== undefined) {
		parts.push({ key: "TTFT", value: `${state.ttftSeconds.toFixed(2)}s` });
	}

	const processedInputTokens = (uncachedInputTokens ?? 0) + cacheWriteTokens;
	if (processedInputTokens > 0 && state.ttftSeconds !== undefined && state.ttftSeconds > 0) {
		parts.push({ key: "Input/TTFT", value: `~${rate(processedInputTokens, state.ttftSeconds)} tok/s` });
	}

	if (outputTokens !== undefined && outputTokens > 1 && decodeSeconds !== undefined && decodeSeconds > 0) {
		parts.push({ key: "Decode", value: `${rate(outputTokens - 1, decodeSeconds)} tok/s · ${outputTokens} tok` });
	} else if (outputTokens !== undefined) {
		parts.push({ key: "Decode", value: `${outputTokens} tok · rate unavailable` });
	} else if (state.streamedChars > 0 && decodeSeconds !== undefined && decodeSeconds > 0) {
		const estimatedTokens = state.streamedChars / CHARS_PER_TOKEN;
		parts.push({ key: "Decode", value: `~${rate(estimatedTokens, decodeSeconds)} tok/s · ~${Math.round(estimatedTokens)} tok` });
	} else {
		parts.push({ key: "Decode", value: "no output tokens" });
	}

	state.displayParts = parts;
	state.displayText = partsToText(parts);
	state.requestStartedAt = undefined;
	return state.displayText;
}

export function getThroughputText(state: ThroughputState): string | undefined {
	return state.displayText;
}

export function getThroughputParts(state: ThroughputState): ThroughputPart[] | undefined {
	return state.displayParts;
}
