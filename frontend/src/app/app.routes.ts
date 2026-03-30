import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'explorer', pathMatch: 'full' },
  {
    path: 'explorer',
    loadComponent: () =>
      import('./pages/explorer/explorer.component').then((m) => m.ExplorerComponent),
  },
  {
    path: 'explorer/:table',
    loadComponent: () =>
      import('./pages/explorer/explorer.component').then((m) => m.ExplorerComponent),
  },
  { path: '**', redirectTo: 'explorer' },
];
