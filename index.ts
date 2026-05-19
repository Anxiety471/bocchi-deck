/**
 * Bocchi Deck — A Pi TUI Extension (formerly Pi Control Deck)
 *
 * Adds widgets, status labels, /bocchi command palette, settings overlay,
 * custom renderCall/renderResult cards, error cards, working indicator,
 * confirmation dialogs, and BorderedLoader overlays.
 *
 * Themes: retro-rock, mono-stage, tokyo-night, minimal
 * Primary command: /bocchi
 *
 * Uses only official Pi TUI APIs.
 * No import or hardcoding of theme values.
 * Every custom component implements render(width), invalidate(), handleInput(data) if interactive.
 * Width safety enforced via truncateToWidth / wrapTextWithAnsi.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
	BorderedLoader,
	DynamicBorder,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Text,
	Spacer,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

// ─── Theme Config ────────────────────────────────────────────────────

type ThemeMode = "retro-rock" | "mono-stage" | "tokyo-night" | "minimal";

interface BocchiLabels {
	activeContextTitle: string;
	workflowTitle: string;
	toolCallTitle: string;
	resultTitle: string;
	errorTitle: string;
	warningTitle: string;
	confirmTitle: string;
	settingsTitle: string;
	commandPaletteTitle: string;
	statusTitle: string;
	loadingTitle: string;
	idle: string;
	running: string;
}

interface BocchiThemeConfig {
	labels: BocchiLabels;
	borderStyle: "simple" | "rounded";
	titleColor: string;
	overlayColor: string;
	cardBorderColor: string;
}

function getThemeConfig(mode: ThemeMode): BocchiThemeConfig {
	switch (mode) {
		case "retro-rock":
			return {
				labels: {
					activeContextTitle: "\uD83C\uDFB8 ACTIVE SESSION",
					workflowTitle: "\u25A3 SETLIST",
					toolCallTitle: "\u26A1 RIFF EXECUTION",
					resultTitle: "\u2713 CLEAN TAKE",
					errorTitle: "\u2717 BAD TAKE",
					warningTitle: "\u26A0 OFF-BEAT",
					confirmTitle: "\u25B6 START TAKE?",
					settingsTitle: "\u2699 AMP SETTINGS",
					commandPaletteTitle: "\uD83C\uDFB8 BOCCHI DECK",
					statusTitle: "\uD83C\uDFB8 BOCHI STATUS",
					loadingTitle: "\u23FA RECORDING",
					idle: "backstage",
					running: "live",
				},
				borderStyle: "rounded",
				titleColor: "accent",
				overlayColor: "accent",
				cardBorderColor: "accent",
			};
		case "mono-stage":
			return {
				labels: {
					activeContextTitle: "SESSION",
					workflowTitle: "TRACK",
					toolCallTitle: "EXEC",
					resultTitle: "OUTPUT",
					errorTitle: "FAULT",
					warningTitle: "ATTENTION",
					confirmTitle: "CONFIRM?",
					settingsTitle: "CONFIG",
					commandPaletteTitle: "BOCCHI DECK",
					statusTitle: "STATUS",
					loadingTitle: "BUSY",
					idle: "standby",
					running: "active",
				},
				borderStyle: "rounded",
				titleColor: "muted",
				overlayColor: "accent",
				cardBorderColor: "muted",
			};
		case "tokyo-night":
			return {
				labels: {
					activeContextTitle: "ACTIVE CONTEXT",
					workflowTitle: "WORKFLOW",
					toolCallTitle: "TOOL CALL",
					resultTitle: "RESULT",
					errorTitle: "ERROR",
					warningTitle: "WARNING",
					confirmTitle: "CONFIRM",
					settingsTitle: "SETTINGS",
					commandPaletteTitle: "COMMAND PALETTE",
					statusTitle: "DECK STATUS",
					loadingTitle: "WORKING",
					idle: "idle",
					running: "running",
				},
				borderStyle: "simple",
				titleColor: "accent",
				overlayColor: "accent",
				cardBorderColor: "accent",
			};
		case "minimal":
		default:
			return {
				labels: {
					activeContextTitle: "",
					workflowTitle: "",
					toolCallTitle: "",
					resultTitle: "",
					errorTitle: "",
					warningTitle: "",
					confirmTitle: "",
					settingsTitle: "",
					commandPaletteTitle: "",
					statusTitle: "",
					loadingTitle: "",
					idle: "-",
					running: ">",
				},
				borderStyle: "simple",
				titleColor: "muted",
				overlayColor: "accent",
				cardBorderColor: "muted",
			};
	}
}

// ─── Compact Label Helper ──────────────────────────────────────────

/**
 * Derive a shorter prefix for compact mode.
 * For emoji-prefixed labels (e.g., "\uD83C\uDFB8 ACTIVE SESSION")
 * returns "\uD83C\uDFB8 session:". For plain labels (e.g., "ACTIVE CONTEXT")
 * returns "context:". For empty labels returns "".
 */
function getCompactLabel(title: string): string {
	if (!title) return "";
	const trimmed = title.trim();
	const parts = trimmed.split(/\s+/);
	const lastWord = parts[parts.length - 1].toLowerCase();
	const firstCode = trimmed.charCodeAt(0);
	if (firstCode > 127) {
		return trimmed[0] + " " + lastWord + ":";
	}
	return lastWord + ":";
}

// ─── Card Accent Colors ──────────────────────────────────────────────

/**
 * Card type identifiers for per-card border colors.
 * Only used by retro-rock theme in expanded mode.
 */
type CardType =
	| "session"
	| "setlist"
	| "riff"
	| "clean-take"
	| "bad-take"
	| "off-beat"
	| "amp"
	| "start-take";

/**
 * Map a card type to the Pi theme color key for its border accent.
 * For retro-rock:
 *   session      -> "accent"   (blue/cyan)
 *   setlist      -> "accent"   (pink/purple, approximated)
 *   riff         -> "warning"  (yellow/orange)
 *   clean-take   -> "success"  (green)
 *   bad-take     -> "error"    (red)
 *   off-beat     -> "warning"  (yellow)
 *   amp          -> "accent"   (pink/purple, approximated)
 *   start-take   -> "warning"  (yellow)
 * For other themes, return the theme-level cardBorderColor.
 */
function getCardAccent(cfg: BocchiThemeConfig, cardType: CardType): string {
	if (cfg.labels.activeContextTitle.includes("\uD83C\uDFB8")) {
		// retro-rock: per-card accent mapping
		switch (cardType) {
			case "session":
				return "accent";
			case "setlist":
				return "warning";
			case "riff":
				return "warning";
			case "clean-take":
				return "success";
			case "bad-take":
				return "error";
			case "off-beat":
				return "warning";
			case "amp":
				return "warning";
			case "start-take":
				return "warning";
		}
	}
	if (cfg.labels.activeContextTitle === "SESSION") {
		// mono-stage: use theme cardBorderColor for all
		return cfg.cardBorderColor;
	}
	// tokyo-night, minimal: use theme cardBorderColor
	return cfg.cardBorderColor;
}

/**
 * Determine if we should render expanded card borders.
 */
function isExpandedCard(
	width: number,
	compactMode: boolean,
	themeMode: ThemeMode,
): boolean {
	return width >= 100 && !compactMode && themeMode !== "minimal";
}

// ─── Types ───────────────────────────────────────────────────────────

interface BocchiState {
	showActiveContext: boolean;
	showWorkflowProgress: boolean;
	showStatusLabels: boolean;
	modeLabel: string;
	budgetLabel: string;
	toolsLabel: string;
	currentModel: string;
	currentProvider: string;
	thinkingLevel: string;
	turnCount: number;
	toolExecutionCount: number;
	toolExecutionLabel: string;
	workingText: string;
	showWorkingIndicator: boolean;
	compactMode: boolean;
	renderCardsEnabled: boolean;
	lastToolName: string;
	lastToolAction: string;
	themeMode: ThemeMode;
	aliasesEnabled: boolean;
	widgetWidth: number;
	widgetMode: string;
}

const DEFAULT_STATE: BocchiState = {
	showActiveContext: true,
	showWorkflowProgress: true,
	showStatusLabels: true,
	modeLabel: "normal",
	budgetLabel: "",
	toolsLabel: "",
	currentModel: "",
	currentProvider: "",
	thinkingLevel: "off",
	turnCount: 0,
	toolExecutionCount: 0,
	toolExecutionLabel: "",
	workingText: "",
	showWorkingIndicator: true,
	compactMode: false,
	renderCardsEnabled: true,
	lastToolName: "none",
	lastToolAction: "none",
	themeMode: "retro-rock",
	aliasesEnabled: true,
	widgetWidth: 0,
	widgetMode: "narrow",
};

