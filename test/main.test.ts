// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, ctx, installDomHelpers, Modal, Notice, requestUrl, TFile } from './obsidian-shim';
import DmScreenPlugin, { SERVER } from '../src/main';

beforeAll(() => installDomHelpers());
beforeEach(() => {
	requestUrl.sent.length = 0;
	requestUrl.reply = (r) =>
		r.url.endsWith('/open') ? { status: 200, json: { room: 'k3m9pqrstu', secret: 'the-secret' } } : { status: 200, json: { ok: true, watching: 2 } };
});

async function setup() {
	const app = new App();
	app.notes.set('Mill.md', { path: 'Mill.md', content: '```clocks\nAlarm 1/4\n```\n' });
	app.active = 'Mill.md';
	const plugin = new DmScreenPlugin(app as never, { id: 'dm-screen' } as never);
	plugin.now = () => 1000;
	await plugin.onload();
	return { app, plugin };
}
const puts = () => requestUrl.sent.filter((r) => r.method === 'PUT' && !/\/(image|map)$/.test(r.url));
const lastTable = () => JSON.parse(puts().at(-1)!.body as string);

describe('sharing the table', () => {
	it('sends nothing until the GM starts sharing', async () => {
		vi.useFakeTimers();
		const { app } = await setup();
		app.workspace.trigger('dice-tray:roll', { sourcePath: 'Mill.md', text: 'd20 -> [4] -> 4' });
		await vi.runAllTimersAsync();
		expect(requestUrl.sent).toEqual([]);
		vi.useRealTimers();
	});

	it('opens a room, sends the open note\'s clocks, and shows the link and code', async () => {
		const { plugin } = await setup();
		await plugin.share();
		expect(requestUrl.sent[0]).toMatchObject({ url: `${SERVER}/api/table/open`, method: 'POST' });
		expect(puts()[0]).toMatchObject({ url: `${SERVER}/api/table/k3m9pqrstu`, headers: { authorization: 'Bearer the-secret' } });
		expect(lastTable().clocks).toEqual([{ name: 'Alarm', filled: 1, size: 4 }]);
		const el = Modal.last!.contentEl;
		expect(el.querySelector('.dm-screen-link')!.textContent).toBe('bulkhead.bananafest-destiny.com/table/#k3m9pqrstu');
		expect(el.querySelector('.dm-screen-qr svg path')!.getAttribute('d')!.length).toBeGreaterThan(100);
		expect(el.querySelector('.dm-screen-watching')!.textContent).toBe('2 phones watching');
		expect((plugin as never as { data: { room: string } }).data.room).toBe('k3m9pqrstu');
	});

	it('sends each change once things settle', async () => {
		const { app, plugin } = await setup();
		await plugin.share();
		vi.useFakeTimers();
		const before = puts().length;
		app.workspace.trigger('quick-initiative:change', {
			sourcePath: 'Mill.md', round: 1, current: 'Aria',
			combatants: [{ name: 'Aria', hp: 20, maxHp: 27, player: true, conditions: [] }, { name: 'Goblin', hp: 7, maxHp: 7, player: false, conditions: [] }],
		});
		app.workspace.trigger('tabletop-clocks:change', { sourcePath: 'Mill.md', name: 'Alarm', filled: 2, previous: 1, size: 4, full: false });
		app.workspace.trigger('dice-tray:roll', { sourcePath: 'Mill.md', expression: 'd20', text: 'd20 -> [17] -> 17' });
		await vi.runAllTimersAsync();
		vi.useRealTimers();
		expect(puts().length).toBe(before + 1);
		expect(lastTable()).toEqual({
			round: 1, turn: 0,
			order: [{ name: 'Aria', hp: '20/27', player: true }, { name: 'Goblin' }],
			clocks: [{ name: 'Alarm', filled: 2, size: 4 }],
			rolls: [{ text: 'd20 -> [17] -> 17', at: 1000 }],
		});
	});

	it('closes the room when the GM stops', async () => {
		const { plugin } = await setup();
		await plugin.share();
		await plugin.stop();
		expect(requestUrl.sent.at(-1)).toMatchObject({ url: `${SERVER}/api/table/k3m9pqrstu`, method: 'DELETE', headers: { authorization: 'Bearer the-secret' } });
		expect(plugin.sharing).toBe(false);
		expect(Notice.last).toContain('Stopped sharing');
	});

	it('notices when the room closed by itself', async () => {
		const { plugin } = await setup();
		await plugin.share();
		requestUrl.reply = () => ({ status: 404, json: { error: 'closed' } });
		await plugin.send();
		expect(plugin.sharing).toBe(false);
		expect(Notice.last).toContain('had closed');
	});

	it('says so when the relay can\'t be reached', async () => {
		const { plugin } = await setup();
		requestUrl.reply = () => { throw new Error('offline'); };
		await plugin.share();
		expect(plugin.sharing).toBe(false);
		expect(Notice.last).toContain('Could not open');
	});
});

