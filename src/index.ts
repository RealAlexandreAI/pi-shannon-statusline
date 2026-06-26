/**
 * pi-shannon-statusline — Cyberpunk HUD for Pi
 * Ported from shannon-statusline (Claude Code) to Pi extension.
 *
 * Architecture:
 *   - Hooks into turn_end / agent_end to update a multi-line widget
 *   - Tracks tool calls, gits status, context usage internally
 *   - Uses ctx.ui.setWidget("shannon-hud", lines) to render above the editor
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface GitStatus {
  branch: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
}

interface ToolRecord {
  name: string;
  target: string | null;
  status: "running" | "completed" | "error";
  startTime: number;
  endTime?: number;
}

interface AgentRecord {
  type: string;
  model: string | null;
  description: string | null;
  status: "running" | "completed";
  startTime: number;
  endTime?: number;
}

// ═══════════════════════════════════════════════════════════════
// Internal state
// ═══════════════════════════════════════════════════════════════

let sessionStartTime = 0;
let tools: ToolRecord[] = [];
let agents: AgentRecord[] = [];
let currentModel = "";
let thinkingLevel = "";
let cwd = "";

// ═══════════════════════════════════════════════════════════════
// ANSI helpers
// ═══════════════════════════════════════════════════════════════

const R = "\x1b[0m";
const D = "\x1b[2m";

function rgb(r: number, g: number, b: number) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

// Monokai Pro palette
const FG = "\x1b[38;5;252m";
const COMMENT = "\x1b[38;5;243m";
const PINK = "\x1b[38;5;198m";
const GREEN = "\x1b[38;5;154m";
const ORANGE = "\x1b[38;5;208m";
const CYAN = "\x1b[38;5;123m";
const PURPLE = "\x1b[38;5;141m";
const YELLOW = "\x1b[38;5;221m";
const BLUE = "\x1b[38;5;111m";

function c(text: string, color: string) {
  return `${color}${text}${R}`;
}
function dim(text: string) {
  return `${D}${text}${R}`;
}

const SEP = COMMENT;

// Icons
const I_PATH = "⌘";
const I_BRANCH = "⎇";
const I_CLOCK = "✦";
const I_LOCK = "⊟";
const I_IN = "↑";
const I_OUT = "↓";
const I_CACHE = "⊗";
const I_CTX = "⊡";
const I_MODEL = "λ";
const I_DONE = "✔";
const I_RUN = "↻";
const I_CLAUDE = "※";
const I_MCP = "⊕";

// ═══════════════════════════════════════════════════════════════
// Context bar
// ═══════════════════════════════════════════════════════════════

function contextBar(percent: number, width: number): string {
  const safeW = Math.max(0, width);
  const safeP = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safeP / 100) * safeW);
  const empty = safeW - filled;

  let r0: number, g0: number, b0: number;
  let r1: number, g1: number, b1: number;
  if (safeP >= 85) {
    [r0, g0, b0] = [90, 0, 48];
    [r1, g1, b1] = [255, 0, 144];
  } else if (safeP >= 70) {
    [r0, g0, b0] = [122, 21, 0];
    [r1, g1, b1] = [255, 107, 0];
  } else {
    [r0, g0, b0] = [0, 51, 0];
    [r1, g1, b1] = [57, 255, 20];
  }

  const cells: string[] = [];
  for (let i = 0; i < filled; i++) {
    const t = filled > 1 ? i / (filled - 1) : 1;
    const r = Math.round(r0 + (r1 - r0) * t);
    const g = Math.round(g0 + (g1 - g0) * t);
    const b = Math.round(b0 + (b1 - b0) * t);
    cells.push(`${rgb(r, g, b)}█`);
  }
  return `${cells.join("")}${D}${"░".repeat(empty)}${R}`;
}

function ctxColor(percent: number): string {
  if (percent >= 85) return rgb(255, 0, 144);
  if (percent >= 70) return rgb(255, 107, 0);
  return rgb(57, 255, 20);
}

// ═══════════════════════════════════════════════════════════════
// Formatters
// ═══════════════════════════════════════════════════════════════

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min}m`;
}

function shortenPath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p;
  const parts = p.split("/");
  if (parts.length <= 2) return p;
  let result = `${parts[0]}/...`;
  for (let i = 1; i < parts.length; i++) {
    const candidate = `${result}/${parts[i]}`;
    if (candidate.length > maxLen) {
      result += "/...";
      break;
    }
    result = candidate;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Matrix rain
// ═══════════════════════════════════════════════════════════════

const RAIN_CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789λΨΩΔΦ";
const RAIN_COLS = 4;

function rainCell(row: number, col: number, now: number, total: number): string {
  const colPhase = ((now + col * 280) / 900) % total;
  const headRow = Math.floor(colPhase);
  const dist = (row - headRow + total) % total;
  const ch = RAIN_CHARS[Math.floor(now / 350 + row * 7 + col * 13) % RAIN_CHARS.length] ?? " ";

  if (dist === 0) return `${rgb(200, 255, 200)}${ch}${R}`;
  if (dist === 1) return `${rgb(57, 255, 20)}${ch}${R}`;
  if (dist === 2) return `${rgb(0, 200, 0)}${ch}${R}`;
  if (dist === 3) return `${rgb(0, 160, 0)}${ch}${R}`;
  if (dist === total - 1) return `${rgb(20, 20, 20)}${ch}${R}`;
  return `${rgb(8, 8, 8)}${ch}${R}`;
}

function makeRain(row: number, total: number): string {
  const now = Date.now();
  const cells: string[] = [];
  for (let c = 0; c < RAIN_COLS; c++) {
    cells.push(rainCell(row, c, now, total));
  }
  return cells.join(" ");
}

// ═══════════════════════════════════════════════════════════════
// Git
// ═══════════════════════════════════════════════════════════════

async function getGit(dir: string): Promise<GitStatus | null> {
  if (!dir) return null;
  try {
    const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir, timeout: 1000, encoding: "utf8",
    });
    const branch = branchOut.trim();
    if (!branch) return null;

    let isDirty = false;
    let modified = 0, added = 0, deleted = 0, untracked = 0;
    try {
      const { stdout: statusOut } = await execFileAsync("git", ["--no-optional-locks", "status", "--porcelain"], {
        cwd: dir, timeout: 1000, encoding: "utf8",
      });
      const lines = statusOut.trim().split("\n").filter(Boolean);
      isDirty = lines.length > 0;
      for (const line of lines) {
        if (line.startsWith("??")) untracked++;
        else if (line[0] === "A") added++;
        else if (line[0] === "D" || line[1] === "D") deleted++;
        else if (line[0] === "M" || line[1] === "M" || line[0] === "R" || line[0] === "C") modified++;
      }
    } catch { /* ignore */ }

    let ahead = 0, behind = 0;
    try {
      const { stdout: revOut } = await execFileAsync("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], {
        cwd: dir, timeout: 1000, encoding: "utf8",
      });
      const parts = revOut.trim().split(/\s+/);
      if (parts.length === 2) {
        behind = parseInt(parts[0]!, 10) || 0;
        ahead = parseInt(parts[1]!, 10) || 0;
      }
    } catch { /* no upstream */ }

    return { branch, isDirty, ahead, behind, modified, added, deleted, untracked };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Config counter
