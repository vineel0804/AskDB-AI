import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DbService } from './services/db.service';
import { TableMeta } from '../models/models';
import { ChatComponent } from './pages/chat/chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, ChatComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  isConnected = false;
  tables: TableMeta[] = [];
  filtered: TableMeta[] = [];
  tableSearch = '';
  loadingTables = true;
  explorerOpen = true;
  chatOpen = false;

  private db = inject(DbService);

  ngOnInit(): void {
    this.db.healthCheck().subscribe({
      next: () => (this.isConnected = true),
      error: () => (this.isConnected = false),
    });
    this.db.getTables().subscribe({
      next: (t) => {
        this.tables = t.filter(t => t.row_count > 0);
        this.filtered = this.tables;
        this.loadingTables = false;
      },
      error: () => (this.loadingTables = false),
    });
  }

  filterTables(): void {
    const q = this.tableSearch.toLowerCase();
    this.filtered = this.tables.filter((t) => t.name.toLowerCase().includes(q));
  }
}
