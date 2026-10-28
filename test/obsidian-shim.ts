// A tiny stand-in for the `obsidian` module so main.ts can run under jsdom.
// Only what DM Screen touches is here.

type Opts = { cls?: string; text?: string; type?: string; placeholder?: string; href?: string };

function make(this: HTMLElement | void, tag: string, o?: Opts): HTMLElement {
	const el = document.createElement(tag);
	if (o?.cls) el.className = o.cls;
	if (o?.text) el.textContent = o.text;
	if (o?.type) el.setAttribute('type', o.type);
	if (o?.placeholder) el.setAttribute('placeholder', o.placeholder);
	if (o?.href) el.setAttribute('href', o.href);
	if (this && this !== (globalThis as unknown)) (this as HTMLElement).appendChild(el);
	return el;
}

export function installDomHelpers() {
	const P = HTMLElement.prototype as unknown as Record<string, unknown>;
	P.createSpan = function (this: HTMLElement, o?: Opts) { return make.call(this, 'span', o); };
	P.createDiv = function (this: HTMLElement, o?: Opts) { return make.call(this, 'div', o); };
	P.createEl = function (this: HTMLElement, tag: string, o?: Opts) { return make.call(this, tag, o); };
	P.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
	P.empty = function (this: HTMLElement) { this.replaceChildren(); };
	P.addClass = function (this: HTMLElement, ...c: string[]) { this.classList.add(...c); };
	P.removeClass = function (this: HTMLElement, ...c: string[]) { this.classList.remove(...c); };
	P.hide = function (this: HTMLElement) { this.style.display = 'none'; };
	P.show = function (this: HTMLElement) { this.style.display = ''; };
	P.toggleClass = function (this: HTMLElement, c: string, on: boolean) { this.classList.toggle(c, on); };
	P.onClickEvent = function (this: HTMLElement, fn: (e: MouseEvent) => void) { this.addEventListener('click', fn); };
	P.setAttr = function (this: HTMLElement, k: string, v: string) { this.setAttribute(k, v); };
	P.setCssProps = function (this: HTMLElement, props: Record<string, string>) { for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v); };
	Object.defineProperty(P, 'doc', { get(this: HTMLElement) { return this.ownerDocument; }, configurable: true });
	(Element.prototype as unknown as Record<string, unknown>).createSvg = function (
		this: Element,
		tag: string,
		o?: { cls?: string; attr?: Record<string, string | number | boolean | null> },
	) {
		const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
		if (o?.cls) el.setAttribute('class', o.cls);
		for (const [k, v] of Object.entries(o?.attr ?? {})) if (v !== null && v !== false) el.setAttribute(k, String(v));
		this.appendChild(el);
		return el;
	};
	(globalThis as unknown as Record<string, unknown>).createSpan = (o?: Opts) => make.call(undefined, 'span', o);
	(globalThis as unknown as Record<string, unknown>).createDiv = (o?: Opts) => make.call(undefined, 'div', o);
	Object.defineProperty(globalThis, 'activeDocument', { get: () => document, configurable: true });
}

export class TFile {
	constructor(public path: string, public basename = path.split('/').pop()!.replace(/\.[^.]+$/, '')) {}
	get extension() { return this.path.includes('.') ? this.path.split('.').pop()! : ''; }
}

export interface FakeNote { path: string; content: string; frontmatter?: Record<string, unknown>; bytes?: ArrayBuffer }

export class App {
	notes = new Map<string, FakeNote>();
	events: { name: string; data: unknown }[] = [];
	opened: string[] = [];
	private find(key: string) {
		return this.notes.get(key) ?? this.notes.get(key + '.md') ?? [...this.notes.values()].find((n) => n.path === key);
	}
	metadataCache = {
		getFirstLinkpathDest: (link: string): TFile | null => {
			const n = this.find(link);
			return n ? new TFile(n.path) : null;
		},
		getFileCache: (f: TFile) => {
			const n = this.find(f.path);
			return n ? { frontmatter: n.frontmatter } : null;
		},
	};
	folders = new Set<string>();
	active: string | null = null;
	private handlers = new Map<string, ((data: never) => void)[]>();
	vault = {
		getAbstractFileByPath: (path: string) => (this.find(path) ? new TFile(this.find(path)!.path) : this.folders.has(path) ? { path } : null),
		cachedRead: async (f: TFile) => this.find(f.path)!.content,
		readBinary: async (f: TFile) => this.find(f.path)!.bytes ?? new ArrayBuffer(0),
		getResourcePath: (f: TFile) => `app://local/${encodeURI(f.path)}`,
		getMarkdownFiles: () => [...this.notes.values()].map((n) => new TFile(n.path)),
		create: async (path: string, content: string) => {
			this.notes.set(path, { path, content });
			return new TFile(path);
		},
		createFolder: async (path: string) => { this.folders.add(path); },
		process: async (f: TFile, fn: (data: string) => string) => {
			const n = this.find(f.path)!;
			n.content = fn(n.content);
			return n.content;
		},
	};
	workspace = {
		trigger: (name: string, data: unknown) => {
			this.events.push({ name, data });
			for (const h of this.handlers.get(name) ?? []) h(data as never);
		},
		on: (name: string, fn: (data: never) => void) => {
			this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
			return { name, fn };
		},
		getActiveFile: () => (this.active ? new TFile(this.active) : null),
		getLeaf: () => ({ openFile: async (f: TFile) => { this.active = f.path; this.opened.push(f.path); } }),
		openLinkText: async (link: string) => { this.opened.push(link); },
	};
}

