import { Sparkles } from 'lucide-react';
import type { Project } from '../model/types';
import type { ProjectPlan } from '../optimizer/project';
import { planningSignature, roomKey } from '../optimizer/project';
import { HelpInfo } from './HelpInfo';
export function ProjectMaterial({ project, plan, busy, progress, onOptimize, onCancel }:
  { project: Project; plan: ProjectPlan; busy: boolean; progress: string; onOptimize: () => void; onCancel: () => void }) {
  const names = new Map(project.floors.flatMap(f => f.rooms.map(r => [roomKey(f.id, r.id), `${f.name} · ${r.name}`] as const)));
  return <section className="section project-material"><h3><Sparkles size={16} />Pakete gesamt<HelpInfo label="Paketoptimierung">Gemeinsamer Reststückbestand für alle Räume. Die Suche variiert Reihenfolge und Startstücke und erhält deine Raumvorgaben. Beste gefundene Lösung, kein garantiertes globales Minimum. Reserve wird einmal für das gesamte Projekt berechnet.</HelpInfo></h3>
    <div className="project-packages" data-testid="project-packages">
      <strong>{plan.packages ? `${plan.packages.packages} ${plan.packages.packages === 1 ? 'Paket' : 'Pakete'} insgesamt` : plan.valid ? 'Paketinhalt eintragen' : 'Raumplanung zuerst prüfen'}</strong>
      <p>{plan.order.length} {plan.order.length === 1 ? 'Raum' : 'Räume'} · {project.flooring.reservePercent ?? 5} % Reserve</p>
    </div>
    <dl><div><dt>Neue Dielen</dt><dd data-testid="project-new-boards">{plan.newBoards}</dd></div>
      <div><dt>Reste aus anderen Räumen</dt><dd data-testid="cross-room-pieces">{plan.crossRoomReusedPieces}</dd></div>
      {plan.packages && <><div><dt>Ohne Reststücktausch</dt><dd>{plan.independentPackages?.packages} Pakete</dd></div>
        <div><dt>Einzelkauf je Raum</dt><dd>{plan.separatePackages} Pakete</dd></div></>}
      <div><dt>Restmaterial & Schnittverlust</dt><dd>{(plan.wasteArea / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} m²</dd></div>
    </dl>
    <button className="primary full" disabled={busy || !plan.valid || !plan.packages || !plan.order.length} onClick={onOptimize}><Sparkles size={15} />{busy ? 'Pakete werden optimiert …' : 'Pakete optimieren'}</button>
    {busy && <><p className="hint" role="status">{progress || 'Reihenfolgen und passende Startstücke werden geprüft …'}</p><button className="text-button" onClick={onCancel}>Optimierung abbrechen</button></>}
    {!!project.materialPlan && <p className="hint">{project.materialPlan.signature !== planningSignature(project) ? 'Plan geändert · erneut optimieren' : 'Reihenfolge gespeichert'}</p>}
    <details className="project-order"><summary>Verlegereihenfolge ({plan.order.length})</summary><ol>{plan.order.map(key => <li key={key}>{names.get(key)}</li>)}</ol></details>
  </section>;
}