// ─── Card Drawing Helpers ───────────────────────────────────────────

/**
 * Draw a themed card with rounded or simple borders.
 * When expanded is true and width >= 100, renders colored borders.
 * Returns lines that are already width-safe (use directly).
 */
function drawCard(
	theme: Theme,
	cfg: BocchiThemeConfig,
	title: string,
	bodyLines: string[],
	width: number,
	borderColor?: string,
	expanded?: boolean,
): string[] {
	const t = theme;
	const colorKey = borderColor ?? cfg.cardBorderColor;
	const lines: string[] = [];
	const useExpanded =
		expanded &&
		width >= 100 &&
		cfg.borderStyle === "rounded" &&
		cfg.labels.activeContextTitle !== "";

	if (useExpanded) {
		// Expanded card with colored borders
		// ╭─ TITLE ──────────────────────────────────╮
		const titleStr = ` ${t.fg(colorKey, t.bold(title))} `;
		const titleW = visibleWidth(titleStr);
		const rightFill = Math.max(1, width - titleW);
		lines.push(
			truncateToWidth(
				t.fg(colorKey, "\u256D") +
					titleStr +
					t.fg(colorKey, "\u2500".repeat(rightFill - 1)) +
					t.fg(colorKey, "\u256E"),
				width,
			),
		);

		// │ content with side gutters                 │
		for (const body of bodyLines) {
			const bodyTrimmed = truncateToWidth(body, width - 4);
			const bodyW = visibleWidth(bodyTrimmed);
			const pad = Math.max(1, width - bodyW - 3);
			lines.push(
				t.fg(colorKey, "\u2502") +
					" " +
					bodyTrimmed +
					" ".repeat(pad - 1) +
					t.fg(colorKey, "\u2502"),
			);
		}

		// ╰───────────────────────────────────────────╯
		lines.push(
			truncateToWidth(
				t.fg(colorKey, "\u2570") +
					t.fg(colorKey, "\u2500".repeat(width - 2)) +
					t.fg(colorKey, "\u256F"),
				width,
			),
		);
	} else if (
		cfg.borderStyle === "rounded" &&
		cfg.labels.activeContextTitle !== ""
	) {
		// Compact rounded: ╭─ title ─────────────────╮
		const titleStr = ` ${t.fg(colorKey, t.bold(title))} `;
		const titleW = visibleWidth(titleStr);
		const rightFill = Math.max(1, width - titleW - 1);
		lines.push(
			truncateToWidth(
				t.fg(colorKey, "\u256D") +
					titleStr +
					t.fg(colorKey, "\u2500".repeat(rightFill - 1)) +
					t.fg(colorKey, "\u256E"),
				width,
			),
		);

		// │ content                                    │
		for (const body of bodyLines) {
			const bodyTrimmed = truncateToWidth(body, width - 2);
			const bodyW = visibleWidth(bodyTrimmed);
			const pad = Math.max(1, width - bodyW - 1);
			lines.push(
				t.fg(colorKey, "\u2502") +
					bodyTrimmed +
					" ".repeat(pad - 1) +
					t.fg(colorKey, "\u2502"),
			);
		}

		// ╰────────────────────────────────────────────╯
		lines.push(
			truncateToWidth(
				t.fg(colorKey, "\u2570") +
					t.fg(colorKey, "\u2500".repeat(width - 2)) +
					t.fg(colorKey, "\u256F"),
				width,
			),
		);
	} else {
		// Simple border style (tokyo-night / minimal)
		const titleStr = ` ${t.fg(colorKey, t.bold(title))} `;
		const titleW = visibleWidth(titleStr);
		const padLen = Math.max(2, width - titleW - 2);
		const leftPad = Math.floor(padLen / 2);
		const rightPad = padLen - leftPad;
		const sep = t.fg("borderMuted", "\u2500");
		lines.push(sep.repeat(leftPad) + titleStr + sep.repeat(rightPad));

		for (const body of bodyLines) {
			lines.push(truncateToWidth(` ${body}`, width));
		}

		lines.push(
			truncateToWidth(t.fg("borderMuted", "\u2500".repeat(width)), width),
		);
	}

	return lines;
}

// ─── Widget Components ────────────────────────────────────────────────

/**
 * Active Context Widget — themed label + compact/expanded data line.
 * Expanded mode (width >= 100, compact off): renders colored card borders.
 * Compact mode: one-line with themed label icon.
 */
class ActiveContextWidget {
	private state: BocchiState;
	private theme: Theme;
	private cfg: BocchiThemeConfig;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(state: BocchiState, theme: Theme) {
		this.state = state;
		this.theme = theme;
		this.cfg = getThemeConfig(state.themeMode);
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
		this.cfg = getThemeConfig(this.state.themeMode);
		this.invalidate();
	}

