// Browser demo: runs the real DM Screen, Quick Initiative, Dice Tray and Tabletop Clocks plugins against the test shim,
// over a sample note, and shares the table through the real relay, so the phone beside it (or the visitor's own phone,
// by the QR code) is the actual players' page.
import { App, installDomHelpers, Modal, requestUrl, TFile } from '../test/obsidian-shim';
import DmScreenPlugin from '../src/main';
import QuickInitiativePlugin from '../../quick-initiative/src/main';
import DiceTrayPlugin from '../../dice-tray/src/main';
import TabletopClocksPlugin from '../../tabletop-clocks/src/main';

installDomHelpers();
// Obsidian's own global, which DM Screen uses to shrink pictures
(globalThis as unknown as { createEl: (tag: string) => HTMLElement }).createEl = (tag) => document.createElement(tag);

// Lucide icons (ISC license), the set Obsidian itself uses.
const ICONS: Record<string, string> = {
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	'chevron-left': '<path d="m15 18-6-6 6-6"/>',
	'chevron-right': '<path d="m9 18 6-6-6-6"/>',
	square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
	shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
	sword: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/>',
	dices: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
};
(globalThis as unknown as { __iconHook: (el: HTMLElement, name: string) => void }).__iconHook = (el, name) => {
	const body = ICONS[name];
	if (!body) return;
	el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};

const START = `## The mill

\`\`\`clocks
The watch closes in 1/6
The miller's son 2/4
\`\`\`

Goblin arrows: \`dice: 1d20 + 4\` to hit, \`dice: 1d6 + 2\` damage.

\`\`\`initiative
Aria player init 17 hp 31 ac 16
Borin player init 9 hp 44 ac 18
2x [[Goblin]]
[[Bugbear]]
\`\`\`

\`\`\`battlemap
![[Mill cellar.png]] 12x8
Aria C6 blue
Borin D7 green
Goblin 1 I3 red
Goblin 2 J5 red
Bugbear K2 orange hidden
\`\`\``;

const LETTER = `---
gm: the boy is in the cellar
---
Miller,

The wheel turns at midnight, or the boy stays with us.
Come alone. Bring the ledger.

%% The writer is the miller's own brother. %%
R.`;

/** The map handout, drawn here so the demo needs no picture file: a big PNG, so DM Screen has something to shrink. */
async function drawMap(): Promise<ArrayBuffer> {
	const c = document.createElement('canvas');
	c.width = 2000;
	c.height = 1400;
	const g = c.getContext('2d')!;
	g.fillStyle = '#e9dcc0';
	g.fillRect(0, 0, 2000, 1400);
	g.strokeStyle = '#5b86a6';
	g.lineWidth = 70;
	g.beginPath();
	g.moveTo(0, 300);
	g.bezierCurveTo(600, 200, 900, 900, 2000, 800);
	g.stroke();
	g.fillStyle = '#7a5a3a';
	g.fillRect(820, 560, 260, 200);
	g.fillStyle = '#4c6b3c';
	for (const [x, y] of [[300, 900], [420, 1050], [1500, 1150], [1650, 1000], [1300, 300], [1450, 200]]) {
		g.beginPath();
		g.arc(x, y, 70, 0, Math.PI * 2);
		g.fill();
	}
	g.strokeStyle = '#7a5a3a';
	g.lineWidth = 16;
	g.setLineDash([40, 30]);
	g.beginPath();
	g.moveTo(950, 760);
	g.lineTo(950, 1400);
	g.stroke();
	g.fillStyle = '#2b2118';
	g.font = 'bold 110px Georgia, serif';
	g.fillText('The mill', 760, 520);
	g.font = 'italic 80px Georgia, serif';
	g.fillText('the wheel', 1110, 700);
	g.fillText('road to the village', 990, 1300);
	g.fillStyle = '#a3312a';
	g.font = 'bold 140px Georgia, serif';
	g.fillText('×', 1250, 430);
	const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), 'image/png'));
	return blob.arrayBuffer();
}