// ═══════════════════════════════════════════════════════════════

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function countConfigs(dir: string) {
  let claudeMd = 0, rules = 0, mcps = 0, skills = 0;
  try {
    // Count AGENTS.md / CLAUDE.md files (Pi uses AGENTS.md, Claude uses CLAUDE.md)
    if (existsSync(join(dir, "AGENTS.md"))) claudeMd++;
    if (existsSync(join(dir, "CLAUDE.md"))) claudeMd++;
    if (existsSync(join(dir, ".claude", "CLAUDE.md"))) claudeMd++;
    if (existsSync(join(dir, ".pi", "agent", "AGENTS.md"))) claudeMd++;

    // Count .claude/rules/ or .pi/agent/ files
    const rulesDir = join(dir, ".claude", "rules");
    if (existsSync(rulesDir)) {
      rules = readdirSync(rulesDir).filter(f => f.endsWith(".md")).length;
    }

    // Count MCP configs
    if (existsSync(join(dir, ".mcp.json"))) mcps++;
    const mcpDir = join(dir, ".config", "mcp");
    if (existsSync(join(mcpDir, "mcp.json"))) mcps++;

    // Count skills
    const skillsDir = join(dir, ".claude", "skills");
    if (existsSync(skillsDir)) {
      skills = readdirSync(skillsDir, { recursive: true }).filter(f => f.endsWith("SKILL.md")).length;
    }
  } catch { /* ignore */ }
  return { claudeMd, rules, mcps, skills };
}

