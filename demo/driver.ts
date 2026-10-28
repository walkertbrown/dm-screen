// Browser demo: runs the real DM Screen, Quick Initiative, Dice Tray and Tabletop Clocks plugins against the test shim,
// over a sample note, and shares the table through the real relay, so the phone beside it (or the visitor's own phone,
// by the QR code) is the actual players' page.
import { App, installDomHelpers, Modal, requestUrl } from '../test/obsidian-shim';
import DmScreenPlugin from '../src/main';
import QuickInitiativePlugin from '../../quick-initiative/src/main';
import DiceTrayPlugin from '../../dice-tray/src/main';
import TabletopClocksPlugin from '../../tabletop-clocks/src/main';

installDomHelpers();

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
\`\`\``;

type Ctx = { sourcePath: string; addChild: () => void; getSectionInfo: () => { text: string; lineStart: number; lineEnd: number } };
type Proc = (src: string, el: HTMLElement, c: Ctx) => void;

// the shim's requestUrl answers tests; here it goes to the real relay, which is this same site
requestUrl.reply = async (r) => {
	const res = await fetch(r.url.replace(/^https:\/\/bulkhead\.bananafest-destiny\.com/, location.origin), { method: r.method, headers: r.headers, body: r.body });
	return { status: res.status, json: await res.json().catch(() => null) };
};

async function main() {
	const app = new App();
	app.notes.set('Mill.md', { path: 'Mill.md', content: START });
	app.notes.set('Goblin', { path: 'Goblin.md', content: '', frontmatter: { statblock: true, hp: 7, ac: 15, hit_dice: '2d6', stats: [8, 14, 10, 10, 8, 8] } });
	app.notes.set('Bugbear', { path: 'Bugbear.md', content: '', frontmatter: { statblock: true, hp: 27, ac: 16, hit_dice: '5d8 + 5', stats: [15, 14, 13, 8, 11, 9] } });
	app.active = 'Mill.md';

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

	const note = () => app.notes.get('Mill.md')!.content;
	const ctx = (lang: string): Ctx => ({
		sourcePath: 'Mill.md',
		addChild: () => {},
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
	const process = app.vault.process;
	app.vault.process = async (f, fn) => {
		const before = note();
		const out = await process(f, fn);
		if (/```clocks[\s\S]*?```/.exec(before)?.[0] !== /```clocks[\s\S]*?```/.exec(out)?.[0]) drawClocks();
		return out;
	};
	drawClocks();
	for (const pp of diceProcs) pp(rolls, { sourcePath: 'Mill.md', addChild: () => {}, getSectionInfo: () => null } as never);
	qiProc(blockBody('initiative'), tracker, ctx('initiative'));

	const shareBox = document.querySelector<HTMLElement>('#share')!;
	const phone = document.querySelector<HTMLIFrameElement>('#phone')!;
	const start = document.querySelector<HTMLButtonElement>('#start')!;
	start.onclick = async () => {
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
	// a visitor who leaves closes their table, rather than leaving it for 12 hours
	addEventListener('pagehide', () => {
		if (screen.sharing) void fetch(`/api/table/${screen.settings.room}`, { method: 'DELETE', headers: { authorization: `Bearer ${screen.settings.secret}` }, keepalive: true });
	});
	app.workspace.openLinkText = async () => {};
}

void main();