export class Component {
	load() { (this as { onload?: () => void }).onload?.(); }
	unload() { (this as { onunload?: () => void }).onunload?.(); }
}
export class MarkdownRenderChild extends Component {
	constructor(public containerEl: HTMLElement) { super(); }
}

export class Plugin extends Component {
	postProcessors: ((el: HTMLElement, ctx: Ctx) => void)[] = [];
	codeBlocks: Record<string, (src: string, el: HTMLElement, ctx: Ctx) => void> = {};
	commands: { id: string; name: string; callback: () => void }[] = [];
	settingTab: unknown;
	data: unknown = null;
	constructor(public app: App, public manifest: unknown) { super(); }
	registerMarkdownPostProcessor(fn: (el: HTMLElement, ctx: Ctx) => void) { this.postProcessors.push(fn); }
	registerMarkdownCodeBlockProcessor(lang: string, fn: (src: string, el: HTMLElement, ctx: Ctx) => void) { this.codeBlocks[lang] = fn; }
	addCommand(c: { id: string; name: string; callback?: () => void; checkCallback?: (checking: boolean) => boolean | void }) { this.commands.push(c as never); }
	registerEvent(_ref: unknown) {}
	addSettingTab(t: unknown) { this.settingTab = t; }
	ribbon: { icon: string; title: string; fn: () => void }[] = [];
	addRibbonIcon(icon: string, title: string, fn: () => void) { this.ribbon.push({ icon, title, fn }); return document.createElement('div'); }
	addStatusBarItem() { return document.createElement('div'); }
	// Dice Tray's panel and Live Preview rolls, for the demo, which runs it beside DM Screen
	registerView(_type: string, _fn: (leaf: WorkspaceLeaf) => unknown) {}
	registerEditorExtension(_e: unknown) {}
	// Tabletop Clocks' running stopwatches
	registerInterval(id: number) { return id; }
	async loadData() { return this.data; }
	async saveData(d: unknown) { this.data = d; }
}

export class WorkspaceLeaf {
	view: unknown = null;
	constructor(public app: App) {}
}
export class ItemView {
	app: App;
	contentEl = document.createElement('div');
	constructor(public leaf: WorkspaceLeaf) { this.app = leaf.app; }
}
export function getAllTags(cache: { tags?: { tag: string }[] }): string[] {
	return (cache.tags ?? []).map((t) => t.tag);
}
// only read inside Live Preview, which the demo doesn't have
export const editorLivePreviewField = {};
export const editorInfoField = {};

export interface SectionInfo { text: string; lineStart: number; lineEnd: number }
export interface Ctx { sourcePath: string; addChild: (c: Component) => void; getSectionInfo: (el: HTMLElement) => SectionInfo | null }
export function ctx(sourcePath = 'Game.md', info: SectionInfo | null = null): Ctx {
	return { sourcePath, addChild: (c) => c.load(), getSectionInfo: () => info };
}

export class Modal {
	contentEl = document.createElement('div');
	titleEl = document.createElement('div');
	constructor(public app: App) {}
	static last: Modal | null = null;
	open() { Modal.last = this; this.onOpen(); }
	close() { this.onClose(); }
	onOpen() {}
	onClose() {}
	setTitle(t: string) { this.titleEl.textContent = t; }
}

export class PluginSettingTab {
	containerEl = document.createElement('div');
	constructor(public app: App, public plugin: Plugin) {}
}

export class Notice {
	static last = '';
	constructor(msg: string) { Notice.last = msg; }
}

export const MarkdownRenderer = {
	render: async (_app: App, md: string, el: HTMLElement) => {
		el.textContent = md;
	},
};

export function setIcon(el: HTMLElement, name: string) {
	el.setAttribute('data-icon', name);
	// the browser demo draws real icons through this hook
	const hook = (globalThis as unknown as { __iconHook?: (el: HTMLElement, name: string) => void }).__iconHook;
	if (hook) hook(el, name);
}

/** Requests the plugin makes, answered by whatever a test puts in `requestUrl.reply`. */
export interface Req { url: string; method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer; contentType?: string; throw?: boolean }
type Reply = (r: Req) => { status: number; json?: unknown } | Promise<{ status: number; json?: unknown }>;
export const requestUrl = Object.assign(
	async (r: Req) => {
		requestUrl.sent.push(r);
		return requestUrl.reply(r);
	},
	{ sent: [] as Req[], reply: ((_r: Req) => ({ status: 200, json: { ok: true, watching: 0 } })) as Reply },
);

export class Setting {
	settingEl: HTMLElement;
	constructor(containerEl: HTMLElement) { this.settingEl = containerEl.createDiv({ cls: 'setting-item' }); }
	setName(n: string) { this.settingEl.createDiv({ cls: 'setting-item-name', text: n }); return this; }
	setDesc(_d: string) { return this; }
	addText(fn: (t: Text) => void) { fn(new Text(this.settingEl)); return this; }
	addToggle(fn: (t: unknown) => void) { const t = { setValue: () => t, onChange: () => t }; fn(t); return this; }
	addDropdown(fn: (d: unknown) => void) { const d = { addOptions: () => d, setValue: () => d, onChange: () => d }; fn(d); return this; }
}
class Text {
	inputEl: HTMLInputElement;
	private cb: (v: string) => void = () => {};
	constructor(el: HTMLElement) {
		this.inputEl = el.createEl('input', { type: 'text' }) as HTMLInputElement;
		this.inputEl.addEventListener('input', () => this.cb(this.inputEl.value));
	}
	setPlaceholder(p: string) { this.inputEl.placeholder = p; return this; }
	setValue(v: string) { this.inputEl.value = v; return this; }
	onChange(cb: (v: string) => void) { this.cb = cb; return this; }
}
