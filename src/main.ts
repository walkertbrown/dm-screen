import { App, EventRef, Modal, Notice, Plugin, PluginSettingTab, Setting, SettingDefinitionItem, requestUrl } from 'obsidian';
import qrcode from 'qrcode-generator';
import { buildTable, clocksInNote, setClock, type Clock, type ClockEvent, type FightEvent, type MonsterHp, type Roll, type RollEvent, type Table } from './table';

// The relay the players' phones read from. Nothing is sent there until the GM starts sharing (see the README).
export const SERVER = 'https://bulkhead.bananafest-destiny.com';

interface Settings {
	scene: string;
	playerHp: boolean;
	monsterHp: MonsterHp;
	rolls: number;
	// the room being shared, kept so a restart of Obsidian keeps the same link
	room: string;
	secret: string;
}

const DEFAULT_SETTINGS: Settings = { scene: '', playerHp: true, monsterHp: 'words', rolls: 5, room: '', secret: '' };

export default class DmScreenPlugin extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;
	fight: FightEvent | null = null;
	clocks: Clock[] = [];
	rolls: Roll[] = [];
	watching = 0;
	now: () => number = Date.now;
	private status: HTMLElement | null = null;
	private timer = 0;
	private onSent: (() => void)[] = [];

	get sharing() {
		return !!this.settings.room;
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DmScreenSettingTab(this.app, this));
		this.addRibbonIcon('cast', 'Share the table with players', () => void this.share());
		this.status = this.addStatusBarItem();
		this.status.addClass('mod-clickable');
		this.status.onClickEvent(() => void this.share());
		this.showStatus();
		this.addCommand({ id: 'share', name: 'Share the table with players', callback: () => void this.share() });
		this.addCommand({
			id: 'stop',
			name: 'Stop sharing the table',
			checkCallback: (checking) => {
				if (!this.sharing) return false;
				if (!checking) void this.stop();
				return true;
			},
		});
		// the other plugins' own events; DM Screen only listens, and only sends while sharing
		const on = this.app.workspace as unknown as { on<E>(name: string, cb: (e: E) => void): EventRef };
		this.registerEvent(on.on<FightEvent>('quick-initiative:change', (e) => {
			this.fight = e;
			this.changed();
		}));
		this.registerEvent(on.on<ClockEvent>('tabletop-clocks:change', (e) => {
			this.clocks = setClock(this.clocks, e);
			this.changed();
		}));
		this.registerEvent(on.on<RollEvent>('dice-tray:roll', (e) => {
			this.rolls = [{ text: e.text, at: this.now() }, ...this.rolls].slice(0, 10);
			this.changed();
		}));
	}

	onunload() {
		window.clearTimeout(this.timer);
	}

	table(): Table {
		const s = this.settings;
		return buildTable(this.fight, this.clocks, this.rolls, { scene: s.scene, playerHp: s.playerHp, monsterHp: s.monsterHp, rolls: s.rolls });
	}

	/** Opens a room if there isn't one, sends what's on the table, and shows the link to give the players. */
	async share() {
		if (!this.sharing) {
			let got: { room?: string; secret?: string };
			try {
				const r = await requestUrl({ url: `${SERVER}/api/table/open`, method: 'POST', throw: false });
				got = r.status === 200 ? (r.json as typeof got) : {};
			} catch {
				got = {};
			}
			if (!got.room || !got.secret) {
				new Notice('Could not open a table to share. Check the connection and try again.');
				return;
			}
			this.settings.room = got.room;
			this.settings.secret = got.secret;
			await this.saveSettings();
			// start with the clocks already written in the open note
			const file = this.app.workspace.getActiveFile();
			if (file) for (const c of clocksInNote(await this.app.vault.cachedRead(file))) this.clocks = setClock(this.clocks, { sourcePath: file.path, ...c });
			await this.send();
		}
		new ShareModal(this.app, this).open();
	}

	async stop() {
		const { room, secret } = this.settings;
		this.settings.room = '';
		this.settings.secret = '';
		this.watching = 0;
		await this.saveSettings();
		this.showStatus();
		if (room) await requestUrl({ url: `${SERVER}/api/table/${room}`, method: 'DELETE', headers: { authorization: `Bearer ${secret}` }, throw: false }).catch(() => null);
		new Notice('Stopped sharing. The players\' page now says the table has closed.');
	}

	link() {
		return `${SERVER}/table/#${this.settings.room}`;
	}

	/** Something on the table moved: send it once things settle, so a burst of changes is one message. */
	changed() {
		if (!this.sharing) return;
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => void this.send(), 250);
	}

	async send() {
		const { room, secret } = this.settings;
		if (!room) return;
		const r = await requestUrl({
			url: `${SERVER}/api/table/${room}`,
			method: 'PUT',
			headers: { authorization: `Bearer ${secret}` },
			contentType: 'application/json',
			body: JSON.stringify(this.table()),
			throw: false,
		}).catch(() => null);
		if (r && (r.status === 404 || r.status === 403) && this.settings.room === room) {
			// the room closed itself after 12 quiet hours
			this.settings.room = '';
			this.settings.secret = '';
			await this.saveSettings();
			new Notice('The shared table had closed. Share it again for a new link.');
		} else if (r?.status === 200) {
			this.watching = (r.json as { watching?: number }).watching ?? 0;
		}
		this.showStatus();
		for (const f of this.onSent) f();
	}

	whenSent(f: () => void) {
		this.onSent.push(f);
		return () => (this.onSent = this.onSent.filter((x) => x !== f));
	}

	showStatus() {
		if (!this.status) return;
		this.status.setText(this.sharing ? `Table shared · ${this.watching} watching` : '');
		this.status.toggleClass('dm-screen-hidden', !this.sharing);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<Settings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/** The link and its QR code, for the players to open. */
export class ShareModal extends Modal {
	private off: (() => void) | null = null;
	constructor(app: App, private plugin: DmScreenPlugin) {
		super(app);
	}

	onOpen() {
		const p = this.plugin;
		this.setTitle('The table on your players\' phones');
		const el = this.contentEl;
		el.empty();
		el.addClass('dm-screen-share');
		const link = p.link();
		drawQr(el.createDiv({ cls: 'dm-screen-qr' }), link);
		el.createEl('a', { cls: 'dm-screen-link', text: link.replace(/^https:\/\//, ''), href: link });
		const row = el.createDiv({ cls: 'dm-screen-row' });
		const copy = row.createEl('button', { text: 'Copy link', cls: 'mod-cta' });
		copy.onclick = () => {
			void navigator.clipboard.writeText(link).then(() => copy.setText('Copied'));
		};
		const stop = row.createEl('button', { text: 'Stop sharing', cls: 'mod-warning' });
		stop.onclick = () => {
			void p.stop();
			this.close();
		};
		const watching = el.createDiv({ cls: 'dm-screen-watching' });
		const show = () => watching.setText(p.watching === 1 ? '1 phone watching' : `${p.watching} phones watching`);
		show();
		this.off = p.whenSent(show);
		new Setting(el)
			.setName('Scene')
			.setDesc('A line at the top of the players\' page.')
			.addText((t) =>
				t.setPlaceholder('The mill at night').setValue(p.settings.scene).onChange(async (v) => {
					p.settings.scene = v;
					await p.saveSettings();
					p.changed();
				}),
			);
		el.createEl('p', {
			cls: 'dm-screen-note',
			text: 'Players open the link or scan the code; nothing to install. They see the turn order, clocks and recent rolls, and nothing else from your vault. Hit points follow your settings.',
		});
	}

	onClose() {
		this.off?.();
		this.contentEl.empty();
	}
}

function drawQr(el: HTMLElement, text: string) {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const n = qr.getModuleCount();
	const svg = el.createSvg('svg', { attr: { viewBox: `-2 -2 ${n + 4} ${n + 4}`, 'shape-rendering': 'crispEdges', role: 'img', 'aria-label': 'QR code for the link' } });
	svg.createSvg('rect', { attr: { x: -2, y: -2, width: n + 4, height: n + 4, fill: '#fff' } });
	let d = '';
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
	svg.createSvg('path', { attr: { d, fill: '#000' } });
}

class DmScreenSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DmScreenPlugin) {
		super(app, plugin);
	}
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Players\' hit points',
				desc: 'Show each player character\'s hit points as numbers.',
				control: { type: 'toggle', key: 'playerHp', defaultValue: true },
			},
			{
				name: 'Monsters\' hit points',
				desc: 'Words show hurt, bloodied (half or less) and down, with no numbers.',
				control: { type: 'dropdown', key: 'monsterHp', defaultValue: 'words', options: { words: 'Words', numbers: 'Numbers', hidden: 'Hidden' } },
			},
			{
				name: 'Recent rolls',
				desc: 'How many of the rolls you click the players see.',
				control: { type: 'dropdown', key: 'rolls', defaultValue: '5', options: { 0: 'None', 3: '3', 5: '5', 10: '10' } },
			},
		];
	}
	getControlValue(key: string): unknown {
		const v = this.plugin.settings[key as keyof Settings];
		return key === 'rolls' ? String(v) : v;
	}
	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = key === 'rolls' ? Number(value) : value;
		await this.plugin.saveSettings();
		this.plugin.changed();
	}
}