describe('handouts', () => {
	it('shows selected words, starting to share if it had not, and hides them again', async () => {
		const { plugin } = await setup();
		await plugin.showText('', 'Meet me at the mill.\nCome alone.');
		expect(requestUrl.sent[0]!.url).toBe(`${SERVER}/api/table/open`);
		expect(lastTable().handout).toEqual({ text: 'Meet me at the mill.\nCome alone.' });
		expect(Modal.last!.contentEl.querySelector('.dm-screen-handout')!.textContent).toBe('Showing: your textHide');
		await plugin.hideHandout();
		expect(lastTable().handout).toBeUndefined();
		// no picture, so nothing to take down
		expect(requestUrl.sent.filter((r) => r.method === 'DELETE')).toEqual([]);
	});

	it('sends a picture on its own, shrunk, then points the table at it; hiding takes it down', async () => {
		const { app, plugin } = await setup();
		app.notes.set('maps/Mill map.png', { path: 'maps/Mill map.png', content: '', bytes: new ArrayBuffer(5_000_000) });
		const shrunk = new ArrayBuffer(200_000);
		plugin.shrink = async (b) => (b.byteLength === 5_000_000 ? shrunk : null);
		requestUrl.reply = (r) =>
			r.url.endsWith('/open') ? { status: 200, json: { room: 'k3m9pqrstu', secret: 'the-secret' } }
			: r.url.endsWith('/image') ? { status: 200, json: { ok: true, v: 'abc123' } }
			: { status: 200, json: { ok: true, watching: 1 } };
		await plugin.showFile(new TFile('maps/Mill map.png') as never);
		const up = requestUrl.sent.find((r) => r.url.endsWith('/image'))!;
		expect(up).toMatchObject({ url: `${SERVER}/api/table/k3m9pqrstu/image`, method: 'PUT', contentType: 'image/jpeg', headers: { authorization: 'Bearer the-secret' } });
		expect(up.body).toBe(shrunk);
		expect(lastTable().handout).toEqual({ title: 'Mill map', image: 'abc123' });
		await plugin.hideHandout();
		expect(lastTable().handout).toBeUndefined();
		expect(requestUrl.sent.at(-1)).toMatchObject({ url: `${SERVER}/api/table/k3m9pqrstu/image`, method: 'DELETE' });
	});

	it('shows a note as its words and its first picture', async () => {
		const { app, plugin } = await setup();
		app.notes.set('Letter.md', { path: 'Letter.md', content: '---\nsecret: yes\n---\n# A letter\n\n![[seal.png|200]]\nTo [[Aria|the elf]]: **run**.\n%% she wrote it %%\n' });
		app.notes.set('seal.png', { path: 'seal.png', content: '', bytes: new ArrayBuffer(10) });
		plugin.shrink = async (b) => b;
		requestUrl.reply = (r) =>
			r.url.endsWith('/open') ? { status: 200, json: { room: 'k3m9pqrstu', secret: 'the-secret' } }
			: r.url.endsWith('/image') ? { status: 200, json: { ok: true, v: 'v1' } }
			: { status: 200, json: { ok: true, watching: 1 } };
		await plugin.showFile(new TFile('Letter.md') as never);
		expect(lastTable().handout).toEqual({ title: 'Letter', image: 'v1', text: 'A letter\n\nTo the elf: run.' });
	});

	it('says so when a picture cannot be read, and sends nothing for it', async () => {
		const { plugin } = await setup();
		await plugin.share();
		requestUrl.sent.length = 0;
		plugin.shrink = async () => null;
		await plugin.showImage(new ArrayBuffer(4), 'Broken');
		expect(requestUrl.sent).toEqual([]);
		expect(Notice.last).toBe('Could not read that picture.');
	});
});

