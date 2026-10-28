// The battle map's text side: reading a `battlemap` block and moving a token in it. No Obsidian here, so it is easy to
// test. A block looks like this:
//
//   ![[Cellar.png]] 20x14       the picture and the grid, columns by rows (the picture is optional)
//   Aria C4 blue                a token: a name, a cell (column letter, row number) and an optional colour
//   Goblin 1 F7 red hidden      `hidden` keeps it off the players' phones until you take the word out
//   Goblin 2                    no cell yet: it waits beside the map until it is dragged on

export const COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
export type Color = (typeof COLORS)[number];

export const MAX_SIDE = 60;
export const MAX_TOKENS = 60;
const DEFAULT_SIDE = 10;

export interface Token {
	name: string; // what is shown, without [[ ]]
	link?: string;
	col?: number; // 0-based; none while it waits beside the map
	row?: number;
	color?: Color;
	hidden: boolean;
	index: number; // its line in the block
}

export interface BattleMap {
	image: string | null; // the picture's path as written in the embed
	cols: number;
	rows: number;
	tokens: Token[];
}

const EMBED = /!\[\[([^\]|#]+)[^\]]*\]\]|!\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))[^)]*\)/;
const GRID = /(?:^|\s)(?:grid\s+)?(\d{1,2})\s*[x×]\s*(\d{1,2})(?:\s|$)/i;
const CELL = /^([A-Za-z]{1,2})(\d{1,2})$/;
const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/;

/** A column's letters: A to Z, then AA, AB and on. */
export function colName(col: number): string {
	const letter = (n: number) => String.fromCharCode(65 + n);
	return col < 26 ? letter(col) : letter(Math.floor(col / 26) - 1) + letter(col % 26);
}

/** "C4" as column 2, row 3. */
export function readCell(word: string): { col: number; row: number } | null {
	const m = CELL.exec(word);
	if (!m) return null;
	const l = m[1]!.toUpperCase();
	const col = l.length === 1 ? l.charCodeAt(0) - 65 : (l.charCodeAt(0) - 64) * 26 + l.charCodeAt(1) - 65;
	const row = Number(m[2]) - 1;
	return row >= 0 ? { col, row } : null;
}

export const cellName = (col: number, row: number) => `${colName(col)}${row + 1}`;

/** A token's line split into its parts: the name, the cell word's place, and the colour and `hidden` at the end. */
function readToken(line: string) {
	const words = line.trim().split(/\s+/);
	let color: Color | undefined;
	let hidden = false;
	let end = words.length;
	// the tail: a colour and `hidden`, in either order
	while (end > 1) {
		const w = words[end - 1]!.toLowerCase();
		if (!color && (COLORS as readonly string[]).includes(w)) color = w as Color;
		else if (!hidden && w === 'hidden') hidden = true;
		else break;
		end--;
	}
	const cell = end > 1 ? readCell(words[end - 1]!) : null;
	const nameWords = words.slice(0, cell ? end - 1 : end);
	return { nameWords, cell, color, hidden };
}

function named(text: string): { name: string; link?: string } {
	const l = LINK.exec(text);
	if (!l) return { name: text.trim() };
	return { name: text.replace(l[0], l[2]?.trim() ?? l[1]!.trim()).replace(/\s+/g, ' ').trim(), link: l[1]!.trim() };
}

export function parseMap(src: string): BattleMap {
	const map: BattleMap = { image: null, cols: DEFAULT_SIDE, rows: DEFAULT_SIDE, tokens: [] };
	let gridSeen = false;
	src.split('\n').forEach((raw, index) => {
		let line = raw.trim();
		if (!line || line.startsWith('#') || line.startsWith('%%')) return;
		const e = EMBED.exec(line);
		if (e) {
			if (map.image === null) map.image = (e[1] ?? decodeURIComponent(e[2] ?? e[3] ?? '')).trim();
			line = line.replace(e[0], ' ').trim();
		}
		const g = !gridSeen ? GRID.exec(` ${line} `) : null;
		if (g && (e || /^(grid\s+)?\d{1,2}\s*[x×]\s*\d{1,2}$/i.test(line))) {
			gridSeen = true;
			map.cols = Math.min(MAX_SIDE, Math.max(1, Number(g[1])));
			map.rows = Math.min(MAX_SIDE, Math.max(1, Number(g[2])));
			return;
		}
		if (e || map.tokens.length >= MAX_TOKENS) return;
		const t = readToken(line);
		const { name, link } = named(t.nameWords.join(' '));
		if (!name) return;
		const token: Token = { name, hidden: t.hidden, index };
		if (link) token.link = link;
		if (t.color) token.color = t.color;
		if (t.cell) {
			token.col = t.cell.col;
			token.row = t.cell.row;
		}
		map.tokens.push(token);
	});
	// a token off the grid (the grid shrank) waits beside the map
	for (const t of map.tokens) {
		if (t.col !== undefined && (t.col >= map.cols || t.row! >= map.rows)) {
			delete t.col;
			delete t.row;
		}
	}
	return map;
}

/** Writes a token's new cell into its line, or takes the cell out (`at` null) to set it beside the map. */
export function moveToken(src: string, index: number, at: { col: number; row: number } | null): string {
	const lines = src.split('\n');
	const line = lines[index];
	if (line === undefined) return src;
	const lead = /^\s*/.exec(line)![0];
	const words = line.trim().split(/\s+/);
	const t = readToken(line);
	const tail = words.slice(t.nameWords.length + (t.cell ? 1 : 0));
	const cell = at ? [cellName(at.col, at.row)] : [];
	lines[index] = lead + [...t.nameWords, ...cell, ...tail].join(' ');
	return lines.join('\n');
}

/** Adds tokens typed in the add box, one per line (or split by ;), at the end of the block. */
export function addTokens(src: string, text: string): string {
	const add = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
	if (!add.length) return src;
	const body = src.replace(/\s+$/, '');
	return (body ? body + '\n' : '') + add.join('\n');
}

/** What a token shows on its disc: the first letter, and a number at the end of its name ("Goblin 2" is G2). */
export function initials(name: string): string {
	const n = /(\d+)$/.exec(name.trim())?.[1] ?? '';
	const first = /\p{L}/u.exec(name)?.[0]?.toUpperCase();
	return first ? first + n : n || '?';
}

/** What the players' phones are sent of a map: no hidden tokens, no tokens off the grid, no links. */
export function mapForPlayers(map: BattleMap, image: string | undefined) {
	const out: { image?: string; cols: number; rows: number; tokens: { name: string; col: number; row: number; color?: Color }[] } = {
		cols: map.cols,
		rows: map.rows,
		tokens: map.tokens
			.filter((t) => !t.hidden && t.col !== undefined)
			.map((t) => (t.color ? { name: t.name, col: t.col!, row: t.row!, color: t.color } : { name: t.name, col: t.col!, row: t.row! })),
	};
	if (image) out.image = image;
	return out;
}