	setThemeMode(mode: ThemeMode): void {
		this.cfg = getThemeConfig(mode);
		this.invalidate();
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const t = this.theme;
		const cfg = this.cfg;
		const lines: string[] = [];
		const accent = getCardAccent(cfg, "session");

		if (isExpandedCard(width, this.state.compactMode, this.state.themeMode)) {
			// Expanded card with colored borders
			const pipeSep = t.fg("dim", " \u2502 ");
			const dataParts: string[] = [];
			dataParts.push(
				t.fg("dim", "model:") + t.fg("accent", this.state.currentModel || "?"),
			);
			if (this.state.currentProvider) {
				dataParts.push(
					t.fg("dim", "provider:") + t.fg("muted", this.state.currentProvider),
				);
			}
			dataParts.push(
				t.fg("dim", "thinking:") + t.fg("muted", this.state.thinkingLevel),
			);
			dataParts.push(
				t.fg("dim", "mode:") + t.fg("muted", this.state.modeLabel),
			);
			dataParts.push(
				t.fg("dim", "turns:") + t.fg("muted", String(this.state.turnCount)),
			);

			const cardTitle = cfg.labels.activeContextTitle || "SESSION";
			const bodyLine = dataParts.join(pipeSep);

			lines.push(
				...drawCard(t, cfg, cardTitle, [bodyLine], width, accent, true),
			);
		} else if (width >= 80) {
			// Compact one-line (no longer requires compactMode=true)
			const prefix = cfg.labels.activeContextTitle
				? t.fg(accent, t.bold(getCompactLabel(cfg.labels.activeContextTitle))) +
					" "
				: t.fg("dim", "~ ");
			const parts: string[] = [];
			parts.push(t.fg("accent", this.state.currentModel || "?"));
			if (this.state.currentProvider) {
				parts.push(t.fg("muted", this.state.currentProvider));
			}
			parts.push(t.fg("muted", this.state.thinkingLevel));
			parts.push(t.fg("muted", this.state.modeLabel));
			parts.push(
				t.fg("dim", "turns:") + t.fg("muted", String(this.state.turnCount)),
			);
			lines.push(
				truncateToWidth(
					`${prefix}${parts.join(` ${t.fg("dim", "|")} `)}`,
					width,
				),
			);
		} else {
			// Narrow fallback (< 80 cols)
			let label: string;
			if (cfg.labels.activeContextTitle) {
				label = t.fg(cfg.titleColor, t.bold(cfg.labels.activeContextTitle));
			} else {
				label = t.fg("dim", "~");
			}
			const modelStr = this.state.currentModel
				? ` ${t.fg("accent", this.state.currentModel)}`
				: "";
			const provStr = this.state.currentProvider
				? ` ${t.fg("dim", "@")}${t.fg("muted", this.state.currentProvider)}`
				: "";
			const thinkingStr = ` ${t.fg("dim", "t:")}${t.fg("muted", this.state.thinkingLevel)}`;
			const modeStr = ` ${t.fg("dim", "m:")}${t.fg("muted", this.state.modeLabel)}`;
			const turnStr = ` ${t.fg("dim", "#")}${t.fg("muted", String(this.state.turnCount))}`;
			lines.push(
				truncateToWidth(
					`${label} ${modelStr}${provStr}${thinkingStr}${modeStr}${turnStr}`,
					width,
				),
			);
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

/**
 * Workflow Progress Widget — compact idle/active line.
 * Expanded mode (width >= 100, compact off): renders colored card borders.
 */
class WorkflowProgressWidget {
	private state: BocchiState;
	private theme: Theme;
	private cfg: BocchiThemeConfig;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(state: BocchiState, theme: Theme) {
		this.state = state;
		this.theme = theme;
		this.cfg = getThemeConfig(state.themeMode);
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
		this.cfg = getThemeConfig(this.state.themeMode);
		this.invalidate();
	}

	setThemeMode(mode: ThemeMode): void {
		this.cfg = getThemeConfig(mode);
		this.invalidate();
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const t = this.theme;
		const cfg = this.cfg;
		const lines: string[] = [];
		const accent = getCardAccent(cfg, "setlist");
		const expanded = isExpandedCard(
			width,
			this.state.compactMode,
			this.state.themeMode,
		);

		// Track render dimensions for debugging (pick max width seen)
		if (width > this.state.widgetWidth) {
			this.state.widgetWidth = width;
			this.state.widgetMode = expanded
				? "expanded"
				: width >= 80
					? "compact"
					: "narrow";
		}

		if (expanded) {
			// Expanded card with colored borders
			let bodyLine: string;
			if (this.state.toolExecutionCount > 0 && this.state.workingText) {
				const toolInfo =
					t.fg("dim", "tools:") +
					t.fg("muted", String(this.state.toolExecutionCount));
				const work = t.fg(
					"muted",
					this.state.workingText.slice(0, Math.max(10, width - 50)),
				);
				bodyLine = `${t.fg(accent, "\u25CF")} ${toolInfo} ${t.fg("dim", "\u00B7")} ${work}`;
			} else {
				const idle = t.fg("dim", cfg.labels.idle);
				const tools = t.fg("dim", "tools:") + t.fg("muted", "0");
				const last =
					t.fg("dim", "last:") + t.fg("muted", this.state.lastToolName);
				const wfLabel = cfg.labels.workflowTitle
					? t.fg("dim", cfg.labels.workflowTitle.toLowerCase() + ":")
					: t.fg("dim", "wf:");
				bodyLine = `${wfLabel} ${idle} ${t.fg("dim", "|")} ${tools} ${t.fg("dim", "|")} ${last}`;
			}

			const cardTitle = cfg.labels.workflowTitle || "WORKFLOW";
			lines.push(
				...drawCard(t, cfg, cardTitle, [bodyLine], width, accent, true),
			);
		} else if (width >= 80) {
			// Compact one-line (no leading dot)
			const label = cfg.labels.workflowTitle
				? t.fg(accent, getCompactLabel(cfg.labels.workflowTitle)) + " "
				: "";
			if (this.state.toolExecutionCount > 0 && this.state.workingText) {
				// Active state
				const toolInfo =
					t.fg("dim", "tools:") +
					t.fg("muted", String(this.state.toolExecutionCount));
				const work = t.fg(
					"muted",
					this.state.workingText.slice(0, Math.max(10, width - 40)),
				);
				lines.push(
					truncateToWidth(
						`${label}${t.fg("dim", "running")} ${t.fg("dim", "|")} ${toolInfo} ${t.fg("dim", "\u00B7")} ${work}`,
						width,
					),
				);
			} else {
				// Idle state
				const idle = t.fg("dim", cfg.labels.idle);
				const tools = t.fg("dim", "tools:") + t.fg("muted", "0");
				const last =
					t.fg("dim", "last:") + t.fg("muted", this.state.lastToolName);
				lines.push(
					truncateToWidth(
						`${label}${idle} ${t.fg("dim", "|")} ${tools} ${t.fg("dim", "|")} ${last}`,
						width,
					),
				);
			}
		} else {
			// Narrow fallback (< 80 cols)
			const dot = t.fg(accent, "\u25CB");
			const idle = t.fg("dim", cfg.labels.idle);
			const tools = t.fg("dim", "tools:") + t.fg("muted", "0");
			const last =
				t.fg("dim", "last:") + t.fg("muted", this.state.lastToolName);
			lines.push(
				truncateToWidth(
					` ${dot} ${idle} ${t.fg("dim", "|")} ${tools} ${t.fg("dim", "|")} ${last}`,
					width,
				),
			);
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

// ─── Command Palette Overlay ─────────────────────────────────────────

interface CommandItem {
	id: string;
	label: string;
	description: string;
	action: () => void | Promise<void>;
}

function showCommandPalette(
	tui: { requestRender: () => void },
	theme: Theme,
	done: (result: string | null) => void,
	commands: CommandItem[],
	cfg: BocchiThemeConfig,
): ComponentLike {
	const items: SelectItem[] = commands.map((cmd) => ({
		value: cmd.id,
		label: cmd.label,
		description: cmd.description,
	}));

	const container = new Container();
	const colorKey = cfg.overlayColor;

	container.addChild(new DynamicBorder((s: string) => theme.fg(colorKey, s)));

	const titleText = cfg.labels.commandPaletteTitle || " BOCCHI DECK ";
	container.addChild(new Text(theme.fg(colorKey, theme.bold(titleText)), 1, 0));

	container.addChild(
		new Text(
			theme.fg(
				"dim",
				" Type to search \u2022 \u2191\u2193 navigate \u2022 Enter select \u2022 Esc cancel ",
			),
			1,
			0,
		),
	);

	const selectList = new SelectList(items, Math.min(items.length, 10), {
		selectedPrefix: (t: string) => theme.fg("accent", t),
		selectedText: (t: string) => theme.fg("accent", t),
		description: (t: string) => theme.fg("muted", t),
		scrollInfo: (t: string) => theme.fg("dim", t),
		noMatch: (t: string) => theme.fg("warning", t),
	});

	selectList.onSelect = (item): void => {
		const cmd = commands.find((c) => c.id === item.value);
		if (cmd) cmd.action();
		done(null);
	};
	selectList.onCancel = (): void => done(null);

	container.addChild(selectList);
	container.addChild(new DynamicBorder((s: string) => theme.fg(colorKey, s)));

	return {
		render(width: number): string[] {
			return container.render(width);
		},
		invalidate(): void {
			container.invalidate();
		},
		handleInput(data: string): void {
			selectList.handleInput(data);
			tui.requestRender();
		},
	};
}

// ─── Settings Overlay ─────────────────────────────────────────────────

function showSettingsOverlay(
	tui: { requestRender: () => void },
	theme: Theme,
	done: (result: undefined) => void,
	state: BocchiState,
	onToggle: (id: string, value: string) => void,
	cfg: BocchiThemeConfig,
): ComponentLike {
	const settingsItems: SettingItem[] = [
		{
			id: "compactMode",
			label: "Compact mode",
			currentValue: state.compactMode ? "on" : "off",
			values: ["on", "off"],
		},
		{
			id: "showActiveContext",
			label: "Active Context widget",
			currentValue: state.showActiveContext ? "visible" : "hidden",
			values: ["visible", "hidden"],
		},
		{
			id: "showWorkflowProgress",
			label: "Workflow Progress widget",
			currentValue: state.showWorkflowProgress ? "visible" : "hidden",
			values: ["visible", "hidden"],
		},
		{
			id: "showStatusLabels",
			label: "Footer status labels",
			currentValue: state.showStatusLabels ? "visible" : "hidden",
			values: ["visible", "hidden"],
		},
		{
			id: "showWorkingIndicator",
			label: "Working indicator",
			currentValue: state.showWorkingIndicator ? "visible" : "hidden",
			values: ["visible", "hidden"],
		},
		{
			id: "renderCardsEnabled",
			label: "Render cards",
			currentValue: state.renderCardsEnabled ? "enabled" : "disabled",
			values: ["enabled", "disabled"],
		},
		{
			id: "aliasesEnabled",
			label: "Alias commands (/control, etc.)",
			currentValue: state.aliasesEnabled ? "yes" : "no",
			values: ["yes", "no"],
		},
	];

	const container = new Container();
	const colorKey = cfg.overlayColor;

	container.addChild(new DynamicBorder((s: string) => theme.fg(colorKey, s)));

	const settingsTitle = cfg.labels.settingsTitle || " SETTINGS ";
	container.addChild(
		new Text(theme.fg(colorKey, theme.bold(settingsTitle)), 1, 0),
	);

	const settingsList = new SettingsList(
		settingsItems,
		Math.min(settingsItems.length + 2, 15),
		getSettingsListTheme(),
		(id: string, newValue: string): void => {
			onToggle(id, newValue);
		},
		(): void => {
			done(undefined);
		},
		{ enableSearch: true },
	);

	container.addChild(settingsList);

	container.addChild(
		new Text(
			theme.fg(
				"dim",
				" \u2190 \u2192 or Space toggle \u2022 Enter save & close \u2022 Esc cancel ",
			),
			1,
			0,
		),
	);

	container.addChild(new DynamicBorder((s: string) => theme.fg(colorKey, s)));

	return {
		render(width: number): string[] {
			return container.render(width);
		},
		invalidate(): void {
			container.invalidate();
		},
		handleInput(data: string): void {
			settingsList.handleInput?.(data);
			tui.requestRender();
		},
	};
}

// ─── Confirmation Overlay ────────────────────────────────────────────

interface ConfirmResult {
	confirmed: boolean;
}

function showConfirmationOverlay(
	tui: { requestRender: () => void },
	theme: Theme,
	done: (result: ConfirmResult | null) => void,
	title: string,
	message: string,
	confirmLabel = "Yes",
	cancelLabel = "No",
): ComponentLike {
	const items: SelectItem[] = [
		{ value: "confirm", label: confirmLabel },
		{ value: "cancel", label: cancelLabel },
	];

	const container = new Container();

	container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));
	container.addChild(
		new Text(theme.fg("warning", theme.bold(` ${title} `)), 1, 0),
	);

	const msgLines = wrapTextWithAnsi(message, 60);
	for (const line of msgLines) {
		container.addChild(new Text(theme.fg("text", ` ${line}`), 0, 0));
	}
	container.addChild(new Spacer(1));

	const selectList = new SelectList(items, items.length, {
		selectedPrefix: (t: string) => theme.fg("accent", t),
		selectedText: (t: string) => theme.fg("accent", t),
		description: (t: string) => theme.fg("muted", t),
	});

	selectList.onSelect = (item): void => {
		done({ confirmed: item.value === "confirm" });
	};
	selectList.onCancel = (): void => done(null);

	container.addChild(selectList);
	container.addChild(
		new Text(
			theme.fg(
				"dim",
				" \u2191\u2193 navigate \u2022 Enter confirm \u2022 Esc cancel ",
			),
			1,
			0,
		),
	);
	container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));

	return {
		render(width: number): string[] {
			return container.render(width);
		},
		invalidate(): void {
			container.invalidate();
		},
		handleInput(data: string): void {
			selectList.handleInput(data);
			tui.requestRender();
		},
	};
}

// ─── Component-like interface ────────────────────────────────────────

interface ComponentLike {
	render(width: number): string[];
	invalidate(): void;
	handleInput?(data: string): void;
}

// ─── Extension Main ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
	const state: BocchiState = { ...DEFAULT_STATE };

	let activeContextWidget: ActiveContextWidget | null = null;
	let workflowProgressWidget: WorkflowProgressWidget | null = null;

	function applyThemeMode(ctx: {
		ui: {
			theme: Theme;
			setWidget: (id: string, widget: unknown, options?: unknown) => void;
			setStatus: (id: string, text: string | undefined) => void;
		};
	}): void {
		if (activeContextWidget) activeContextWidget.setThemeMode(state.themeMode);
		if (workflowProgressWidget)
			workflowProgressWidget.setThemeMode(state.themeMode);
		refreshUI(ctx);
	}

	// ─── Widget Management ───────────────────────────────────────────

	function updateActiveContextWidget(ctx: {
		ui: {
			theme: Theme;
			setWidget: (id: string, widget: unknown, options?: unknown) => void;
		};
	}): void {
		if (!state.showActiveContext) {
			ctx.ui.setWidget("bocchi-active-context", undefined);
			activeContextWidget = null;
			return;
		}
		const theme = ctx.ui.theme;
		activeContextWidget = new ActiveContextWidget(state, theme);
		ctx.ui.setWidget("bocchi-active-context", (_tui: unknown, t: Theme) => {
			if (activeContextWidget) activeContextWidget.setTheme(t);
			return activeContextWidget ?? new ActiveContextWidget(state, t);
		});
	}

	function updateWorkflowProgressWidget(ctx: {
		ui: {
			theme: Theme;
			setWidget: (id: string, widget: unknown, options?: unknown) => void;
		};
	}): void {
		if (!state.showWorkflowProgress) {
			ctx.ui.setWidget("bocchi-workflow", undefined);
			workflowProgressWidget = null;
			return;
		}
		const theme = ctx.ui.theme;
		workflowProgressWidget = new WorkflowProgressWidget(state, theme);
		ctx.ui.setWidget("bocchi-workflow", (_tui: unknown, t: Theme) => {
			if (workflowProgressWidget) workflowProgressWidget.setTheme(t);
			return workflowProgressWidget ?? new WorkflowProgressWidget(state, t);
		});
	}

	function updateStatusLabels(ctx: {
		ui: {
			theme: Theme;
			setStatus: (id: string, text: string | undefined) => void;
		};
	}): void {
		const t = ctx.ui.theme;
		const cfg = getThemeConfig(state.themeMode);

		if (state.showStatusLabels) {
			ctx.ui.setStatus(
				"bocchi-mode",
				t.fg("muted", "mode:") + t.fg("accent", state.modeLabel),
			);

			const toolsStatus =
				state.toolExecutionCount > 0
					? t.fg("accent", cfg.labels.running) +
						"(" +
						t.fg("muted", String(state.toolExecutionCount)) +
						")"
					: t.fg("dim", cfg.labels.idle);
			ctx.ui.setStatus("bocchi-tools", t.fg("dim", "tools:") + toolsStatus);

			const deckLabel =
				"bocchi:" +
				(state.showActiveContext ? t.fg("success", "on") : t.fg("dim", "off"));
			const themeLabel = "theme:" + t.fg(cfg.titleColor, state.themeMode);
			ctx.ui.setStatus(
				"bocchi-budget",
				t.fg("dim", deckLabel + " " + themeLabel),
			);
		} else {
			ctx.ui.setStatus("bocchi-mode", undefined);
			ctx.ui.setStatus("bocchi-budget", undefined);
			ctx.ui.setStatus("bocchi-tools", undefined);
		}
	}

	function refreshUI(ctx: {
		ui: {
			theme: Theme;
			setWidget: (id: string, widget: unknown, options?: unknown) => void;
			setStatus: (id: string, text: string | undefined) => void;
		};
	}): void {
		updateActiveContextWidget(ctx);
		updateWorkflowProgressWidget(ctx);
		updateStatusLabels(ctx);
	}

	// ─── Working Indicator ───────────────────────────────────────────

	function updateWorkingIndicator(ctx: {
		ui: { theme: Theme; setWorkingIndicator: (options?: unknown) => void };
	}): void {
		const t = ctx.ui.theme;

		if (state.showWorkingIndicator) {
			if (
				state.themeMode === "retro-rock" ||
				state.themeMode === "mono-stage"
			) {
				ctx.ui.setWorkingIndicator({
					frames: [
						t.fg("accent", "\u266A"),
						t.fg("muted", "\u2669"),
						t.fg("accent", "\u266B"),
						t.fg("muted", "\u266C"),
					],
					intervalMs: 180,
				});
			} else {
				ctx.ui.setWorkingIndicator({
					frames: [
						t.fg("dim", "\u25CB"),
						t.fg("muted", "\u25D4"),
						t.fg("accent", "\u25CF"),
						t.fg("muted", "\u25D5"),
					],
					intervalMs: 150,
				});
			}
		} else {
			ctx.ui.setWorkingIndicator({ frames: [] });
		}
	}

	const retroRockMessages = [
		"recording...",
		"checking the setlist...",
		"tuning session...",
		"running riff...",
	];

	function getWorkingMessage(): string {
		if (state.themeMode === "retro-rock") {
			return retroRockMessages[state.turnCount % retroRockMessages.length];
		}
		return `turn ${state.turnCount}...`;
	}

	// ─── Command Palette ─────────────────────────────────────────────

	function buildCommandList(ctx: {
		ui: Record<string, unknown>;
	}): CommandItem[] {
		return [
			{
				id: "bocchi-theme",
				label: "Theme",
				description:
					"Switch visual theme (retro-rock, mono-stage, tokyo-night, minimal)",
				action: () => {
					(ctx.ui as any).notify("Use /bocchi-theme to switch themes", "info");
				},
			},
			{
				id: "bocchi-settings",
				label: "Settings",
				description: "Open Bocchi Deck settings",
				action: () => {
					(ctx.ui as any).notify(
						"Use /bocchi-settings to adjust settings",
						"info",
					);
				},
			},
			{
				id: "bocchi-status",
				label: "Status",
				description: "Show Bocchi Deck status summary",
				action: () => {
					(ctx.ui as any).notify("Use /bocchi-status to view status", "info");
				},
			},
			{
				id: "bocchi-clear",
				label: "Clear UI",
				description: "Remove all Bocchi Deck widgets and status labels",
				action: () => {
					(ctx.ui as any).setWidget("bocchi-active-context", undefined);
					(ctx.ui as any).setWidget("bocchi-workflow", undefined);
					(ctx.ui as any).setStatus("bocchi-mode", undefined);
					(ctx.ui as any).setStatus("bocchi-budget", undefined);
					(ctx.ui as any).setStatus("bocchi-tools", undefined);
					state.showActiveContext = false;
					state.showWorkflowProgress = false;
					state.showStatusLabels = false;
					(ctx.ui as any).notify(
						"Bocchi Deck UI cleared. Use /bocchi > Reset UI to restore.",
						"info",
					);
				},
			},
			{
				id: "reset-ui",
				label: "Reset UI",
				description: "Restore all Bocchi Deck widgets and status labels",
				action: () => {
					state.showActiveContext = true;
					state.showWorkflowProgress = true;
					state.showStatusLabels = true;
					refreshUI(ctx as any);
					(ctx.ui as any).notify("Bocchi Deck UI restored", "info");
				},
			},
			{
				id: "toggle-compact",
				label: "Toggle compact mode",
				description: "Switch between compact and detailed widgets",
				action: () => {
					state.compactMode = !state.compactMode;
					refreshUI(ctx as any);
					(ctx.ui as any).notify(
						`Compact mode: ${state.compactMode ? "on" : "off"}`,
						"info",
					);
				},
			},
			{
				id: "clear-editor",
				label: "Clear Editor",
				description: "Clear the input editor",
				action: () => {
					(ctx.ui as any).setEditorText("");
					(ctx.ui as any).notify("Editor cleared", "info");
				},
			},
			{
				id: "show-context",
				label: "Show Active Context",
				description: "Show/refresh Active Context widget",
				action: () => {
					state.showActiveContext = true;
					updateActiveContextWidget(ctx as any);
					(ctx.ui as any).notify("Active Context widget shown", "info");
				},
			},
			{
				id: "show-workflow",
				label: "Show Workflow",
				description: "Show/refresh Workflow Progress widget",
				action: () => {
					state.showWorkflowProgress = true;
					updateWorkflowProgressWidget(ctx as any);
					(ctx.ui as any).notify("Workflow Progress widget shown", "info");
				},
			},
		];
	}

	async function openCommandPalette(ctx: any): Promise<void> {
		if (!ctx.hasUI) return;
		const cfg = getThemeConfig(state.themeMode);
		const commands = buildCommandList(ctx);

		await ctx.ui.custom<string | null>(
			(
				tui: { requestRender: () => void },
				theme: Theme,
				_kb: unknown,
				done: (r: string | null) => void,
			) => showCommandPalette(tui, theme, done, commands, cfg),
			{
				overlay: true,
				overlayOptions: {
					width: "60%",
					minWidth: 50,
					maxHeight: "70%",
					anchor: "center",
				},
			},
		);
	}

	// ─── Commands: Bocchi Deck (primary) ─────────────────────────────

	pi.registerCommand("bocchi", {
		description: "Open Bocchi Deck command palette",
		handler: async (_args: any, ctx: any) => {
			await openCommandPalette(ctx);
		},
	});

	pi.registerCommand("bocchi-settings", {
		description: "Open Bocchi Deck settings overlay",
		handler: async (_args: any, ctx: any) => {
			if (!ctx.hasUI) return;
			const cfg = getThemeConfig(state.themeMode);

			await ctx.ui.custom<undefined>(
				(
					tui: { requestRender: () => void },
					theme: Theme,
					_kb: unknown,
					done: (r: undefined) => void,
				) => showSettingsOverlay(tui, theme, done, state, onToggle, cfg),
				{
					overlay: true,
					overlayOptions: {
						width: "60%",
						minWidth: 50,
						maxHeight: "70%",
						anchor: "center",
					},
				},
			);

			function onToggle(id: string, newValue: string): void {
				switch (id) {
					case "compactMode":
						state.compactMode = newValue === "on";
						refreshUI(ctx);
						break;
					case "showActiveContext":
						state.showActiveContext = newValue === "visible";
						updateActiveContextWidget(ctx);
						break;
					case "showWorkflowProgress":
						state.showWorkflowProgress = newValue === "visible";
						updateWorkflowProgressWidget(ctx);
						break;
					case "showStatusLabels":
						state.showStatusLabels = newValue === "visible";
						updateStatusLabels(ctx);
						break;
					case "showWorkingIndicator":
						state.showWorkingIndicator = newValue === "visible";
						updateWorkingIndicator(ctx);
						break;
					case "renderCardsEnabled":
						state.renderCardsEnabled = newValue === "enabled";
						break;
					case "aliasesEnabled":
						state.aliasesEnabled = newValue === "yes";
						break;
				}
			}
		},
	});

	pi.registerCommand("bocchi-theme", {
		description:
			"Switch visual theme (retro-rock, mono-stage, tokyo-night, minimal)",
		handler: async (args: any, ctx: any) => {
			if (!ctx.hasUI) return;

			const trimmed = (args ?? "").trim().toLowerCase();
			const validThemes: ThemeMode[] = [
				"retro-rock",
				"mono-stage",
				"tokyo-night",
				"minimal",
			];

			if (trimmed && validThemes.includes(trimmed as ThemeMode)) {
				state.themeMode = trimmed as ThemeMode;
				applyThemeMode(ctx);
				updateWorkingIndicator(ctx);
				ctx.ui.notify(`Bocchi Deck theme: ${state.themeMode}`, "info");
				return;
			}

			const items: SelectItem[] = [
				{
					value: "retro-rock",
					label: "Retro Rock",
					description: "Music-themed labels, rounded borders",
				},
				{
					value: "mono-stage",
					label: "Mono Stage",
					description: "Monochromatic stage theme",
				},
				{
					value: "tokyo-night",
					label: "Tokyo Night",
					description: "Vibrant dark theme",
				},
				{
					value: "minimal",
					label: "Minimal",
					description: "Bare-bones, no extra labels",
				},
			];

			const cfg = getThemeConfig(state.themeMode);
			const result = await ctx.ui.custom<string | null>(
				(
					tui: { requestRender: () => void },
					theme: Theme,
					_kb: unknown,
					done: (r: string | null) => void,
				) => {
					const container = new Container();
					const colorKey = cfg.overlayColor;

					container.addChild(
						new DynamicBorder((s: string) => theme.fg(colorKey, s)),
					);

					const themeTitle = cfg.labels.settingsTitle
						? ` ${cfg.labels.settingsTitle} \u2014 THEME `
						: " SELECT THEME ";
					container.addChild(
						new Text(theme.fg(colorKey, theme.bold(themeTitle)), 1, 0),
					);
					container.addChild(
						new Text(
							theme.fg(
								"dim",
								" \u2191\u2193 navigate \u2022 Enter select \u2022 Esc cancel ",
							),
							1,
							0,
						),
					);

					const selectList = new SelectList(items, items.length, {
						selectedPrefix: (t: string) => theme.fg("accent", t),
						selectedText: (t: string) => theme.fg("accent", t),
						description: (t: string) => theme.fg("muted", t),
					});

					selectList.onSelect = (item: any): void => done(item.value);
					selectList.onCancel = (): void => done(null);

					container.addChild(selectList);
					container.addChild(
						new DynamicBorder((s: string) => theme.fg(colorKey, s)),
					);

					return {
						render(w: number): string[] {
							return container.render(w);
						},
						invalidate(): void {
							container.invalidate();
						},
						handleInput(data: string): void {
							selectList.handleInput(data);
							tui.requestRender();
						},
					};
				},
				{
					overlay: true,
					overlayOptions: {
						width: "50%",
						minWidth: 40,
						maxHeight: "50%",
						anchor: "center",
					},
				},
			);

			if (result && validThemes.includes(result as ThemeMode)) {
				state.themeMode = result as ThemeMode;
				applyThemeMode(ctx);
				updateWorkingIndicator(ctx);
				ctx.ui.notify(`Bocchi Deck theme: ${state.themeMode}`, "info");
			}
		},
	});

	pi.registerCommand("bocchi-status", {
		description: "Show Bocchi Deck status summary",
		handler: async (_args: any, ctx: any) => {
			const t = ctx.ui.theme;
			const cfg = getThemeConfig(state.themeMode);
			const colorKey = cfg.overlayColor;

			const statusLines: string[] = [];
			statusLines.push(
				t.fg(
					colorKey,
					t.bold(
						`\u250C\u2500 ${cfg.labels.statusTitle || "BOCCHI STATUS"} \u2500\u2510`,
					),
				),
			);
			statusLines.push(
				` ${t.fg("dim", "extension:")} ${t.fg("accent", "Bocchi Deck")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "theme:")} ${t.fg(colorKey, state.themeMode)}`,
			);
			statusLines.push(
				` ${t.fg("dim", "compact:")} ${state.compactMode ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "widgets:")} ${state.showActiveContext ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "renderCards:")} ${state.renderCardsEnabled ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "aliases:")} ${state.aliasesEnabled ? t.fg("success", "yes") : t.fg("dim", "no")}`,
			);
			statusLines.push("");
			statusLines.push(
				` ${t.fg("dim", "Mode:")} ${t.fg("accent", state.modeLabel)}`,
			);
			statusLines.push(
				` ${t.fg("dim", "Tool count:")} ${t.fg("muted", String(state.toolExecutionCount))}`,
			);
			statusLines.push(
				` ${t.fg("dim", "Last tool:")} ${t.fg("muted", state.lastToolName)}`,
			);
			statusLines.push(
				` ${t.fg("dim", "Last action:")} ${t.fg("muted", state.lastToolAction)}`,
			);
			statusLines.push(
				` ${t.fg("dim", "Turns:")} ${t.fg("muted", String(state.turnCount))}`,
			);
			statusLines.push("");
			statusLines.push(
				` ${t.fg("dim", "Widget width:")} ${t.fg("accent", String(state.widgetWidth))}px`,
			);
			statusLines.push(
				` ${t.fg("dim", "Widget mode:")} ${t.fg("accent", state.widgetMode)}`,
			);
			statusLines.push(
				` ${t.fg("dim", "Compact setting:")} ${state.compactMode ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "Expanded eligible:")} ${isExpandedCard(state.widgetWidth, state.compactMode, state.themeMode) ? t.fg("success", "yes") : t.fg("dim", "no")}`,
			);
			statusLines.push(
				t.fg(colorKey, t.bold("\u2514\u2500".repeat(14) + "\u2518")),
			);

			if (ctx.hasUI) {
				await ctx.ui.custom<void>(
					(_tui: any, _theme: any, _kb: unknown, done: (r: void) => void) => ({
						render(_w: number): string[] {
							return statusLines.slice();
						},
						invalidate(): void {},
						handleInput(_data: string): void {
							done();
						},
					}),
				);
			} else {
				for (const line of statusLines) {
					ctx.ui.notify(line, "info");
				}
			}
		},
	});

	pi.registerCommand("bocchi-clear", {
		description: "Remove all Bocchi Deck widgets and status labels",
		handler: async (_args: any, ctx: any) => {
			ctx.ui.setWidget("bocchi-active-context", undefined);
			ctx.ui.setWidget("bocchi-workflow", undefined);
			ctx.ui.setStatus("bocchi-mode", undefined);
			ctx.ui.setStatus("bocchi-budget", undefined);
			ctx.ui.setStatus("bocchi-tools", undefined);
			state.showActiveContext = false;
			state.showWorkflowProgress = false;
			state.showStatusLabels = false;
			ctx.ui.notify(
				"Bocchi Deck UI cleared. Use /bocchi > Reset UI to restore.",
				"info",
			);
		},
	});

	// ─── Alias Commands (preserved) ──────────────────────────────────

	pi.registerCommand("control", {
		description: "[alias] Open Bocchi Deck command palette",
		handler: async (_args: any, ctx: any) => {
			if (state.aliasesEnabled) await openCommandPalette(ctx);
		},
	});

	pi.registerCommand("deck", {
		description: "[alias] Open Bocchi Deck command palette",
		handler: async (_args: any, ctx: any) => {
			if (state.aliasesEnabled) await openCommandPalette(ctx);
		},
	});

	pi.registerCommand("deck-settings", {
		description: "[alias] Open Bocchi Deck settings overlay",
		handler: async (_args: any, ctx: any) => {
			if (!state.aliasesEnabled || !ctx.hasUI) return;
			const cfg = getThemeConfig(state.themeMode);
			await ctx.ui.custom<undefined>(
				(tui: any, theme: Theme, _kb: unknown, done: (r: undefined) => void) =>
					showSettingsOverlay(tui, theme, done, state, onToggle, cfg),
				{
					overlay: true,
					overlayOptions: {
						width: "60%",
						minWidth: 50,
						maxHeight: "70%",
						anchor: "center",
					},
				},
			);
			function onToggle(id: string, newValue: string): void {
				switch (id) {
					case "compactMode":
						state.compactMode = newValue === "on";
						refreshUI(ctx);
						break;
					case "showActiveContext":
						state.showActiveContext = newValue === "visible";
						updateActiveContextWidget(ctx);
						break;
					case "showWorkflowProgress":
						state.showWorkflowProgress = newValue === "visible";
						updateWorkflowProgressWidget(ctx);
						break;
					case "showStatusLabels":
						state.showStatusLabels = newValue === "visible";
						updateStatusLabels(ctx);
						break;
					case "showWorkingIndicator":
						state.showWorkingIndicator = newValue === "visible";
						updateWorkingIndicator(ctx);
						break;
					case "renderCardsEnabled":
						state.renderCardsEnabled = newValue === "enabled";
						break;
					case "aliasesEnabled":
						state.aliasesEnabled = newValue === "yes";
						break;
				}
			}
		},
	});

	pi.registerCommand("deck-theme", {
		description: "[alias] Switch Bocchi Deck theme",
		handler: async (args: any, ctx: any) => {
			if (!state.aliasesEnabled || !ctx.hasUI) return;
			const trimmed = (args ?? "").trim().toLowerCase();
			const validThemes: ThemeMode[] = [
				"retro-rock",
				"mono-stage",
				"tokyo-night",
				"minimal",
			];
			if (trimmed && validThemes.includes(trimmed as ThemeMode)) {
				state.themeMode = trimmed as ThemeMode;
				applyThemeMode(ctx);
				updateWorkingIndicator(ctx);
				ctx.ui.notify(`Bocchi Deck theme: ${state.themeMode}`, "info");
				return;
			}
		},
	});

	pi.registerCommand("deck-status", {
		description: "[alias] Show Bocchi Deck status",
		handler: async (_args: any, ctx: any) => {
			if (!state.aliasesEnabled) return;
			const t = ctx.ui.theme;
			const cfg = getThemeConfig(state.themeMode);
			const colorKey = cfg.overlayColor;
			const statusLines: string[] = [];
			statusLines.push(t.fg(colorKey, t.bold(` Bocchi Deck Status `)));
			statusLines.push(
				` ${t.fg("dim", "theme:")} ${t.fg(colorKey, state.themeMode)}`,
			);
			statusLines.push(
				` ${t.fg("dim", "compact:")} ${state.compactMode ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "widgets:")} ${state.showActiveContext ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "renderCards:")} ${state.renderCardsEnabled ? t.fg("success", "on") : t.fg("dim", "off")}`,
			);
			statusLines.push(
				` ${t.fg("dim", "aliases:")} ${state.aliasesEnabled ? t.fg("success", "yes") : t.fg("dim", "no")}`,
			);
			if (ctx.hasUI) {
				await ctx.ui.custom<void>(
					(_tui: any, _theme: any, _kb: unknown, done: (r: void) => void) => ({
						render(_w: number): string[] {
							return statusLines.slice();
						},
						invalidate(): void {},
						handleInput(_data: string): void {
							done();
						},
					}),
				);
			}
		},
	});

	pi.registerCommand("clear-ui", {
		description: "[alias] Remove all Bocchi Deck widgets and status labels",
		handler: async (_args: any, ctx: any) => {
			if (!state.aliasesEnabled) return;
			ctx.ui.setWidget("bocchi-active-context", undefined);
			ctx.ui.setWidget("bocchi-workflow", undefined);
			ctx.ui.setStatus("bocchi-mode", undefined);
			ctx.ui.setStatus("bocchi-budget", undefined);
			ctx.ui.setStatus("bocchi-tools", undefined);
			state.showActiveContext = false;
			state.showWorkflowProgress = false;
			state.showStatusLabels = false;
			ctx.ui.notify("Bocchi Deck UI cleared.", "info");
		},
	});

	// ─── Phase 3: Overlays (unchanged) ────────────────────────────────

	pi.registerCommand("confirm", {
		description: "Show a confirmation dialog",
		handler: async (_args: any, ctx: any) => {
			if (!ctx.hasUI) return;
			const cfg = getThemeConfig(state.themeMode);
			const confirmTitle = cfg.labels.confirmTitle || "CONFIRM";

			const result = await ctx.ui.custom<{ confirmed: boolean } | null>(
				(
					tui: any,
					theme: Theme,
					_kb: unknown,
					done: (r: { confirmed: boolean } | null) => void,
				) =>
					showConfirmationOverlay(
						tui,
						theme,
						done,
						confirmTitle,
						"Are you sure you want to perform this action?",
						"Proceed",
						"Cancel",
					),
				{
					overlay: true,
					overlayOptions: {
						width: "50%",
						minWidth: 40,
						maxHeight: "50%",
						anchor: "center",
					},
				},
			);

			if (result?.confirmed) {
				ctx.ui.notify("Action confirmed \u2713", "info");
			} else {
				ctx.ui.notify("Action cancelled", "info");
			}
		},
	});

	pi.registerCommand("danger", {
		description: "Run a command with confirmation overlay",
		handler: async (_args: any, ctx: any) => {
			if (!ctx.hasUI) return;
			const cfg = getThemeConfig(state.themeMode);
			const warnTitle = cfg.labels.warningTitle || "WARNING";

			const confirmed = await ctx.ui.custom<{ confirmed: boolean } | null>(
				(
					tui: any,
					theme: Theme,
					_kb: unknown,
					done: (r: { confirmed: boolean } | null) => void,
				) =>
					showConfirmationOverlay(
						tui,
						theme,
						done,
						`\u26A0 ${warnTitle}`,
						"This could modify or delete files.\nAre you absolutely sure you want to proceed?",
						"Yes, proceed",
						"Abort",
					),
				{
					overlay: true,
					overlayOptions: {
						width: "50%",
						minWidth: 40,
						maxHeight: "50%",
						anchor: "center",
					},
				},
			);

			if (confirmed?.confirmed) {
				ctx.ui.notify("Proceeding with dangerous operation...", "warning");
			} else {
				ctx.ui.notify("Operation aborted", "info");
			}
		},
	});

	pi.registerCommand("fetch", {
		description: "Simulate a long-running operation with BorderedLoader",
		handler: async (_args: any, ctx: any) => {
			if (!ctx.hasUI) return;
			const cfg = getThemeConfig(state.themeMode);
			const loadingText = `${cfg.labels.loadingTitle || "WORKING"}... (Esc to cancel)`;

			const result = await ctx.ui.custom<string | null>(
				(
					tui: any,
					theme: Theme,
					_kb: unknown,
					done: (r: string | null) => void,
				) => {
					const loader = new BorderedLoader(tui, theme, loadingText);
					loader.onAbort = () => done(null);

					const doWork = async (): Promise<void> => {
						await new Promise<void>((resolve) => {
							const interval = setInterval(() => {
								if (loader.signal.aborted) {
									clearInterval(interval);
									resolve();
									return;
								}
							}, 100);
							setTimeout(() => {
								clearInterval(interval);
								resolve();
							}, 3000);
						});
						if (!loader.signal.aborted) done("Work completed successfully!");
					};
					doWork().catch(() => done(null));
					return loader;
				},
			);

			if (result === null) {
				ctx.ui.notify("Operation cancelled", "info");
			} else {
				ctx.ui.notify(result, "info");
			}
		},
	});

	// ─── Event Handlers ──────────────────────────────────────────────

	pi.on("session_start", async (_event: any, ctx: any) => {
		state.turnCount = 0;
		state.toolExecutionCount = 0;
		state.toolExecutionLabel = "";
		state.workingText = "";
		state.lastToolName = "none";
		state.lastToolAction = "none";
		if (ctx.model) {
			state.currentModel = ctx.model.id;
			state.currentProvider = ctx.model.provider;
		}
		state.thinkingLevel = pi.getThinkingLevel();
		refreshUI(ctx);
		updateWorkingIndicator(ctx);
	});

	pi.on("model_select", async (event: any, ctx: any) => {
		state.currentModel = event.model.id;
		state.currentProvider = event.model.provider;
		refreshUI(ctx);
	});

	pi.on("thinking_level_select", async (event: any, ctx: any) => {
		state.thinkingLevel = event.level;
		refreshUI(ctx);
	});

	pi.on("turn_start", async (_event: any, ctx: any) => {
		state.turnCount++;
		state.workingText = getWorkingMessage();
		refreshUI(ctx);
	});

	pi.on("turn_end", async (_event: any, ctx: any) => {
		state.workingText = "";
		refreshUI(ctx);
	});

	pi.on("tool_execution_start", async (event: any, ctx: any) => {
		state.toolExecutionCount++;
		state.lastToolName = event.toolName;
		const argsStr = JSON.stringify(event.args).slice(0, 40);
		state.lastToolAction = `${event.toolName} ${argsStr}${JSON.stringify(event.args).length > 40 ? "..." : ""}`;
		state.toolExecutionLabel = state.lastToolAction;
		state.workingText = state.lastToolAction;
		refreshUI(ctx);
	});

	pi.on("tool_execution_end", async (event: any, ctx: any) => {
		state.toolExecutionLabel = "";
		state.workingText = "";
		if (event.isError) state.modeLabel = "error";
		refreshUI(ctx);
	});

	pi.on("tool_call", async (event: any, ctx: any) => {
		state.modeLabel = event.toolName;
		refreshUI(ctx);
	});

	pi.on("before_agent_start", async (_event: any, ctx: any) => {
		state.modeLabel = "thinking";
		state.workingText = getWorkingMessage();
		refreshUI(ctx);
	});

	pi.on("agent_end", async (_event: any, ctx: any) => {
		state.modeLabel = "normal";
		state.workingText = "";
		state.toolExecutionCount = 0;
		refreshUI(ctx);
	});

	// ─── Phase 2: Cards ──────────────────────────────────────────────

	pi.registerTool({
		name: "bocchi_status",
		label: "Bocchi Status",
		description: "Show status information via Bocchi Deck",
		promptSnippet: "Show status info via Bocchi Deck",
		promptGuidelines: [
			"Use bocchi_status to display formatted status information in the UI.",
		],
		parameters: Type.Object({
			title: Type.String({ description: "Status title" }),
			message: Type.String({ description: "Status message content" }),
			status: Type.Optional(
				StringEnum(["info", "success", "warning", "error"], {
					description: "Status level",
				}),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { title: string; message: string; status?: string },
		): Promise<any> {
			return {
				content: [
					{
						type: "text",
						text: `[${params.status ?? "info"}] ${params.title}: ${params.message}`,
					},
				],
				details: {
					title: params.title,
					message: params.message,
					status: params.status ?? "info",
				},
			};
		},

		renderCall(args: any, theme: Theme): ComponentLike {
			const cfg = getThemeConfig(state.themeMode);
			const statusIcon =
				args.status === "error"
					? "\u2717"
					: args.status === "warning"
						? "\u26A0"
						: args.status === "success"
							? "\u2713"
							: "\u2139";
			const statusColor =
				args.status === "error"
					? "error"
					: args.status === "warning"
						? "warning"
						: args.status === "success"
							? "success"
							: "accent";

			if (cfg.labels.toolCallTitle) {
				const cardLines = drawCard(
					theme,
					cfg,
					`${statusIcon} ${cfg.labels.toolCallTitle}`,
					[
						`${theme.fg("dim", "title:")}  ${theme.fg("accent", args.title)}`,
						`${theme.fg("dim", "message:")} ${theme.fg("muted", args.message?.slice(0, 40))}`,
					],
					80,
					statusColor,
				);
				return new ContainerFromLines(cardLines);
			}
			return new Text(
				`${theme.fg(statusColor, statusIcon)} ${theme.fg("toolTitle", args.title)}`,
				1,
				0,
			);
		},

		renderResult(result: any, _options: any, theme: Theme): ComponentLike {
			const cfg = getThemeConfig(state.themeMode);
			const details = result.details ?? {};
			const title = details.title ?? "";
			const message = details.message ?? "";
			const status = details.status ?? "info";
			const statusIcon =
				status === "error"
					? "\u2717"
					: status === "warning"
						? "\u26A0"
						: status === "success"
							? "\u2713"
							: "\u2139";
			const statusColor =
				status === "error"
					? "error"
					: status === "warning"
						? "warning"
						: status === "success"
							? "success"
							: "accent";

			const resultLabel = cfg.labels.resultTitle || "RESULT";
			const bodyLines: string[] = [];
			const msgWrapped = wrapTextWithAnsi(message, 60);
			for (const line of msgWrapped) {
				bodyLines.push(`${theme.fg("text", line)}`);
			}

			const cardLines = drawCard(
				theme,
				cfg,
				`${statusIcon} ${resultLabel}: ${title}`,
				bodyLines,
				80,
				statusColor,
			);
			return new ContainerFromLines(cardLines);
		},
	});

	pi.registerTool({
		name: "bocchi_error",
		label: "Bocchi Error",
		description: "Display a formatted error message in the Bocchi Deck UI",
		promptSnippet: "Show error via Bocchi Deck",
		promptGuidelines: [
			"Use bocchi_error to display formatted error messages when things go wrong.",
		],
		parameters: Type.Object({
			errorType: Type.String({ description: "Type/category of the error" }),
			errorMessage: Type.String({
				description: "The error message to display",
			}),
			suggestion: Type.Optional(
				Type.String({
					description: "Optional suggestion for fixing the error",
				}),
			),
		}),

		async execute(_toolCallId: string, params: any): Promise<any> {
			let text = `[ERROR:${params.errorType}] ${params.errorMessage}`;
			if (params.suggestion) text += `\nSuggestion: ${params.suggestion}`;
			return { content: [{ type: "text", text }], details: { ...params } };
		},

		renderCall(args: any, theme: Theme): ComponentLike {
			const cfg = getThemeConfig(state.themeMode);
			const errorLabel = cfg.labels.errorTitle || "ERROR";

			if (cfg.labels.errorTitle) {
				const cardLines = drawCard(
					theme,
					cfg,
					`\u2717 ${errorLabel}`,
					[`${theme.fg("error", args.errorType)}`],
					80,
					"error",
				);
				return new ContainerFromLines(cardLines);
			}
			return new Text(
				`${theme.fg("error", "\u2717")} ${theme.fg("toolTitle", errorLabel)} ${theme.fg("muted", args.errorType)}`,
				1,
				0,
			);
		},

		renderResult(result: any, _options: any, theme: Theme): ComponentLike {
			const cfg = getThemeConfig(state.themeMode);
			const details = result.details ?? {};
			const errorType = details.errorType ?? "Unknown";
			const errorMessage = details.errorMessage ?? "";
			const suggestion = details.suggestion;
			const errorLabel = cfg.labels.errorTitle || "ERROR";

			const bodyLines: string[] = [];
			bodyLines.push(`${theme.fg("error", errorType)}`);
			const msgWrapped = wrapTextWithAnsi(errorMessage, 60);
			for (const line of msgWrapped) {
				bodyLines.push(` ${theme.fg("error", line)}`);
			}
			if (suggestion) {
				bodyLines.push("");
				bodyLines.push(` \uD83D\uDCA1 ${theme.fg("accent", suggestion)}`);
			}

			const cardLines = drawCard(
				theme,
				cfg,
				`\u2717 ${errorLabel}`,
				bodyLines,
				80,
				"error",
			);
			return new ContainerFromLines(cardLines);
		},
	});

	pi.registerTool({
		name: "bocchi_work",
		label: "Bocchi Work",
		description: "Show a working/loading indicator message in Bocchi Deck",
		promptSnippet: "Show work progress via Bocchi Deck",
		promptGuidelines: [
			"Use bocchi_work to show progress messages for ongoing operations.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "Description of the work being done" }),
			progress: Type.Optional(
				Type.String({ description: "Progress information" }),
			),
		}),

		async execute(_toolCallId: string, params: any): Promise<any> {
			const text = params.progress
				? `[working] ${params.task} (${params.progress})`
				: `[working] ${params.task}`;
			return { content: [{ type: "text", text }], details: { ...params } };
		},

		renderCall(args: any, theme: Theme): ComponentLike {
			return new Text(
				`${theme.fg("accent", "\u25CF")} ${theme.fg("toolTitle", "bocchi_work")} ${theme.fg("muted", args.task)}`,
				1,
				0,
			);
		},

		renderResult(result: any, _options: any, theme: Theme): ComponentLike {
			const cfg = getThemeConfig(state.themeMode);
			const details = result.details ?? {};
			const task = details.task ?? "";
			const progress = details.progress;

			const bodyLines: string[] = [];
			const frame = theme.fg("accent", "\u25CF");
			const taskText = progress
				? `${theme.fg("dim", task)} ${theme.fg("muted", `(${progress})`)}`
				: theme.fg("dim", task);
			bodyLines.push(`${frame} ${taskText}`);

			const cardLines = drawCard(
				theme,
				cfg,
				cfg.labels.loadingTitle || "WORKING",
				bodyLines,
				80,
			);
			return new ContainerFromLines(cardLines);
		},
	});

	pi.registerTool({
		name: "bocchi_confirm",
		label: "Bocchi Confirm",
		description:
			"Request user confirmation before performing a dangerous operation",
		promptSnippet: "Request user confirmation for risky operations",
		promptGuidelines: [
			"Use bocchi_confirm BEFORE performing dangerous operations like rm -rf, mass deletions, or destructive writes.",
		],
		parameters: Type.Object({
			title: Type.String({
				description: "Brief title for the confirmation dialog",
			}),
			description: Type.String({
				description:
					"Detailed description of the operation and its consequences",
			}),
			confirmLabel: Type.Optional(
				Type.String({
					description: "Label for the confirm button (default: 'Proceed')",
				}),
			),
			cancelLabel: Type.Optional(
				Type.String({
					description: "Label for the cancel button (default: 'Cancel')",
				}),
			),
		}),

		async execute(_toolCallId: string, params: any): Promise<any> {
			return {
				content: [
					{
						type: "text",
						text: `[CONFIRMATION REQUIRED] ${params.title}: ${params.description}`,
					},
				],
				details: {
					...params,
					confirmLabel: params.confirmLabel ?? "Proceed",
					cancelLabel: params.cancelLabel ?? "Cancel",
					status: "pending",
				},
			};
		},

		renderCall(args: any, theme: Theme): ComponentLike {
			const cfg = getThemeConfig(state.themeMode);
			const confirmLabel = cfg.labels.confirmTitle || "CONFIRM";

			if (cfg.labels.confirmTitle) {
				const cardLines = drawCard(
					theme,
					cfg,
					`\u26A0 ${confirmLabel}`,
					[`${theme.fg("warning", args.title)}`],
					80,
					"warning",
				);
				return new ContainerFromLines(cardLines);
			}
			return new Text(
				`${theme.fg("warning", "\u26A0")} ${theme.fg("toolTitle", confirmLabel)} ${theme.fg("muted", args.title)}`,
				1,
				0,
			);
		},

		renderResult(result: any, _options: any, theme: Theme): ComponentLike {
			const details = result.details ?? {};
			const title = details.title ?? "Confirm";
			const description = details.description ?? "";
			const confirmLabel = details.confirmLabel ?? "Proceed";
			const cancelLabel = details.cancelLabel ?? "Cancel";
			const status = details.status ?? "pending";

			const bodyLines: string[] = [];
			if (status === "confirmed") {
				bodyLines.push(
					`${theme.fg("success", "\u2713")} ${theme.fg("success", `Confirmed: ${title}`)}`,
				);
			} else if (status === "cancelled") {
				bodyLines.push(
					`${theme.fg("dim", "\u2014")} ${theme.fg("muted", `Cancelled: ${title}`)}`,
				);
			} else {
				bodyLines.push(
					`${theme.fg("warning", "\u26A0")} ${theme.fg("warning", title)}`,
				);
			}

			const wrappedDesc = wrapTextWithAnsi(description, 60);
			for (const line of wrappedDesc) {
				bodyLines.push(` ${theme.fg("text", line)}`);
			}
			bodyLines.push("");
			bodyLines.push(
				` ${theme.fg("dim", `[ ${theme.fg("success", confirmLabel)} / ${theme.fg("dim", cancelLabel)} ]`)}`,
			);

			const cardLines = drawCard(
				theme,
				getThemeConfig(state.themeMode),
				"\u26A0 CONFIRM",
				bodyLines,
				80,
				"warning",
			);
			return new ContainerFromLines(cardLines);
		},
	});
}

// ─── Helper: Container that renders pre-computed lines ───────────────

class ContainerFromLines implements ComponentLike {
	private lines: string[];

	constructor(lines: string[]) {
		this.lines = lines;
	}

	render(_width: number): string[] {
		return this.lines;
	}

	invalidate(): void {
		// Lines are static after construction
	}
}
