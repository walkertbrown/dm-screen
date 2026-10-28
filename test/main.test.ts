// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, installDomHelpers, Modal, Notice, requestUrl } from './obsidian-shim';
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
const puts = () => requestUrl.sent.filter((r) => r.method === 'PUT');
const lastTable = () => JSON.parse(puts().at(-1)!.body!);

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
