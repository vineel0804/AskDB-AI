import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { NgStyle } from '@angular/common';
import { DbService } from '../../services/db.service';
import { SharedStateService } from '../../services/shared-state.service';
import { TableData } from '../models/models';

const BADGE_PALETTE = [
  { bg: '#DEECF9', border: '#A6CCE8', color: '#005A9E' }, // Microsoft blue
  { bg: '#DFF6DD', border: '#9FD89F', color: '#107C10' }, // Microsoft green
  { bg: '#FFF4CE', border: '#F4D57E', color: '#7A5C00' }, // Microsoft yellow
  { bg: '#FDE7E9', border: '#F4ACAC', color: '#A4262C' }, // Microsoft red
  { bg: '#EEE8F8', border: '#C4B4E4', color: '#5C2D91' }, // Microsoft purple
  { bg: '#E3F2FD', border: '#90CAF9', color: '#01579B' }, // Azure blue
  { bg: '#E8F5E9', border: '#A5D6A7', color: '#1B5E20' }, // Deep green
  { bg: '#F3F2F1', border: '#C8C6C4', color: '#323130' }, // Fluent neutral
];

// Deterministic avatar color by first letter — Microsoft Fluent palette
const LETTER_AVATARS: Record<string, string> = {
  A: 'linear-gradient(135deg, #0078D4, #2899F5)',
  B: 'linear-gradient(135deg, #107C10, #2EB82E)',
  C: 'linear-gradient(135deg, #5C2D91, #8661C5)',
  D: 'linear-gradient(135deg, #C19C00, #F4D400)',
  E: 'linear-gradient(135deg, #A4262C, #D83B01)',
  F: 'linear-gradient(135deg, #005E50, #00B294)',
  G: 'linear-gradient(135deg, #004E8C, #0078D4)',
  H: 'linear-gradient(135deg, #4A1942, #8027D6)',
  I: 'linear-gradient(135deg, #0078D4, #2899F5)',
  J: 'linear-gradient(135deg, #107C10, #2EB82E)',
  K: 'linear-gradient(135deg, #5C2D91, #8661C5)',
  L: 'linear-gradient(135deg, #C19C00, #F4D400)',
  M: 'linear-gradient(135deg, #A4262C, #D83B01)',
  N: 'linear-gradient(135deg, #005E50, #00B294)',
  O: 'linear-gradient(135deg, #004E8C, #0078D4)',
  P: 'linear-gradient(135deg, #4A1942, #8027D6)',
  Q: 'linear-gradient(135deg, #0078D4, #2899F5)',
  R: 'linear-gradient(135deg, #107C10, #2EB82E)',
  S: 'linear-gradient(135deg, #5C2D91, #8661C5)',
  T: 'linear-gradient(135deg, #C19C00, #F4D400)',
  U: 'linear-gradient(135deg, #A4262C, #D83B01)',
  V: 'linear-gradient(135deg, #005E50, #00B294)',
  W: 'linear-gradient(135deg, #004E8C, #0078D4)',
  X: 'linear-gradient(135deg, #4A1942, #8027D6)',
  Y: 'linear-gradient(135deg, #0078D4, #2899F5)',
  Z: 'linear-gradient(135deg, #107C10, #2EB82E)',
};
const FALLBACK_AVATAR = 'linear-gradient(135deg, #605E5C, #979593)';

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [FormsModule, NgStyle],
  templateUrl: './explorer.component.html',
  styleUrl: './explorer.component.css',
})
export class ExplorerComponent implements OnInit, OnDestroy {
  tableName: string | null = null;
  tableData: TableData | null = null;
  search = '';
  loading = false;
  error: string | null = null;

  readonly skelCols = [1, 2, 3, 4, 5, 6];
  readonly skelRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  private db = inject(DbService);
  private state = inject(SharedStateService);
  private route = inject(ActivatedRoute);
  private routeSub?: Subscription;

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const name = params.get('table');
      if (name && name !== this.tableName) {
        this.tableName = name;
        this.tableData = null;
        this.search = '';
        this.state.setActiveTable(name);
        this.loadPage(1);
      } else if (!name) {
        this.tableName = null;
        this.tableData = null;
        this.state.setActiveTable(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadPage(page: number): void {
    if (!this.tableName) return;
    this.loading = true;
    this.error = null;
    this.db.getTableData(this.tableName, page).subscribe({
      next: (d) => { this.tableData = d; this.loading = false; },
      error: (e: Error) => { this.error = e.message; this.loading = false; },
    });
  }

  get pages(): number[] {
    if (!this.tableData) return [];
    const total = this.tableData.total_pages;
    const cur = this.tableData.page;
    const result: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) result.push(i);
    return result;
  }

  get filteredRows(): Record<string, unknown>[] {
    if (!this.tableData) return [];
    if (!this.search.trim()) return this.tableData.rows;
    const q = this.search.toLowerCase();
    return this.tableData.rows.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(q))
    );
  }

  isIdCol(colName: string): boolean {
    return colName.toLowerCase() === 'id';
  }

  cellValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  isNull(v: unknown): boolean {
    return v === null || v === undefined || v === '';
  }

  // ── Cell rendering helpers ──────────────────────────────────────────────────

  /** Should this cell render as a colored badge pill? */
  shouldBadge(value: unknown, _colName: string): boolean {
    if (value === null || value === undefined) return false;
    const str = String(value);
    if (str === '[binary]') return false;
    if (str.length === 0 || str.length > 24) return false;
    if (!isNaN(Number(str)) && str.trim() !== '') return false;
    // skip date strings
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return false;
    return true;
  }

  getBadgeStyle(value: string): Record<string, string> {
    const c = BADGE_PALETTE[strHash(value) % BADGE_PALETTE.length];
    return { background: c.bg, 'border-color': c.border, color: c.color };
  }

  /** Should this cell show a circular avatar + text? */
  isNameCol(colName: string): boolean {
    const n = colName.toLowerCase();
    return n.includes('name') || n === 'title';
  }

  getInitials(value: string): string {
    const parts = String(value).trim().split(/[\s_]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(value).substring(0, 2).toUpperCase();
  }

  getAvatarStyle(value: string): Record<string, string> {
    const firstLetter = String(value).trim()[0]?.toUpperCase() ?? '';
    return { background: LETTER_AVATARS[firstLetter] ?? FALLBACK_AVATAR };
  }

  /** Should this cell show as monospace numeric? */
  isNumeric(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    const str = String(value);
    return !isNaN(Number(str)) && str.trim() !== '';
  }

  /** Format date strings nicely */
  formatDate(value: string): string {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  isDateStr(value: unknown): boolean {
    if (!value) return false;
    const str = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(str) && !isNaN(new Date(str).getTime());
  }
}