describe('the key', () => {
	it('sends no key until there is one, then sends it to open a table', async () => {
		const { plugin } = await setup();
		await plugin.share();
		expect(requestUrl.sent[0]!.headers).toEqual({});
		await plugin.stop();
		plugin.settings.key = 'AbC123_xyz-987654';
		requestUrl.sent.length = 0;
		await plugin.share();
		expect(requestUrl.sent[0]!.headers).toEqual({ 'x-key': 'AbC123_xyz-987654' });
		expect(Modal.last!.contentEl.querySelector('.dm-screen-trial')).toBeNull();
	});

	it('shows a trial table\'s closing time and where to get a key, and says why when the hour is up', async () => {
		const { plugin } = await setup();
		requestUrl.reply = (r) =>
			r.url.endsWith('/open')
				? { status: 200, json: { room: 'k3m9pqrstu', secret: 'the-secret', trial: { ends: 3600e3 + 1000, buy: 'https://bananafestdestiny.itch.io/dm-screen' } } }
				: { status: 200, json: { ok: true, watching: 0 } };
		await plugin.share();
		const box = Modal.last!.contentEl.querySelector('.dm-screen-trial')!;
		expect(box.textContent).toContain('This is the free trial: the table closes at');
		expect(box.querySelector('a')!.getAttribute('href')).toBe('https://bananafestdestiny.itch.io/dm-screen');
		plugin.now = () => 3600e3 + 2000;
		requestUrl.reply = () => ({ status: 404, json: { error: 'closed' } });
		await plugin.send();
		expect(plugin.sharing).toBe(false);
		expect(plugin.settings.trial).toBeNull();
		expect(Notice.last).toContain('The free hour is over');
	});

	it('shows no link to buy when the server gives none', async () => {
		const { plugin } = await setup();
		requestUrl.reply = (r) =>
			r.url.endsWith('/open') ? { status: 200, json: { room: 'k3m9pqrstu', secret: 'the-secret', trial: { ends: 5000 } } } : { status: 200, json: { ok: true } };
		await plugin.share();
		expect(Modal.last!.contentEl.querySelector('.dm-screen-trial a')).toBeNull();
	});

	it('checks a key and says what the server found', async () => {
		const { plugin } = await setup();
		plugin.settings.key = 'AbC123_xyz-987654';
		requestUrl.reply = () => ({ status: 200, json: { ok: true, sold: true } });
		expect(await plugin.checkKey()).toContain('Good key');
		expect(requestUrl.sent.at(-1)).toMatchObject({ url: `${SERVER}/api/table/key`, method: 'POST', body: JSON.stringify({ key: 'AbC123_xyz-987654' }) });
		requestUrl.reply = () => ({ status: 200, json: { ok: false, sold: true } });
		expect(await plugin.checkKey()).toContain('itch doesn\'t know that key');
		requestUrl.reply = () => ({ status: 200, json: { ok: false, sold: false } });
		expect(await plugin.checkKey()).toContain('isn\'t sold yet');
		requestUrl.reply = () => { throw new Error('offline'); };
		expect(await plugin.checkKey()).toContain('Could not check');
	});

	it('asks for a lost key by email and says the same whatever the address', async () => {
		const { plugin } = await setup();
		expect(await plugin.mailKey('gm@example.com')).toContain('If that address bought DM Screen');
		expect(requestUrl.sent.at(-1)).toMatchObject({ url: `${SERVER}/api/table/key/mail`, body: JSON.stringify({ email: 'gm@example.com' }) });
	});
});

