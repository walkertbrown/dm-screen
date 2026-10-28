import { describe, expect, it } from 'vitest';
import { addTokens, cellName, colName, initials, mapForPlayers, moveToken, parseMap, readCell } from '../src/map';

const SRC = '![[Cellar.png]] 20x14\nAria C4 blue\n[[Goblin]] 1 F7 red hidden\nGoblin 2\n# notes\nBorin T14';

describe('battle map', () => {
	it('reads the picture, the grid and the tokens', () => {
		const m = parseMap(SRC);
		expect(m).toMatchObject({ image: 'Cellar.png', cols: 20, rows: 14 });
		expect(m.tokens).toEqual([
			{ name: 'Aria', col: 2, row: 3, color: 'blue', hidden: false, index: 1 },
			{ name: 'Goblin 1', link: 'Goblin', col: 5, row: 6, color: 'red', hidden: true, index: 2 },
			{ name: 'Goblin 2', hidden: false, index: 3 },
			{ name: 'Borin', col: 19, row: 13, hidden: false, index: 5 },
		]);
	});

	it('takes a grid on its own line, a markdown picture, or neither', () => {
		expect(parseMap('grid 8x6\nAria A1')).toMatchObject({ image: null, cols: 8, rows: 6 });
		expect(parseMap('![](maps/Mill%20yard.webp)\n12x9')).toMatchObject({ image: 'maps/Mill yard.webp', cols: 12, rows: 9 });
		expect(parseMap('Aria B2')).toMatchObject({ image: null, cols: 10, rows: 10, tokens: [{ name: 'Aria', col: 1, row: 1 }] });
	});

	it('sets a token off the grid beside the map', () => {
		expect(parseMap('4x4\nAria E5').tokens[0]).toEqual({ name: 'Aria', hidden: false, index: 1 });
	});

	it('names cells past Z', () => {
		expect(colName(0)).toBe('A');
		expect(colName(25)).toBe('Z');
		expect(colName(26)).toBe('AA');
		expect(colName(59)).toBe('BH');
		for (const c of [0, 7, 25, 26, 40, 59]) expect(readCell(cellName(c, 9))).toEqual({ col: c, row: 9 });
		expect(readCell('A0')).toBeNull();
	});

	it('moves a token in its line and keeps the rest', () => {
		expect(moveToken(SRC, 1, { col: 3, row: 4 }).split('\n')[1]).toBe('Aria D5 blue');
		expect(moveToken(SRC, 2, { col: 0, row: 0 }).split('\n')[2]).toBe('[[Goblin]] 1 A1 red hidden');
		expect(moveToken(SRC, 3, { col: 26, row: 0 }).split('\n')[3]).toBe('Goblin 2 AA1');
		expect(moveToken(SRC, 1, null).split('\n')[1]).toBe('Aria blue');
		expect(moveToken('  Aria C4', 0, { col: 1, row: 1 })).toBe('  Aria B2');
	});

	it('adds tokens at the end', () => {
		expect(addTokens('8x8\nAria A1\n', 'Goblin 3 B2; Ogre')).toBe('8x8\nAria A1\nGoblin 3 B2\nOgre');
	});

	it('gives each token its initials', () => {
		expect(['Aria', 'Goblin 2', 'the Bugbear', '12', 'Élodie 10'].map(initials)).toEqual(['A', 'G2', 'T', '12', 'É10']);
	});

	it('sends the players no hidden tokens and none beside the map', () => {
		expect(mapForPlayers(parseMap(SRC), 'v1')).toEqual({
			image: 'v1',
			cols: 20,
			rows: 14,
			tokens: [
				{ name: 'Aria', col: 2, row: 3, color: 'blue' },
				{ name: 'Borin', col: 19, row: 13 },
			],
		});
	});
});
