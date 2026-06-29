/**
 * Tests for pi-shannon-statusline HUD renderer.
 * Run: node --test src/__tests__/hud.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// ═══════════════════════════════════════════════════════════════
// Copy of production render logic (pure, no fs/child_process deps)
// ═══════════════════════════════════════════════════════════════

const R = "\x1b[0m";
const D = "\x1b[2m";
const COMMENT = "\x1b[38;5;243m";
const GREEN = "\x1b[38;5;154m";
const CYAN = "\x1b[38;5;123m";
const PURPLE = "\x1b[38;5;141m";
const YELLOW = "\x1b[38;5;221m";
const I_RUN = "↻";

function c(text: string, color: string) { return `${color}${text}${R}`; }

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

interface ToolRecord {
  name: string; status: "running" | "completed" | "error";
  startTime: number; endTime?: number;
}

interface AgentRecord {
  status: "running" | "completed";
  startTime: number; endTime?: number;
}

// ═══════════════════════════════════════════════════════════════
// Tool count rendering (extracted from buildHud)
// ═══════════════════════════════════════════════════════════════

// Tool whitelist (mirrors src/index.ts)
const TOOL_WHITELIST = new Set([
  "read", "write", "edit", "bash",
  "grep", "ls", "find",
]);

function renderToolCounts(tools: ToolRecord[]): string[] {
  const sep = `${COMMENT}│${R}`;
  const completed = tools.filter(t => t.status === "completed" && TOOL_WHITELIST.has(t.name));
  const toolCounts = new Map<string, number>();
  for (const t of completed) toolCounts.set(t.name, (toolCounts.get(t.name) ?? 0) + 1);

  const order = ["read", "edit", "write", "bash", "grep", "ls", "find"];
  const parts: string[] = [];
  for (const name of order) {
    const count = toolCounts.get(name) ?? 0;
    if (count > 0) parts.push(`${GREEN} ${c(name, R.replace("\x1b[0m", ""))}${count > 1 ? ` ${c(`×${count}`, COMMENT)}` : ""}`);
  }

  if (parts.length === 0) return [];

  // stand-in for FG color
  const FG = "\x1b[38;5;252m";
  // rebuild with proper color
  const rebuilt: string[] = [];
  for (const name of order) {
    const count = toolCounts.get(name) ?? 0;
    if (count > 0) rebuilt.push(`${GREEN} ${c(name, FG)}${count > 1 ? ` ${c(`×${count}`, COMMENT)}` : ""}`);
  }

  return [`${COMMENT}${"─".repeat(67)}${R}`, rebuilt.join(` ${sep} `)];
}

function renderAgentActivity(agents: AgentRecord[]): string[] {
  const sep = `${COMMENT}│${R}`;
  const agentRunning = agents.filter(a => a.status === "running");
  const agentCompleted = agents.filter(a => a.status === "completed");

  if (agentRunning.length === 0 && agentCompleted.length === 0) return [];

  const lines: string[] = [];
  lines.push(`${COMMENT}${"─".repeat(67)}${R}`);

  const parts: string[] = [];
  for (const a of agentRunning) {
    parts.push(`${c(I_RUN, YELLOW)} ${c("agent", PURPLE)} ${c(`(${fmtDuration(Date.now() - a.startTime)})`, COMMENT)}`);
  }
  if (agentCompleted.length > 0) {
    parts.push(`${c("agent", PURPLE)} ${GREEN} ${c(`×${agentCompleted.length}`, COMMENT)}`);
  }
  lines.push(parts.join(` ${sep} `));
  return lines;
}

// Strip ANSI for assertion readability
function stripANSI(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("fmtTokens", () => {
  it("formats < 1000 as plain number", () => { assert.equal(fmtTokens(0), "0"); assert.equal(fmtTokens(999), "999"); });
  it("formats k", () => { assert.equal(fmtTokens(1500), "1.5k"); assert.equal(fmtTokens(9999), "10.0k"); });
  it("formats M", () => { assert.equal(fmtTokens(1_500_000), "1.5M"); });
});

describe("fmtDuration", () => {
  it("formats ms", () => { assert.equal(fmtDuration(500), "500ms"); });
  it("formats seconds", () => { assert.equal(fmtDuration(3500), "4s"); });
  it("formats minutes", () => { assert.equal(fmtDuration(125000), "2m 5s"); });
});

describe("renderToolCounts", () => {
  it("returns empty for no completed tools", () => {
    assert.deepStrictEqual(renderToolCounts([]), []);
  });

  it("shows single tool without ×1", () => {
    const lines = renderToolCounts([
      { name: "read", status: "completed", startTime: 0 },
    ], "cyberpunk");
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("read"), `should include read: ${text}`);
    assert.ok(!text.includes("×1"), `should not include ×1: ${text}`);
  });

  it("shows ×N for multiple uses", () => {
    const lines = renderToolCounts([
      { name: "read", status: "completed", startTime: 0 },
      { name: "read", status: "completed", startTime: 1 },
      { name: "bash", status: "completed", startTime: 2 },
      { name: "bash", status: "completed", startTime: 3 },
      { name: "bash", status: "completed", startTime: 4 },
    ], "cyberpunk");
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("×2"), `should have ×2: ${text}`);
    assert.ok(text.includes("×3"), `should have ×3: ${text}`);
  });

  it("shows only completed, not running/error", () => {
    const lines = renderToolCounts([
      { name: "read", status: "completed", startTime: 0 },
      { name: "bash", status: "running", startTime: 1 },
      { name: "grep", status: "error", startTime: 2 },
    ]);
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("read"), `should include completed read: ${text}`);
    assert.ok(!text.includes("bash"), `should not include running bash: ${text}`);
    assert.ok(!text.includes("grep"), `should not include error grep: ${text}`);
  });

  it("shows all tracked tool names in order", () => {
    const lines = renderToolCounts([
      { name: "read", status: "completed", startTime: 0 },
      { name: "edit", status: "completed", startTime: 1 },
      { name: "write", status: "completed", startTime: 2 },
      { name: "bash", status: "completed", startTime: 3 },
      { name: "grep", status: "completed", startTime: 4 },
      { name: "ls", status: "completed", startTime: 5 },
      { name: "find", status: "completed", startTime: 6 },
    ]);
    const text = lines.map(stripANSI).join("\n");
    const names = ["read", "edit", "write", "bash", "grep", "ls", "find"];
    let lastIdx = -1;
    for (const name of names) {
      const idx = text.indexOf(name);
      assert.ok(idx > lastIdx, `${name} should appear after previous (${lastIdx}), got ${idx}\n${text}`);
      lastIdx = idx;
    }
  });

  it("separator is 67 chars", () => {
    const lines = renderToolCounts([{ name: "read", status: "completed", startTime: 0 }]);
    const sep = stripANSI(lines[0]!);
    assert.equal(sep.length, 67, `separator should be 67 chars, got ${sep.length}: "${sep}"`);
  });

  it("filters out non-whitelisted tools", () => {
    const lines = renderToolCounts([
      { name: "read", status: "completed", startTime: 0 },
      { name: "mcp__some_server_tool", status: "completed", startTime: 1 },
      { name: "codegraph_explore", status: "completed", startTime: 2 },
    ]);
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("read"), `should include whitelisted read: ${text}`);
    assert.ok(!text.includes("mcp__"), `should not include non-whitelisted mcp__: ${text}`);
    assert.ok(!text.includes("codegraph"), `should not include non-whitelisted codegraph: ${text}`);
  });

  it("returns empty when only non-whitelisted tools completed", () => {
    const lines = renderToolCounts([
      { name: "third_party_tool", status: "completed", startTime: 0 },
    ]);
    assert.deepStrictEqual(lines, []);
  });

  it("returns empty when no completed tools at all", () => {
    const lines = renderToolCounts([
      { name: "read", status: "running", startTime: 0 },
    ]);
    assert.deepStrictEqual(lines, []);
  });
});

describe("renderAgentActivity", () => {
  it("returns empty for no agents", () => {
    assert.deepStrictEqual(renderAgentActivity([]), []);
  });

  it("shows running agent with timer", () => {
    const now = Date.now();
    const lines = renderAgentActivity([
      { status: "running", startTime: now - 3000 },
    ], "cyberpunk");
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("agent"), `should include agent: ${text}`);
    assert.ok(text.includes("↻"), `should include spinner: ${text}`);
  });

  it("shows completed count with agent label", () => {
    const lines = renderAgentActivity([
      { status: "completed", startTime: 0, endTime: 1000 },
      { status: "completed", startTime: 0, endTime: 2000 },
    ], "cyberpunk");
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("agent"), `should include agent label: ${text}`);
    assert.ok(text.includes("×2"), `should include ×2: ${text}`);
  });

  it("shows agent label even when only completed (no running)", () => {
    const lines = renderAgentActivity([
      { status: "completed", startTime: 0 },
    ], "cyberpunk");
    const text = lines.map(stripANSI).join("\n");
    assert.ok(text.includes("agent"), `should include agent even with only completed: ${text}`);
    assert.ok(text.includes("×1"), `should include ×1: ${text}`);
  });

  it("merges running + completed into one line", () => {
    const now = Date.now();
    const lines = renderAgentActivity([
      { status: "running", startTime: now - 5000 },
      { status: "completed", startTime: 0, endTime: 1000 },
    ], "cyberpunk");
    const text = lines.map(stripANSI).join("\n");
    // All agent content should be in one line (after separator)
    const dataLine = lines[1] ? stripANSI(lines[1]) : "";
    assert.ok(dataLine.includes("agent"), "data line should include agent");
    assert.ok(dataLine.includes("×1"), "data line should include ×1");
    // Running agent text should be on same line
    assert.ok(dataLine.includes("↻"), "data line should include running indicator");
  });

  it("separator is 67 chars for agent section", () => {
    const lines = renderAgentActivity([{ status: "completed", startTime: 0 }]);
    const sep = stripANSI(lines[0]!);
    assert.equal(sep.length, 67, `separator should be 67 chars, got ${sep.length}`);
  });
});
