import { describe, expect, it } from 'vitest';
import { buildTable, clocksInNote, hpWords, setClock, type FightEvent, type Show } from '../src/table';

const SHOW: Show = { scene: '', playerHp: true, monsterHp: 'words', rolls: 5 };
const FIGHT: FightEvent = {
	sourcePath: 'Mill.md',
	round: 2,
	current: 'Goblin 1',
	combatants: [
		{ name: 'Aria', hp: 18, maxHp: 27, player: true, conditions: [] },
		{ name: 'Goblin 1', hp: 3, maxHp: 7, player: false, conditions: ['prone'] },
		{ name: 'Goblin 2', hp: 0, maxHp: 7, player: false, conditions: [] },
		{ name: 'Bugbear', hp: 27, maxHp: 27, player: false, conditions: [] },
	],
};

describe('what the players see', () => {
	it('shows players\' hit points as numbers and monsters\' as words', () => {
		const t = buildTable(FIGHT, [], [], SHOW);
		expect(t.round).toBe(2);
		expect(t.turn).toBe(1);
		expect(t.order).toEqual([
			{ name: 'Aria', hp: '18/27', player: true },
			{ name: 'Goblin 1', hp: 'bloodied', conditions: ['prone'] },
			{ name: 'Goblin 2', hp: 'down', down: true },
			{ name: 'Bugbear' },
		]);
	});
	it('follows the settings for hit points', () => {
		const hidden = buildTable(FIGHT, [], [], { ...SHOW, playerHp: false, monsterHp: 'hidden' });
		expect(hidden.order.map((f) => f.hp)).toEqual([undefined, undefined, undefined, undefined]);
		expect(hidden.order[2]!.down).toBe(true);
		const numbers = buildTable(FIGHT, [], [], { ...SHOW, monsterHp: 'numbers' });
		expect(numbers.order.map((f) => f.hp)).toEqual(['18/27', '3/7', '0/7', '27/27']);
	});
	it('words for a monster\'s hit points', () => {
		expect([hpWords(7, 7), hpWords(5, 7), hpWords(3, 7), hpWords(0, 7), hpWords(-2, 7), hpWords(4)]).toEqual(['', 'hurt', 'bloodied', 'down', 'down', '']);
	});
	it('drops the turn order once the fight is over, and keeps the scene, clocks and rolls', () => {
		const t = buildTable({ ...FIGHT, round: 0, current: null }, [{ name: 'Alarm', filled: 2, size: 4 }], [1, 2, 3, 4, 5, 6].map((i) => ({ text: `r${i}`, at: i })), { ...SHOW, scene: ' The mill ', rolls: 3 });
		expect(t).toEqual({ scene: 'The mill', order: [], clocks: [{ name: 'Alarm', filled: 2, size: 4 }], rolls: [{ text: 'r1', at: 1 }, { text: 'r2', at: 2 }, { text: 'r3', at: 3 }] });
	});
});

describe('clocks', () => {
	it('replaces a clock that moved and adds a new one at the end', () => {
		let c = setClock([], { sourcePath: 'a', name: 'Alarm', filled: 1, size: 4 });
		c = setClock(c, { sourcePath: 'a', name: 'Loot', filled: 0, size: 6 });
		c = setClock(c, { sourcePath: 'a', name: 'Alarm', filled: 2, size: 4 });
		expect(c).toEqual([{ name: 'Alarm', filled: 2, size: 4 }, { name: 'Loot', filled: 0, size: 6 }]);
	});
	it('reads the clocks already written in a note', () => {
		const note = '# Heist\n\n```clocks\n# Inside\nAlarm 2/4 red\n[[The Red Hand|Rivals]] 1/8 vs Us 3/8\nNo size yet\n```\n\nAlarm 9/9 outside a block\n';
		expect(clocksInNote(note)).toEqual([
			{ name: 'Alarm', filled: 2, size: 4 },
			{ name: 'Rivals', filled: 1, size: 8 },
			{ name: 'Us', filled: 3, size: 8 },
		]);
	});
});
