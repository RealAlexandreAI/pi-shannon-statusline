/**
 * pi-shannon-statusline — Cyberpunk HUD for Pi
 * Ported from shannon-statusline (Claude Code).
 *
 * Commands:
 *   /shannon-statusline style <cyberpunk|powerline|minimal>
 *   /shannon-statusline rain <on|off>
 *
 * Config: ~/.pi/shannon-statusline.json
 *   { "style": "cyberpunk", "rain": true }
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

const CONFIG_PATH = join(homedir(), ".pi", "shannon-statusline.json");

type HUDStyle = "cyberpunk" | "powerline";

interface ShannonConfig {
  style: HUDStyle;
  rain: boolean;
}

function loadConfig(): ShannonConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as ShannonConfig;
  } catch {
    return { style: "cyberpunk", rain: true };
  }
}

function saveConfig(cfg: ShannonConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

let config = loadConfig();

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

interface AgentRecord {
  status: "running" | "completed";
  startTime: number;
  endTime?: number;
}

interface ToolRecord {
  name: string;
  target: string | null;
  status: "running" | "completed" | "error";
  startTime: number;
  endTime?: number;
}

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

let sessionStartTime = 0;
let tools: ToolRecord[] = [];
let agents: AgentRecord[] = [];
let modelProvider = "";
let modelId = "";
let cwd = "";

// ═══════════════════════════════════════════════════════════════
// ANSI palette
// ═══════════════════════════════════════════════════════════════

const R = "\x1b[0m";
const D = "\x1b[2m";

function rgb(r: number, g: number, b: number) { return `\x1b[38;2;${r};${g};${b}m`; }

// Monokai Pro
const FG = "\x1b[38;5;252m";
const COMMENT = "\x1b[38;5;243m";
const PINK = "\x1b[38;5;198m";
const GREEN = "\x1b[38;5;154m";
const ORANGE = "\x1b[38;5;208m";
const CYAN = "\x1b[38;5;123m";
const PURPLE = "\x1b[38;5;141m";
const YELLOW = "\x1b[38;5;221m";

// Powerline colors
const PL_BRIGHT = "\x1b[38;5;231m";
const PL_DIM = "\x1b[38;5;244m";
const PL_SEP = "\x1b[38;5;240m";

function c(text: string, color: string) { return `${color}${text}${R}`; }
function dim(text: string) { return `${D}${text}${R}`; }

// Icons
const I_PATH = "⌘";
const I_BRANCH = "⎇";
const I_CLOCK = "✦";
const I_CTX = "⊡";
const I_IN = "↑";
const I_DONE = "✔";
const I_RUN = "↻";
const I_CLAUDE = "※";
const I_MCP = "⊕";

// ═══════════════════════════════════════════════════════════════
// Fish-style path shortening (from original shannon-statusline)
// ═══════════════════════════════════════════════════════════════

function abbreviateSegment(segment: string): string {
  if (segment.length <= 1) return segment;
  const extra = segment.match(/[-.](.)/);
  return extra ? `${segment[0]}${extra[0]}` : segment[0];
}

function truncateTailSegment(segment: string, maxLen: number): string {
  if (segment.length <= maxLen) return segment;
  if (maxLen <= 1) return "…";
  const extStart = segment.lastIndexOf(".");
  const hasExt = extStart > 0 && extStart < segment.length - 1;
  if (!hasExt) return `…${segment.slice(-(maxLen - 1))}`;
  const ext = segment.slice(extStart);
  const base = segment.slice(0, extStart);
  const budget = maxLen - ext.length - 1;
  if (budget <= 0) return `…${ext.slice(-(maxLen - 1))}`;
  return `…${base.slice(-budget)}${ext}`;
}

function shortenDisplayPath(fullPath: string, home: string, maxLen: number): string {
  if (!fullPath) return "";
  let display = fullPath;
  if (home && fullPath === home) return "~";
  if (home && fullPath.startsWith(home + "/")) {
    display = "~" + fullPath.slice(home.length);
  }

  const prefix = display.startsWith("~") ? "~" : display.startsWith("/") ? "/" : "";
  const rawParts = display.split("/").filter(Boolean);
  const parts = prefix === "~" ? rawParts.slice(1) : rawParts;
  if (parts.length <= 1) return display;

  const tail = parts.slice(-1);
  const head = parts.slice(0, -1).map(abbreviateSegment);
  let shortened = [...head, ...tail].join("/");
  if (prefix) shortened = prefix + "/" + shortened;

  if (shortened.length <= maxLen) return shortened;

  const ellipsis = prefix + "/…/" + tail.join("/");
  if (ellipsis.length <= maxLen) return ellipsis;

  const budget = Math.max(1, maxLen - (prefix ? prefix.length + 4 : 3));
  return `${prefix ? prefix + "/" : ""}…/${truncateTailSegment(tail[0]!, budget)}`;
}

// ═══════════════════════════════════════════════════════════════
// Context bar
// ═══════════════════════════════════════════════════════════════

function ctxBar(percent: number, width: number): string {
  const safeP = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safeP / 100) * width);
  const empty = width - filled;

  let r0: number, g0: number, b0: number;
  let r1: number, g1: number, b1: number;
  if (safeP >= 85) { [r0, g0, b0] = [90, 0, 48]; [r1, g1, b1] = [255, 0, 144]; }
  else if (safeP >= 70) { [r0, g0, b0] = [122, 21, 0]; [r1, g1, b1] = [255, 107, 0]; }
  else { [r0, g0, b0] = [0, 51, 0]; [r1, g1, b1] = [57, 255, 20]; }

  const cells: string[] = [];
  for (let i = 0; i < filled; i++) {
    const t = filled > 1 ? i / (filled - 1) : 1;
    cells.push(`${rgb(Math.round(r0 + (r1 - r0) * t), Math.round(g0 + (g1 - g0) * t), Math.round(b0 + (b1 - b0) * t))}█`);
  }
  return `${cells.join("")}${D}${"░".repeat(empty)}${R}`;
}

function ctxPctColor(percent: number): string {
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
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ═══════════════════════════════════════════════════════════════
// Matrix rain (6 columns like original)
// ═══════════════════════════════════════════════════════════════

const RAIN_CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789λΨΩΔΦ";
const RAIN_COLS = 6;
const RAIN_SPEED_MS = 900;
const RAIN_COL_OFFSET_MS = 280;

function rainCell(row: number, col: number, now: number, total: number): string {
  const colPhase = ((now + col * RAIN_COL_OFFSET_MS) / RAIN_SPEED_MS) % total;
  const headRow = Math.floor(colPhase);
  const dist = (row - headRow + total) % total;
  const ch = RAIN_CHARS[Math.floor(now / 350 + row * 7 + col * 13) % RAIN_CHARS.length] ?? " ";

  if (dist === 0) return `${rgb(200, 255, 200)}${ch}${R}`;
  if (dist === 1) return `${rgb(57, 255, 20)}${ch}${R}`;
  if (dist === 2) return `${rgb(0, 200, 0)}${ch}${R}`;
  if (dist === 3) return `${rgb(0, 160, 0)}${ch}${R}`;
  if (dist === 4) return `${rgb(0, 100, 0)}${ch}${R}`;
  if (dist === total - 1) return `${rgb(20, 20, 20)}${ch}${R}`;
  if (dist === total - 2) return `${rgb(0, 0, 0)}${ch}${R}`;
  return `${rgb(8, 8, 8)}${ch}${R}`;
}

function makeRain(row: number, total: number): string {
  if (!config.rain) return "";
  const now = Date.now();
  const cells: string[] = [];
  for (let c = 0; c < RAIN_COLS; c++) cells.push(rainCell(row, c, now, total));
  return `${cells.join(" ")}  `;
}

// ═══════════════════════════════════════════════════════════════
// Git
// ═══════════════════════════════════════════════════════════════

async function getGit(dir: string): Promise<GitStatus | null> {
  if (!dir) return null;
  try {
    const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir, timeout: 1500, encoding: "utf8",
    });
    const branch = branchOut.trim();
    if (!branch) return null;

    let isDirty = false, modified = 0, added = 0, deleted = 0, untracked = 0;
    try {
      const { stdout: statusOut } = await execFileAsync("git", ["--no-optional-locks", "status", "--porcelain"], {
        cwd: dir, timeout: 1500, encoding: "utf8",
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
        cwd: dir, timeout: 1500, encoding: "utf8",
      });
      const parts = revOut.trim().split(/\s+/);
      if (parts.length === 2) { behind = parseInt(parts[0]!, 10) || 0; ahead = parseInt(parts[1]!, 10) || 0; }
    } catch { /* no upstream */ }

    return { branch, isDirty, ahead, behind, modified, added, deleted, untracked };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Config counter