/** The battle map's picture: the mill's cellar from above, 12 squares by 8. */
async function drawCellar(): Promise<ArrayBuffer> {
	const c = document.createElement('canvas');
	c.width = 1200;
	c.height = 800;
	const g = c.getContext('2d')!;
	g.fillStyle = '#3b3530';
	g.fillRect(0, 0, 1200, 800);
	// flagstones
	const stone = ['#8a8178', '#7f776e', '#948b81', '#857c73'];
	for (let y = 0; y < 800; y += 100) {
		for (let x = 0; x < 1200; x += 100) {
			g.fillStyle = stone[(x / 100 * 7 + y / 100 * 3) % 4]!;
			g.fillRect(x + 4, y + 4, 92, 92);
		}
	}
	// walls, with a gap in the middle one
	g.fillStyle = '#2a2420';
	for (const [x, y, w, h] of [[0, 0, 1200, 50], [0, 750, 1200, 50], [0, 0, 50, 800], [1150, 0, 50, 800], [550, 50, 50, 300], [550, 500, 50, 250]] as const) g.fillRect(x, y, w, h);
	// the wheel's shaft and the sacks
	g.fillStyle = '#5b4632';
	g.beginPath();
	g.arc(900, 600, 90, 0, Math.PI * 2);
	g.fill();
	g.strokeStyle = '#2a2420';
	g.lineWidth = 12;
	g.stroke();
	g.fillStyle = '#c9b48a';
	for (const [x, y] of [[120, 130], [180, 120], [140, 190], [1030, 130], [1080, 180]] as const) {
		g.beginPath();
		g.ellipse(x, y, 34, 26, 0.4, 0, Math.PI * 2);
		g.fill();
	}
	// the stair up
	g.fillStyle = '#6b5a48';
	for (let i = 0; i < 5; i++) g.fillRect(60, 560 + i * 36, 150, 30);
	const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), 'image/png'));
	return blob.arrayBuffer();
}

type Ctx = { sourcePath: string; addChild: (c: { load(): void }) => void; getSectionInfo: () => { text: string; lineStart: number; lineEnd: number } };
type Proc = (src: string, el: HTMLElement, c: Ctx) => void;

// the shim's requestUrl answers tests; here it goes to the real relay, which is this same site
requestUrl.reply = async (r) => {
	const headers = { ...r.headers, ...(r.contentType ? { 'content-type': r.contentType } : {}) };
	const res = await fetch(r.url.replace(/^https:\/\/bulkhead\.bananafest-destiny\.com/, location.origin), { method: r.method, headers, body: r.body });
	return { status: res.status, json: await res.json().catch(() => null) };
};

