import { Sparkles } from 'lucide-react';
import type { Project } from '../model/types';
import type { ProjectPlan } from '../optimizer/project';
import { planningSignature, roomKey } from '../optimizer/project';
export function ProjectMaterial({ project, plan, busy, progress, onOptimize, onCancel }:
  { project: Project; plan: ProjectPlan; busy: boolean; progress: string; onOptimize: () => void; onCancel: () => void }) {
  const names = new Map(project.floors.flatMap(f => f.rooms.map(r => [roomKey(f.id, r.id), `${f.name} · ${r.name}`] as const)));
  return <section className="section project-material"><h3><Sparkles size={16} />Pakete für das ganze Projekt</h3>
    <div className="project-packages" data-testid="project-packages">
      <strong>{plan.packages ? `${plan.packages.packages} ${plan.packages.packages === 1 ? 'Paket' : 'Pakete'} insgesamt` : plan.valid ? 'Paketinhalt eintragen' : 'Raumplanung zuerst prüfen'}</strong>
      <p>{plan.order.length} {plan.order.length === 1 ? 'Raum' : 'Räume'} über alle Etagen · Reserve einmal gemeinsam</p>
    </div>
    <dl><div><dt>Neue Dielen</dt><dd data-testid="project-new-boards">{plan.newBoards}</dd></div>
      <div><dt>Reste aus anderen Räumen</dt><dd data-testid="cross-room-pieces">{plan.crossRoomReusedPieces}</dd></div>
      {plan.packages && <><div><dt>Ohne Raumtausch, gemeinsam gekauft</dt><dd>{plan.independentPackages?.packages} Pakete</dd></div>
        <div><dt>Je Raum einzeln gekauft</dt><dd>{plan.separatePackages} Pakete</dd></div></>}
      <div><dt>Restmaterial & Schnittverlust</dt><dd>{(plan.wasteArea / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} m²</dd></div>
    </dl>
    <button className="primary full" disabled={busy || !plan.valid || !plan.packages || !plan.order.length} onClick={onOptimize}><Sparkles size={15} />{busy ? 'Pakete werden optimiert …' : 'Pakete optimieren'}</button>
    {busy && <><p className="hint" role="status">{progress || 'Reihenfolgen und passende Startstücke werden geprüft …'}</p><button className="text-button" onClick={onCancel}>Optimierung abbrechen</button></>}
    <p className="hint">Gemeinsamer Reststückbestand für alle Räume. Die Suche variiert Reihenfolge und Startstücke; deine Richtung und erste Reihenbreite bleiben erhalten. Beste gefundene Lösung, kein garantiertes globales Minimum.</p>
    {!!project.materialPlan && <p className="hint">{project.materialPlan.signature !== planningSignature(project) ? 'Plan geändert – für eine neue Suche erneut optimieren.' : `Verlegereihenfolge gespeichert · ${plan.candidates > 1 ? `${plan.candidates} Varianten geprüft` : 'erneut aus dem Projekt berechnet'}`}</p>}
    <details className="project-order"><summary>Verlegereihenfolge ({plan.order.length})</summary><ol>{plan.order.map(key => <li key={key}>{names.get(key)}</li>)}</ol></details>
  </section>;
}