// ═══════════════════════════════════════════════════════════════

function countConfigs(dir: string) {
  let claudeMd = 0, rules = 0, mcps = 0, skills = 0;
  try {
    if (existsSync(join(dir, "AGENTS.md"))) claudeMd++;
    if (existsSync(join(dir, "CLAUDE.md"))) claudeMd++;
    if (existsSync(join(dir, ".claude", "CLAUDE.md"))) claudeMd++;
    if (existsSync(join(dir, ".pi", "agent", "AGENTS.md"))) claudeMd++;

    const rulesDir = join(dir, ".claude", "rules");
    if (existsSync(rulesDir)) rules = readdirSync(rulesDir).filter(f => f.endsWith(".md")).length;

    if (existsSync(join(dir, ".mcp.json"))) mcps++;
    if (existsSync(join(dir, ".config", "mcp", "mcp.json"))) mcps++;

    const skillsDir = join(dir, ".claude", "skills");
    if (existsSync(skillsDir)) skills = readdirSync(skillsDir, { recursive: true }).filter(f => f.endsWith("SKILL.md")).length;
  } catch { /* ignore */ }
  return { claudeMd, rules, mcps, skills };
}

// ═══════════════════════════════════════════════════════════════
// HUD Renderer
// ═══════════════════════════════════════════════════════════════

