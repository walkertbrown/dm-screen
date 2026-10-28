// What the players' phones are sent: built from what Quick Initiative, Tabletop Clocks and Dice Tray announce, and
// cut down to what the GM chose to show. No Obsidian here, so it is easy to test.

// The shapes the other plugins announce (see their READMEs).
export interface FightEvent {
	sourcePath: string;
	round: number;
	current: string | null;
	combatants: { name: string; hp?: number; maxHp?: number; player: boolean; conditions: string[] }[];
}
export interface ClockEvent { sourcePath: string; name: string; filled: number; size: number }
export interface RollEvent { sourcePath: string; text: string }

// What the relay takes (the site's src/table/room.ts keeps the same shape).
export interface Fighter { name: string; hp?: string; player?: boolean; down?: boolean; conditions?: string[] }
export interface Clock { name: string; filled: number; size: number }
export interface Roll { text: string; at: number }
export interface Table { scene?: string; round?: number; turn?: number; order: Fighter[]; clocks: Clock[]; rolls: Roll[] }

export type MonsterHp = 'words' | 'numbers' | 'hidden';
export interface Show { scene: string; playerHp: boolean; monsterHp: MonsterHp; rolls: number }

/** A monster's hit points as players at a table would see them: no numbers, just how it looks. */
export function hpWords(hp: number, max?: number): string {
	if (hp <= 0) return 'down';
	if (!max || hp >= max) return '';
	return hp * 2 <= max ? 'bloodied' : 'hurt';
}

function hpFor(c: FightEvent['combatants'][number], show: Show): string {
	if (c.hp === undefined) return '';
	if (c.player ? !show.playerHp : show.monsterHp === 'hidden') return '';
	if (!c.player && show.monsterHp === 'words') return hpWords(c.hp, c.maxHp);
	return c.maxHp ? `${c.hp}/${c.maxHp}` : String(c.hp);
}

/** Everything the GM is sharing right now. A fight that has ended (round 0) shows no turn order. */
export function buildTable(fight: FightEvent | null, clocks: Clock[], rolls: Roll[], show: Show): Table {
	const t: Table = { order: [], clocks: [...clocks], rolls: rolls.slice(0, show.rolls) };
	if (show.scene.trim()) t.scene = show.scene.trim();
	if (fight && fight.round > 0) {
		t.round = fight.round;
		t.order = fight.combatants.map((c) => {
			const f: Fighter = { name: c.name };
			const hp = hpFor(c, show);
			if (hp) f.hp = hp;
			if (c.player) f.player = true;
			if (c.hp !== undefined && c.hp <= 0) f.down = true;
			if (c.conditions.length) f.conditions = [...c.conditions];
			return f;
		});
		const turn = fight.current === null ? -1 : fight.combatants.findIndex((c) => c.name === fight.current);
		if (turn >= 0) t.turn = turn;
	}
	return t;
}

/** A clock that moved replaces the one with its name; a new one goes at the end. */
export function setClock(clocks: Clock[], e: ClockEvent): Clock[] {
	const c = { name: e.name, filled: e.filled, size: e.size };
	const i = clocks.findIndex((x) => x.name === e.name);
	return i < 0 ? [...clocks, c] : clocks.map((x, j) => (j === i ? c : x));
}

const FRACTION = /(\d+)\s*\/\s*(\d+)/g;
const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

/** The clocks written in a note's `clocks` blocks ("Alarm 2/6 red", "A 1/4 vs B 0/4"), so sharing starts with the
 *  clocks already on the page rather than waiting for each to tick. */
export function clocksInNote(text: string): Clock[] {
	const out: Clock[] = [];
	for (const block of text.matchAll(/^```clocks[^\n]*\n([\s\S]*?)^```/gm)) {
		for (const line of block[1]!.split('\n')) {
			if (!line.trim() || line.trim().startsWith('#')) continue;
			for (const part of line.split(/\s+vs\.?\s+/i)) {
				let last: RegExpExecArray | null = null;
				for (const m of part.matchAll(FRACTION)) last = m;
				if (!last) continue;
				const name = part.slice(0, last.index).replace(LINK, (_, l: string, a?: string) => a ?? l).trim();
				const size = Number(last[2]);
				if (name && size > 0) out.push({ name, size, filled: Math.min(Number(last[1]), size) });
			}
		}
	}
	return out;
}