// ═══════════════════════════════════════════════════════════════
// HUD Renderer
// ═══════════════════════════════════════════════════════════════

async function buildHud(ctx: any): Promise<string[]> {
  const lines: string[] = [];
  const dir = cwd;

  // ── Line 1: Project + Git + Duration ──
  const parts1: string[] = [];
  if (dir) {
    parts1.push(`${c(I_PATH, ORANGE)} ${c(shortenPath(dir, 35), ORANGE)}`);
  }

  const git = await getGit(dir);
  if (git) {
    const dirty = git.isDirty ? "*" : "";
    let gitStr = `${c(I_BRANCH, CYAN)} ${c(`${git.branch}${dirty}`, CYAN)}`;
    const details: string[] = [];
    if (git.ahead > 0) details.push(c(`↑${git.ahead}`, GREEN));
    if (git.behind > 0) details.push(c(`↓${git.behind}`, PINK));
    if (git.modified > 0) details.push(c(`!${git.modified}`, PINK));
    if (git.added > 0) details.push(c(`+${git.added}`, GREEN));
    if (git.deleted > 0) details.push(c(`✘${git.deleted}`, PINK));
    if (git.untracked > 0) details.push(c(`?${git.untracked}`, COMMENT));
    if (details.length > 0) gitStr += ` ${details.join(" ")}`;
    parts1.push(gitStr);
  }

  if (sessionStartTime > 0) {
    const dur = fmtDuration(Date.now() - sessionStartTime);
    parts1.push(`${c(I_CLOCK, COMMENT)} ${c(dur, COMMENT)}`);
  }

  lines.push(parts1.join(` ${SEP} `));

  // ── Line 2: Model + Context + Tokens ──
  const modelPart = `${c(I_MODEL, CYAN)} ${c(currentModel || "pi", CYAN)}`;

  let ctxPart = "";
  try {
    const usage = ctx.getContextUsage?.();
    if (usage) {
      const pct = usage.percent ?? 0;
      const bar = contextBar(pct, 10);
      const size = usage.contextWindow ?? 0;
      const sizeLabel = size >= 1_000_000 ? `${(size / 1_000_000).toFixed(1)}M` : size >= 1000 ? `${Math.round(size / 1000)}k` : "";
      ctxPart = `${c(I_CTX, CYAN)} ${bar} ${c(`${pct}%`, ctxColor(pct))}`;
      if (sizeLabel) ctxPart += ` ${dim(`(${sizeLabel})`)}`;

      let tokPart = "";
      const totalTokens = usage.tokens ?? 0;
      let tokPart = `${c(I_IN, CYAN)} ${c(fmtTokens(totalTokens), FG)}`;

      const line2 = `${modelPart}  ${SEP}  ${ctxPart}  ${SEP}  ${tokPart}`;
      lines.push(line2);
    } else {
      lines.push(modelPart);
    }
  } catch {
    lines.push(modelPart);
  }

  // ── Line 3: Config counts ──
  const configs = countConfigs(dir);
  const cfgParts: string[] = [];
  if (configs.claudeMd > 0) cfgParts.push(`${c(I_CLAUDE, ORANGE)} ${c(`×${configs.claudeMd}`, ORANGE)} ${dim("AGENTS.md")}`);
  if (configs.rules > 0) cfgParts.push(`${c(`×${configs.rules}`, COMMENT)} ${dim("rules")}`);
  if (configs.mcps > 0) cfgParts.push(`${c(I_MCP, CYAN)} ${c(`×${configs.mcps}`, CYAN)} ${dim("MCPs")}`);
  if (configs.skills > 0) cfgParts.push(`${c(`×${configs.skills}`, PURPLE)} ${dim("skills")}`);
  if (cfgParts.length > 0) lines.push(cfgParts.join(` ${SEP} `));

  // ── Separator + Tool counts ──
  const completed = tools.filter(t => t.status === "completed");
  const toolCounts = new Map<string, number>();
  for (const t of completed) toolCounts.set(t.name, (toolCounts.get(t.name) ?? 0) + 1);

  const toolLineParts: string[] = [];
  for (const name of ["read", "edit", "write", "bash", "grep", "find", "ls"]) {
    const count = toolCounts.get(name) ?? 0;
    if (count > 0) {
      toolLineParts.push(`${GREEN} ${c(name, FG)}${count > 1 ? ` ${c(`×${count}`, COMMENT)}` : ""}`);
    }
  }
  if (toolLineParts.length > 0) {
    lines.push(`${SEP}${"─".repeat(50)}${R}`);
    lines.push(toolLineParts.join(`  ${SEP}  `));
  }

  // ── Running tools ──
  const running = tools.filter(t => t.status === "running");
  for (const t of running.slice(-2)) {
    const elapsed = fmtDuration(Date.now() - t.startTime);
    const target = t.target ? `: ${shortenPath(t.target, 25)}` : "";
    lines.push(`${c(I_RUN, YELLOW)} ${c(t.name, CYAN)}${target} ${c(`(${elapsed})`, COMMENT)}`);
  }

  // ── Matrix rain overlay ──
  const rainTotal = lines.length;
  for (let i = 0; i < lines.length; i++) {
    lines[i] = `${makeRain(i, rainTotal)}  ${lines[i]!}`;
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// Extension entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    sessionStartTime = Date.now();
    cwd = ctx.cwd;
    tools = [];
    agents = [];
  });

  pi.on("model_select", (event, ctx) => {
    currentModel = event.model?.id ?? "";
    refreshHud(ctx);
  });

  pi.on("thinking_level_select", (event, ctx) => {
    thinkingLevel = event.level;
    refreshHud(ctx);
  });

  pi.on("tool_call", (event, ctx) => {
    const tool: ToolRecord = {
      name: event.toolName,
      target: null,
      status: "running",
      startTime: Date.now(),
    };

    // Extract path-like targets
    if (event.input && typeof event.input === "object") {
      const inp = event.input as Record<string, unknown>;
      if (typeof inp.path === "string") tool.target = inp.path;
      else if (typeof inp.filePath === "string") tool.target = inp.filePath;
    }

    tools.push(tool);
    refreshHud(ctx);
  });

  pi.on("tool_result", (event, ctx) => {
    // Mark the latest running tool with matching name as completed
    for (let i = tools.length - 1; i >= 0; i--) {
      if (tools[i]!.name === event.toolName && tools[i]!.status === "running") {
        tools[i]!.status = event.isError ? "error" : "completed";
        tools[i]!.endTime = Date.now();
        break;
      }
    }
    refreshHud(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    refreshHud(ctx);
  });

  pi.on("agent_end", (_event, ctx) => {
    refreshHud(ctx);
  });

  // Periodic refresh for rain animation
  setInterval(() => {
    // ctx is not available in interval — just mark dirty
    // The next event will re-render with fresh rain
  }, 900);
}

function refreshHud(ctx: any) {
  buildHud(ctx).then(lines => {
    if (lines.length > 0) {
      ctx.ui.setWidget("shannon-hud", lines);
    }
  }).catch(() => {
    // Silent fail
  });
}