async function buildHud(ctx: any): Promise<string[]> {
  const lines: string[] = [];
  const dir = cwd;
  const sep = config.style === "powerline" ? `${PL_SEP}│${R}` : `${COMMENT}│${R}`;

  // ── Line 1: Project + Git + Duration ──
  const parts1: string[] = [];
  if (dir) {
    const home = homedir();
    parts1.push(`${c(I_PATH, ORANGE)} ${c(shortenDisplayPath(dir, home, 30), ORANGE)}`);
  }

  const git = await getGit(dir);
  if (git) {
    const dirty = git.isDirty ? "*" : "";
    const branchColor = config.style === "powerline" ? PL_BRIGHT : CYAN;
    let gitStr = `${c(I_BRANCH, branchColor)} ${c(`${git.branch}${dirty}`, branchColor)}`;
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
    parts1.push(`${c(I_CLOCK, COMMENT)} ${c(fmtDuration(Date.now() - sessionStartTime), COMMENT)}`);
  }

  lines.push(parts1.join(` ${sep} `));

  // ── Line 2: Model (provider/id) + Thinking level + Context + Tokens ──
  const modelColor = config.style === "powerline" ? PL_BRIGHT : CYAN;
  const providerColor = config.style === "powerline" ? PL_DIM : COMMENT;
  let modelStr: string;
  if (modelProvider && modelId) {
    modelStr = `${c(I_IN, modelColor)} ${c(modelProvider, providerColor)}${dim("/")}${c(modelId, modelColor)}`;
  } else if (modelId) {
    modelStr = `${c(I_IN, modelColor)} ${c(modelId, modelColor)}`;
  } else if (modelProvider) {
    modelStr = `${c(I_IN, modelColor)} ${c(modelProvider, modelColor)}`;
  } else {
    modelStr = `${c(I_IN, modelColor)} ${c("pi", modelColor)}`;
  }

  // Thinking level removed — Pi doesn't expose real-time value in event context
  // (getThinkingLevel() only on command ctx, ctx.model has no current level)

  let ctxStr = "";
  try {
    const usage = ctx.getContextUsage?.();
    if (usage) {
      const pct = usage.percent ?? 0;
      const bar = ctxBar(pct, 10);
      const win = usage.contextWindow ?? 0;
      const winLabel = win >= 1_000_000 ? `${(win / 1_000_000).toFixed(1)}M` : win >= 1000 ? `${Math.round(win / 1000)}k` : "";
      ctxStr = `${c(I_CTX, CYAN)} ${bar} ${c(`${pct.toFixed(1)}%`, ctxPctColor(pct))}`;
      if (winLabel) ctxStr += ` ${dim(`(${winLabel})`)}`;

      const totalTokens = usage.tokens ?? 0;
      let tokStr = `${c(I_IN, CYAN)} ${c(fmtTokens(totalTokens), FG)}`;

      const line2 = `${modelStr} ${sep} ${ctxStr} ${sep} ${tokStr}`;
      lines.push(line2);
    } else {
      lines.push(modelStr);
    }
  } catch { lines.push(modelStr); }

  // ── Line 3: Config counts ──
  const configs = countConfigs(dir);
  const cfgParts: string[] = [];
  if (configs.claudeMd > 0) cfgParts.push(`${c(I_CLAUDE, config.style === "powerline" ? PL_BRIGHT : ORANGE)} ${c(`×${configs.claudeMd}`, config.style === "powerline" ? PL_BRIGHT : ORANGE)} ${dim("AGENTS.md")}`);
  if (configs.rules > 0) cfgParts.push(`${c(`×${configs.rules}`, COMMENT)} ${dim("rules")}`);
  if (configs.mcps > 0) cfgParts.push(`${c(I_MCP, config.style === "powerline" ? PL_BRIGHT : CYAN)} ${c(`×${configs.mcps}`, config.style === "powerline" ? PL_BRIGHT : CYAN)} ${dim("MCPs")}`);
  if (configs.skills > 0) cfgParts.push(`${c(`×${configs.skills}`, PURPLE)} ${dim("skills")}`);
  if (cfgParts.length > 0) lines.push(cfgParts.join(` ${sep} `));

  // ── Separator + Tool counts ──
  const completed = tools.filter(t => t.status === "completed");
  const toolCounts = new Map<string, number>();
  for (const t of completed) toolCounts.set(t.name, (toolCounts.get(t.name) ?? 0) + 1);

  const toolLineParts: string[] = [];
  for (const name of ["read", "edit", "write", "bash", "grep", "find", "ls"]) {
    const count = toolCounts.get(name) ?? 0;
    if (count > 0) toolLineParts.push(`${GREEN} ${c(name, FG)}${count > 1 ? ` ${c(`×${count}`, COMMENT)}` : ""}`);
  }
  if (toolLineParts.length > 0) {
    lines.push(`${COMMENT}${"─".repeat(67)}${R}`);
    lines.push(toolLineParts.join(` ${sep} `));
  }

  // ── Running tools ──
  const running = tools.filter(t => t.status === "running");
  for (const t of running.slice(-2)) {
    const elapsed = fmtDuration(Date.now() - t.startTime);
    const target = t.target ? `: ${shortenDisplayPath(t.target, homedir(), 22)}` : "";
    lines.push(`${c(I_RUN, YELLOW)} ${c(t.name, CYAN)}${target} ${c(`(${elapsed})`, COMMENT)}`);
  }

  // ── Agent activity ──
  const agentRunning = agents.filter(a => a.status === "running");
  const agentCompleted = agents.filter(a => a.status === "completed");
  if (agentRunning.length > 0 || agentCompleted.length > 0) {
    lines.push(`${COMMENT}${"─".repeat(67)}${R}`);
    for (const a of agentRunning) {
      lines.push(`${c(I_RUN, YELLOW)} ${c("agent", PURPLE)} ${c(`(${fmtDuration(Date.now() - a.startTime)})`, COMMENT)}`);
    }
    if (agentCompleted.length > 0) {
      lines.push(`${GREEN} ${c("agent", PURPLE)} ${c(`×${agentCompleted.length}`, COMMENT)}`);
    }
  }

  // ── Matrix rain (if enabled) ──
  if (config.rain) {
    const total = lines.length;
    for (let i = 0; i < total; i++) {
      lines[i] = `${makeRain(i, total)}${lines[i]}`;
    }
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// HUD refresh
// ═══════════════════════════════════════════════════════════════

function refreshHud(ctx: any) {
  buildHud(ctx).then(lines => {
    if (lines.length > 0) ctx.ui.setWidget("shannon-hud", lines, { placement: "belowEditor" });
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// Extension entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  // ── Command: /shannon-statusline ──
  pi.registerCommand("shannon-statusline", {
    description: "Toggle HUD style or matrix rain",
    handler: async (args, ctx) => {
      const a = (args ?? "").trim().toLowerCase();

      if (a.startsWith("style")) {
        const styleArg = a.replace("style", "").trim();
        const validStyles: HUDStyle[] = ["cyberpunk", "powerline"];
        if (validStyles.includes(styleArg as HUDStyle)) {
          config.style = styleArg as HUDStyle;
          saveConfig(config);
          refreshHud(ctx);
          ctx.ui.notify(`Shannon HUD → ${styleArg}`, "info");
        } else {
          ctx.ui.notify(`Unknown style: "${styleArg}". Use: cyberpunk | powerline`, "warn");
        }
      } else if (a.startsWith("rain")) {
        const rainArg = a.replace("rain", "").trim();
        if (rainArg === "on") {
          config.rain = true;
          saveConfig(config);
          refreshHud(ctx);
          ctx.ui.notify("Matrix rain: ON", "info");
        } else if (rainArg === "off") {
          config.rain = false;
          saveConfig(config);
          refreshHud(ctx);
          ctx.ui.notify("Matrix rain: OFF", "info");
        } else {
          ctx.ui.notify(`Use: /shannon-statusline rain on|off`, "warn");
        }
      } else {
        ctx.ui.notify(
          "Shannon HUD commands:\n" +
          "  style cyberpunk | powerline\n" +
          "  rain on | off",
          "info",
        );
      }
    },
  });

  // ── Events ──
  pi.on("session_start", (_event, ctx) => {
    config = loadConfig();
    sessionStartTime = Date.now();
    cwd = ctx.cwd;
    tools = [];
    if (ctx.model) {
      modelProvider = (ctx.model as any).provider ?? "";
      modelId = (ctx.model as any).id ?? "";
    }
    refreshHud(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    if (event.model) {
      modelProvider = (event.model as any).provider ?? "";
      modelId = (event.model as any).id ?? "";
    }
    refreshHud(ctx);
  });

  pi.on("thinking_level_select", (_event) => {
    // Event fires on manual change; no real-time read API in ExtensionContext
  });

  pi.on("tool_call", (event, ctx) => {
    const tool: ToolRecord = { name: event.toolName, target: null, status: "running", startTime: Date.now() };
    if (event.input && typeof event.input === "object") {
      const inp = event.input as Record<string, unknown>;
      if (typeof inp.path === "string") tool.target = inp.path;
      else if (typeof inp.filePath === "string") tool.target = inp.filePath;
    }
    tools.push(tool);
    refreshHud(ctx);
  });

  pi.on("tool_result", (event, ctx) => {
    for (let i = tools.length - 1; i >= 0; i--) {
      if (tools[i]!.name === event.toolName && tools[i]!.status === "running") {
        tools[i]!.status = event.isError ? "error" : "completed";
        tools[i]!.endTime = Date.now();
        break;
      }
    }
    refreshHud(ctx);
  });

  pi.on("turn_end", (_event, ctx) => refreshHud(ctx));
  pi.on("agent_end", (_event, ctx) => {
    // Mark running agents as completed
    for (const a of agents) {
      if (a.status === "running") {
        a.status = "completed";
        a.endTime = Date.now();
      }
    }
    refreshHud(ctx);
  });
  pi.on("agent_start", (_event, ctx) => {
    agents.push({ status: "running", startTime: Date.now() });
    refreshHud(ctx);
  });
}
