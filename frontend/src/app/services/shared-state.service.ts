import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Singleton service that broadcasts the currently active table name
 * from ExplorerComponent to any subscriber (e.g. ChatComponent).
 */
@Injectable({ providedIn: 'root' })
export class SharedStateService {
  private readonly _activeTable = new BehaviorSubject<string | null>(null);

  /** Observable stream of the currently viewed table name (null = none). */
  readonly activeTable$ = this._activeTable.asObservable();

  setActiveTable(table: string | null): void {
    this._activeTable.next(table);
  }
}