async function main() {
	const app = new App();
	app.notes.set('Mill.md', { path: 'Mill.md', content: START });
	app.notes.set('Goblin', { path: 'Goblin.md', content: '', frontmatter: { statblock: true, hp: 7, ac: 15, hit_dice: '2d6', stats: [8, 14, 10, 10, 8, 8] } });
	app.notes.set('Bugbear', { path: 'Bugbear.md', content: '', frontmatter: { statblock: true, hp: 27, ac: 16, hit_dice: '5d8 + 5', stats: [15, 14, 13, 8, 11, 9] } });
	app.active = 'Mill.md';
	app.notes.set('Pinned to the mill door.md', { path: 'Pinned to the mill door.md', content: LETTER });
	app.notes.set('Mill map.png', { path: 'Mill map.png', content: '', bytes: await drawMap() });
	const cellar = await drawCellar();
	app.notes.set('Mill cellar.png', { path: 'Mill cellar.png', content: '', bytes: cellar });
	const cellarUrl = URL.createObjectURL(new Blob([cellar], { type: 'image/png' }));
	app.vault.getResourcePath = () => cellarUrl;

	const screen = new DmScreenPlugin(app as never, { id: 'dm-screen' } as never);
	await screen.onload();
	const qi = new QuickInitiativePlugin(app as never, { id: 'quick-initiative' } as never);
	await qi.onload();
	const dice = new DiceTrayPlugin(app as never, { id: 'dice-tray' } as never);
	await dice.onload();
	dice.settings.animate = false;
	const clocks = new TabletopClocksPlugin(app as never, { id: 'tabletop-clocks' } as never);
	await clocks.onload();
	const clockProc = (clocks as never as { codeBlocks: Record<string, Proc> }).codeBlocks.clocks!;
	const diceProcs = (dice as never as { postProcessors: ((e: HTMLElement, c: Ctx) => void)[] }).postProcessors;
	const qiProc = (qi as never as { codeBlocks: Record<string, Proc> }).codeBlocks.initiative!;
	const mapProc = (screen as never as { codeBlocks: Record<string, Proc> }).codeBlocks.battlemap!;

	const note = () => app.notes.get('Mill.md')!.content;
	const ctx = (lang: string): Ctx => ({
		sourcePath: 'Mill.md',
		// the map board is a child that has to load, as Obsidian loads it; the other plugins' blocks need nothing here
		addChild: (c) => (lang === 'battlemap' ? c.load() : undefined),
		getSectionInfo: () => {
			const lines = note().split('\n');
			const lineStart = lines.findIndex((l) => l.startsWith('```' + lang));
			const lineEnd = lines.findIndex((l, i) => i > lineStart && l.startsWith('```'));
			return { text: note(), lineStart, lineEnd };
		},
	});
	const blockBody = (lang: string) => {
		const info = ctx(lang).getSectionInfo();
		return note().split('\n').slice(info.lineStart + 1, info.lineEnd).join('\n');
	};
	const board = document.querySelector<HTMLElement>('#clocks')!;
	const rolls = document.querySelector<HTMLElement>('#rolls')!;
	const tracker = document.querySelector<HTMLElement>('#tracker')!;
	const drawClocks = () => clockProc(blockBody('clocks'), board, ctx('clocks'));
	const mapEl = document.querySelector<HTMLElement>('#battlemap')!;
	// Obsidian draws a block again from scratch when its text changes, and the old board unloads first
	let mapBoard: { unload(): void } | null = null;
	const drawMapBlock = () => {
		mapBoard?.unload();
		const holder = document.createElement('div');
		mapEl.replaceChildren(holder);
		const c = ctx('battlemap');
		mapProc(blockBody('battlemap'), holder, { ...c, addChild: (b) => ((mapBoard = b as never), c.addChild(b)) });
	};
	const block = (lang: string, text: string) => new RegExp('```' + lang + '[\\s\\S]*?```').exec(text)?.[0];
	const process = app.vault.process;
	app.vault.process = async (f, fn) => {
		const before = note();
		const out = await process(f, fn);
		if (block('clocks', before) !== block('clocks', out)) drawClocks();
		if (block('battlemap', before) !== block('battlemap', out)) drawMapBlock();
		return out;
	};
	drawClocks();
	drawMapBlock();
	for (const pp of diceProcs) pp(rolls, { sourcePath: 'Mill.md', addChild: () => {}, getSectionInfo: () => null } as never);
	qiProc(blockBody('initiative'), tracker, ctx('initiative'));

	const shareBox = document.querySelector<HTMLElement>('#share')!;
	const phone = document.querySelector<HTMLIFrameElement>('#phone')!;
	const start = document.querySelector<HTMLButtonElement>('#start')!;
	const startSharing = async () => {
		start.disabled = true;
		start.textContent = 'Opening a table…';
		await screen.share();
		if (!screen.sharing) {
			start.disabled = false;
			start.textContent = 'Share the table';
			shareBox.querySelector('.err')?.remove();
			shareBox.createEl('p', { cls: 'err', text: 'Could not reach the table server. Try again in a moment.' });
			return;
		}
		const m = Modal.last!;
		shareBox.replaceChildren(m.titleEl, m.contentEl);
		m.titleEl.className = 'modal-title';
		phone.src = `/table/#${screen.settings.room}`;
		phone.hidden = false;
		document.querySelector('#phone-hint')?.remove();
		// "Stop sharing" in the window: the demo puts the button back
		m.contentEl.querySelector('.mod-warning')?.addEventListener('click', () => {
			setTimeout(() => {
				shareBox.replaceChildren(start);
				start.disabled = false;
				start.textContent = 'Share the table';
			}, 300);
		});
	};
	start.onclick = startSharing;
	// a handout starts sharing too; here that has to go through the button, which puts the window and the phone in place
	const show = async (path: string) => {
		if (!screen.sharing) await startSharing();
		if (screen.sharing) await screen.showFile(new TFile(path) as never);
	};
	document.querySelector('#show-letter')!.addEventListener('click', () => void show('Pinned to the mill door.md'));
	document.querySelector('#show-map')!.addEventListener('click', () => void show('Mill map.png'));
	document.querySelector('#hide-handout')!.addEventListener('click', () => void screen.hideHandout());
	// a visitor who leaves closes their table, rather than leaving it for 12 hours
	addEventListener('pagehide', () => {
		if (screen.sharing) void fetch(`/api/table/${screen.settings.room}`, { method: 'DELETE', headers: { authorization: `Bearer ${screen.settings.secret}` }, keepalive: true });
	});
	app.workspace.openLinkText = async () => {};
}

void main();
