import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
	createThroughputState,
	finishAssistantStream,
	getThroughputText,
	markProviderRequest,
	recordThroughputDelta,
	startAssistantStream,
} from "../throughput.ts";

describe("throughput tracking", () => {
	it("shows waiting, TTFT, and live decode estimate", () => {
		const state = createThroughputState();
		markProviderRequest(state, 1000);
		startAssistantStream(state, 1100);

		assert.equal(getThroughputText(state), "TTFT: waiting · Decode: waiting");
		assert.equal(
			recordThroughputDelta(state, { type: "text_delta", delta: "hello" }, 1300),
			"TTFT: 0.30s · Decode: ~1250.0 tok/s · ~1 tok",
		);
	});

	it("counts thinking and tool-call deltas and throttles display updates", () => {
		const state = createThroughputState();
		startAssistantStream(state, 1000);

		assert.equal(
			recordThroughputDelta(state, { type: "thinking_delta", delta: "abcd" }, 1100),
			"TTFT: 0.10s · Decode: ~1000.0 tok/s · ~1 tok",
		);
		assert.equal(recordThroughputDelta(state, { type: "toolcall_delta", delta: "efgh" }, 1200), undefined);
		assert.equal(state.streamedChars, 8);
		assert.equal(
			recordThroughputDelta(state, { type: "text_delta", delta: "ij" }, 1301),
			"TTFT: 0.10s · Decode: ~12.4 tok/s · ~3 tok",
		);
		assert.equal(recordThroughputDelta(state, { type: "text_start" }, 1500), undefined);
	});

	it("uses final provider usage for exact output count and client-timed rate", () => {
		const state = createThroughputState();
		markProviderRequest(state, 1000);
		startAssistantStream(state, 1000);
		recordThroughputDelta(state, { type: "text_delta", delta: "abcd" }, 2000);
		recordThroughputDelta(state, { type: "text_delta", delta: "efgh" }, 4000);

		assert.equal(
			finishAssistantStream(state, { input: 1000, cacheWrite: 50, output: 80 }),
			"TTFT: 1.00s · Input/TTFT: ~1050.0 tok/s · Decode: 39.5 tok/s · 80 tok",
		);
		assert.equal(getThroughputText(state), "TTFT: 1.00s · Input/TTFT: ~1050.0 tok/s · Decode: 39.5 tok/s · 80 tok");
	});

	it("keeps an approximate final rate when provider output usage is absent", () => {
		const state = createThroughputState();
		startAssistantStream(state, 1000);
		recordThroughputDelta(state, { type: "text_delta", delta: "abcdefgh" }, 2000);
		recordThroughputDelta(state, { type: "text_delta", delta: "ijklmnop" }, 3000);

		assert.equal(finishAssistantStream(state, { input: 0, output: 0, cacheWrite: 0 }), "TTFT: 1.00s · Decode: ~4.0 tok/s · ~4 tok");
	});

	it("reports unavailable rate for an empty response", () => {
		const state = createThroughputState();
		startAssistantStream(state, 1000);

		assert.equal(finishAssistantStream(state, { input: 0, output: 0, cacheWrite: 0 }), "Decode: no output tokens");
	});
});
