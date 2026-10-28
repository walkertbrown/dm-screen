import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';
import type DmScreenPlugin from './main';
import { cellName, initials, moveToken, addTokens, parseMap, type BattleMap, type Token } from './map';
import { IMAGE_EXTENSIONS } from './table';

// A drag starts once the pointer has gone this far; less is a click.
const DRAG_PX = 4;

/** A `battlemap` block drawn in the note: the picture, its grid and the tokens, which move by writing their line. */
export class MapBoard extends MarkdownRenderChild {
	// the chosen token and the one to focus after the note is rewritten, by note and line, so they survive the redraw
	static chosen = new Map<string, number>();
	static focus: { sourcePath: string; index: number } | null = null;
	map: BattleMap;
	private dragging = false;
	private dragged = false;

	constructor(private plugin: DmScreenPlugin, el: HTMLElement, private ctx: MarkdownPostProcessorContext, private src: string) {
		super(el);
		this.map = parseMap(src);
	}

	get sourcePath() {
		return this.ctx.sourcePath;
	}

	onload() {
		this.plugin.boards.add(this);
	}

	onunload() {
		this.plugin.boards.delete(this);
	}

	private get chosen() {
		return MapBoard.chosen.get(this.sourcePath) ?? -1;
	}

	private choose(index: number) {
		if (index < 0) MapBoard.chosen.delete(this.sourcePath);
		else MapBoard.chosen.set(this.sourcePath, index);
	}