describe('the battle map', () => {
	const MAP = '# The cellar\n\n```battlemap\n![[Cellar.png]] 8x6\nAria B2 blue\nGoblin 1 F4 red\nGoblin 2 E5 red hidden\nBugbear\n```\n';
	async function board() {
		const { app, plugin } = await setup();
		app.notes.set('Cellar.md', { path: 'Cellar.md', content: MAP });
		app.notes.set('Cellar.png', { path: 'Cellar.png', content: '', bytes: new ArrayBuffer(3_000_000) });
		plugin.shrink = async () => new ArrayBuffer(100_000);
		requestUrl.reply = (r) =>
			r.url.endsWith('/open') ? { status: 200, json: { room: 'k3m9pqrstu', secret: 'the-secret' } }
			: r.url.endsWith('/map') ? { status: 200, json: { ok: true, v: 'm1' } }
			: { status: 200, json: { ok: true, watching: 1 } };
		const proc = (plugin as never as { codeBlocks: Record<string, (s: string, e: HTMLElement, c: unknown) => void> }).codeBlocks.battlemap!;
		const el = document.createElement('div');
		document.body.replaceChildren(el);
		const body = () => app.notes.get('Cellar.md')!.content.split('\n').slice(3, 8).join('\n');
		const c = () => ctx('Cellar.md', { text: app.notes.get('Cellar.md')!.content, lineStart: 2, lineEnd: 8 });
		const draw = () => proc(body(), el, c());
		draw();
		return { app, plugin, el, draw, note: () => app.notes.get('Cellar.md')!.content };
	}
	const tokens = (el: HTMLElement) => Array.from(el.querySelectorAll('.dm-screen-map-stage .dm-screen-token'), (b) => b.textContent);

	it('draws the picture, the grid and the tokens, with the ones not placed beside it', async () => {
		const { el } = await board();
		expect(el.querySelector('.dm-screen-map-title')!.textContent).toBe('Cellar · 8×6');
		expect(el.querySelector('img')!.getAttribute('src')).toBe('app://local/Cellar.png');
		expect(el.querySelector('.dm-screen-map-grid path')!.getAttribute('d')).toContain('M1 0V6');
		expect(tokens(el)).toEqual(['A', 'G1', 'G2']);
		const goblin = el.querySelectorAll<HTMLElement>('.dm-screen-map-stage .dm-screen-token')[1]!;
		expect(goblin.style.getPropertyValue('--col')).toBe('5');
		expect(goblin.style.getPropertyValue('--row')).toBe('3');
		expect(goblin.classList.contains('dm-screen-red')).toBe(true);
		expect(el.querySelectorAll('.is-hidden').length).toBe(1);
		expect(el.querySelector('.dm-screen-map-bench .dm-screen-token')!.getAttribute('aria-label')).toBe('Bugbear, waiting beside the map');
	});

	it('moves a chosen token by keys, writing the new square into its line', async () => {
		const { el, note, draw } = await board();
		const aria = () => el.querySelector<HTMLElement>('.dm-screen-map-stage .dm-screen-token')!;
		aria().click();
		expect(aria().getAttribute('aria-pressed')).toBe('true');
		aria().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		await new Promise((r) => setTimeout(r, 0));
		expect(note()).toContain('\nAria C2 blue\n');
		draw();
		aria().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
		await new Promise((r) => setTimeout(r, 0));
		expect(note()).toContain('\nAria blue\n');
	});

	it('sends a chosen token to the square clicked', async () => {
		const { el, note } = await board();
		const stage = el.querySelector<HTMLElement>('.dm-screen-map-stage')!;
		stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => '' });
		el.querySelector<HTMLElement>('.dm-screen-map-bench .dm-screen-token')!.click();
		stage.dispatchEvent(new MouseEvent('click', { clientX: 750, clientY: 50, bubbles: true }));
		await new Promise((r) => setTimeout(r, 0));
		expect(note()).toContain('\nBugbear H1\n');
	});

	it('adds tokens typed in the box', async () => {
		const { el, note } = await board();
		const add = el.querySelector<HTMLInputElement>('.dm-screen-map-add')!;
		add.value = 'Ogre D3 green; Wolf';
		add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await new Promise((r) => setTimeout(r, 0));
		expect(note()).toContain('Bugbear\nOgre D3 green\nWolf\n```');
	});

	it('shows the map to players: the picture once, then the places without hidden tokens; hiding takes it down', async () => {
		const { el, plugin, draw } = await board();
		el.querySelector<HTMLElement>('.dm-screen-map-bar button')!.click();
		await vi.waitFor(() => expect(Notice.last).toBe('The players can see the map now.'));
		const up = requestUrl.sent.filter((r) => r.url.endsWith('/map'));
		expect(up).toHaveLength(1);
		expect(up[0]).toMatchObject({ method: 'PUT', contentType: 'image/jpeg', url: `${SERVER}/api/table/k3m9pqrstu/map` });
		expect(lastTable().map).toEqual({ image: 'm1', cols: 8, rows: 6, tokens: [{ name: 'Aria', col: 1, row: 1, color: 'blue' }, { name: 'Goblin 1', col: 5, row: 3, color: 'red' }] });
		expect(el.querySelector('.dm-screen-map-bar button')!.textContent).toBe('Hide from players');
		expect(Modal.last!.contentEl.textContent).toContain('Map: Cellar');
		// a token moves: the block redraws and the new place goes out, with no second picture
		vi.useFakeTimers();
		const aria = el.querySelector<HTMLElement>('.dm-screen-map-stage .dm-screen-token')!;
		aria.click();
		el.querySelector<HTMLElement>('.dm-screen-map-stage .dm-screen-token')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		await vi.runAllTimersAsync();
		draw();
		await vi.runAllTimersAsync();
		vi.useRealTimers();
		expect(lastTable().map.tokens[0]).toEqual({ name: 'Aria', col: 1, row: 2, color: 'blue' });
		expect(requestUrl.sent.filter((r) => r.url.endsWith('/map'))).toHaveLength(1);
		await plugin.hideMap();
		expect(lastTable().map).toBeUndefined();
		expect(requestUrl.sent.at(-1)).toMatchObject({ url: `${SERVER}/api/table/k3m9pqrstu/map`, method: 'DELETE' });
	});

	it('rings the token whose turn it is', async () => {
		const { app, el } = await board();
		app.workspace.trigger('quick-initiative:change', {
			sourcePath: 'Cellar.md', round: 2, current: 'goblin 1',
			combatants: [{ name: 'Aria', hp: 0, maxHp: 27, player: true, conditions: [] }, { name: 'Goblin 1', hp: 7, maxHp: 7, player: false, conditions: [] }],
		});
		expect(el.querySelector('.is-turn')!.textContent).toBe('G1');
		expect(el.querySelector('.is-down')!.textContent).toBe('A');
	});
});