	/** The picture the block names, if it is in the vault. */
	picture(): TFile | null {
		if (!this.map.image) return null;
		const f = this.plugin.app.metadataCache.getFirstLinkpathDest(this.map.image, this.sourcePath);
		return f && IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()) ? f : null;
	}

	private async move(index: number, at: { col: number; row: number } | null) {
		await this.plugin.edit(this.containerEl, this.ctx, 'battlemap', (body) => moveToken(body, index, at));
	}

	draw() {
		if (this.dragging) return;
		const el = this.containerEl;
		el.empty();
		el.addClass('dm-screen-map');
		const { cols, rows } = this.map;
		const shown = this.plugin.shownMap?.sourcePath === this.sourcePath;

		const bar = el.createDiv({ cls: 'dm-screen-map-bar' });
		bar.createSpan({ cls: 'dm-screen-map-title', text: `${this.map.image ? this.map.image.split('/').pop()!.replace(/\.[^.]+$/, '') : 'Battle map'} · ${cols}×${rows}` });
		if (this.map.image && !this.picture()) bar.createSpan({ cls: 'dm-screen-map-missing', text: `No picture called ${this.map.image} in this vault` });
		const share = bar.createEl('button', { text: shown ? 'Hide from players' : 'Show to players', cls: shown ? '' : 'mod-cta' });
		share.onclick = () => void (shown ? this.plugin.hideMap() : this.plugin.showMap(this.sourcePath, this.map, this.picture()));

		const stage = el.createDiv({ cls: 'dm-screen-map-stage' });
		stage.setCssProps({ '--cols': String(cols), '--rows': String(rows) });
		const pic = this.picture();
		if (pic) stage.createEl('img', { cls: 'dm-screen-map-img' }).setAttr('src', this.plugin.app.vault.getResourcePath(pic));
		else stage.addClass('dm-screen-map-plain');
		const grid = stage.createSvg('svg', { cls: 'dm-screen-map-grid', attr: { viewBox: `0 0 ${cols} ${rows}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' } });
		let d = '';
		for (let c = 1; c < cols; c++) d += `M${c} 0V${rows}`;
		for (let r = 1; r < rows; r++) d += `M0 ${r}H${cols}`;
		grid.createSvg('path', { attr: { d, 'vector-effect': 'non-scaling-stroke' } });

		const cellAt = (e: { clientX: number; clientY: number }) => {
			const b = stage.getBoundingClientRect();
			const x = (e.clientX - b.left) / b.width;
			const y = (e.clientY - b.top) / b.height;
			if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return null;
			return { col: Math.floor(x * cols), row: Math.floor(y * rows) };
		};
		// a chosen token goes to the square clicked
		stage.addEventListener('click', (e) => {
			if (e.target !== stage && !(e.target instanceof Element && e.target.closest('.dm-screen-map-grid, .dm-screen-map-img'))) return;
			const at = cellAt(e);
			const t = this.map.tokens.find((x) => x.index === this.chosen);
			if (!at || !t) return;
			MapBoard.focus = { sourcePath: this.sourcePath, index: t.index };
			void this.move(t.index, at);
		});

		const turn = this.plugin.fight && this.plugin.fight.round > 0 ? this.plugin.fight.current?.toLowerCase() : undefined;
		const down = new Set((this.plugin.fight?.combatants ?? []).filter((c) => c.hp !== undefined && c.hp <= 0).map((c) => c.name.toLowerCase()));
		const button = (parent: HTMLElement, t: Token) => {
			const b = parent.createEl('button', { cls: 'dm-screen-token' });
			if (t.color) b.addClass(`dm-screen-${t.color}`);
			if (t.hidden) b.addClass('is-hidden');
			if (t.name.toLowerCase() === turn) b.addClass('is-turn');
			if (down.has(t.name.toLowerCase())) b.addClass('is-down');
			if (t.index === this.chosen) b.addClass('is-chosen');
			b.createSpan({ text: initials(t.name) });
			const where = t.col === undefined ? 'waiting beside the map' : `on ${cellName(t.col, t.row!)}`;
			b.setAttr('aria-label', `${t.name}, ${where}${t.hidden ? ', hidden from players' : ''}`);
			b.setAttr('title', `${t.name}${t.col === undefined ? '' : ` · ${cellName(t.col, t.row!)}`}${t.hidden ? ' · hidden' : ''}`);
			b.setAttr('aria-pressed', String(t.index === this.chosen));
			this.handle(b, t, stage, cellAt);
			return b;
		};
		for (const t of this.map.tokens) {
			if (t.col === undefined) continue;
			const b = button(stage, t);
			b.setCssProps({ '--col': String(t.col), '--row': String(t.row) });
		}

		const waiting = this.map.tokens.filter((t) => t.col === undefined);
		const bench = el.createDiv({ cls: 'dm-screen-map-bench' });
		bench.createSpan({ cls: 'dm-screen-map-label', text: waiting.length ? 'Beside the map' : 'Drag a token here to take it off the map' });
		for (const t of waiting) {
			button(bench, t).createSpan({ cls: 'dm-screen-token-name', text: t.name });
		}

		const add = el.createEl('input', { type: 'text', cls: 'dm-screen-map-add', placeholder: 'Add: Goblin 3 F7 red; Ogre' });
		add.setAttr('aria-label', 'Add tokens');
		add.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' || !add.value.trim()) return;
			const text = add.value;
			add.value = '';
			void this.plugin.edit(this.containerEl, this.ctx, 'battlemap', (body) => addTokens(body, text));
		});
		el.createDiv({ cls: 'dm-screen-map-hint', text: 'Drag a token, or click it and then a square. Arrow keys move the chosen one; Delete takes it off the map. "hidden" at the end of a line keeps it off the players\' phones.' });

		const f = MapBoard.focus;
		if (f && f.sourcePath === this.sourcePath) {
			const i = this.map.tokens.findIndex((t) => t.index === f.index);
			MapBoard.focus = null;
			if (i >= 0) el.querySelectorAll<HTMLElement>('.dm-screen-token')[this.order().indexOf(i)]?.focus();
		}
	}

	// the tokens in the order their buttons are drawn: on the map first, then beside it
	private order() {
		const on = this.map.tokens.map((t, i) => (t.col === undefined ? -1 : i)).filter((i) => i >= 0);
		const off = this.map.tokens.map((t, i) => (t.col === undefined ? i : -1)).filter((i) => i >= 0);
		return [...on, ...off];
	}

	private handle(b: HTMLElement, t: Token, stage: HTMLElement, cellAt: (e: PointerEvent) => { col: number; row: number } | null) {
		b.addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.dragged) {
				this.dragged = false;
				return;
			}
			this.choose(t.index === this.chosen ? -1 : t.index);
			MapBoard.focus = { sourcePath: this.sourcePath, index: t.index };
			this.draw();
		});
		b.addEventListener('keydown', (e) => {
			const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
			if (e.key === 'Escape') {
				this.choose(-1);
				MapBoard.focus = { sourcePath: this.sourcePath, index: t.index };
				this.draw();
			} else if (e.key === 'Delete' || e.key === 'Backspace') {
				if (t.col === undefined) return;
				e.preventDefault();
				MapBoard.focus = { sourcePath: this.sourcePath, index: t.index };
				void this.move(t.index, null);
			} else if (step[e.key] && t.index === this.chosen) {
				e.preventDefault();
				const [dc, dr] = step[e.key]!;
				const col = Math.max(0, Math.min(this.map.cols - 1, (t.col ?? 0) + (t.col === undefined ? 0 : dc)));
				const row = Math.max(0, Math.min(this.map.rows - 1, (t.row ?? 0) + (t.row === undefined ? 0 : dr)));
				if (col === t.col && row === t.row) return;
				MapBoard.focus = { sourcePath: this.sourcePath, index: t.index };
				void this.move(t.index, { col, row });
			}
		});
		b.addEventListener('pointerdown', (down) => {
			if (down.button !== 0) return;
			const x0 = down.clientX;
			const y0 = down.clientY;
			let ghost: HTMLElement | null = null;
			b.setPointerCapture?.(down.pointerId);
			const move = (e: PointerEvent) => {
				if (!this.dragging && Math.hypot(e.clientX - x0, e.clientY - y0) < DRAG_PX) return;
				if (!this.dragging) {
					this.dragging = true;
					ghost = b.cloneNode(true) as HTMLElement;
					ghost.addClass('dm-screen-ghost');
					ghost.setCssProps({ '--size': `${stage.getBoundingClientRect().width / this.map.cols}px` });
					b.doc.body.appendChild(ghost);
					b.addClass('is-moving');
				}
				ghost!.setCssProps({ left: `${e.clientX}px`, top: `${e.clientY}px` });
			};
			const up = (e: PointerEvent) => {
				b.removeEventListener('pointermove', move);
				b.removeEventListener('pointerup', up);
				b.removeEventListener('pointercancel', up);
				if (!this.dragging) return;
				this.dragging = false;
				// the click that follows a drag is not a choice
				this.dragged = true;
				window.setTimeout(() => (this.dragged = false), 0);
				ghost?.remove();
				b.removeClass('is-moving');
				if (e.type === 'pointercancel') return;
				const at = cellAt(e);
				if (at ? at.col === t.col && at.row === t.row : t.col === undefined) {
					this.draw();
					return;
				}
				void this.move(t.index, at);
			};
			b.addEventListener('pointermove', move);
			b.addEventListener('pointerup', up);
			b.addEventListener('pointercancel', up);
		});
	}
}
