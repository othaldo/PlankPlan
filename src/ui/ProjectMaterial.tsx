import { Sparkles } from 'lucide-react';
import type { Project } from '../model/types';
import type { ProjectPlan } from '../optimizer/project';
import { planningSignature, roomKey } from '../optimizer/project';
import { HelpInfo } from './HelpInfo';
import { packageQuantity } from '../flooring/packages';
export function ProjectMaterial({ project, plan, busy, progress, onOptimize, onCancel, onSharingChange }:
  { project: Project; plan: ProjectPlan; busy: boolean; progress: string; onOptimize: () => void; onCancel: () => void; onSharingChange: (enabled: boolean) => void }) {
  const names = new Map(project.floors.flatMap(f => f.rooms.map(r => [roomKey(f.id, r.id), `${f.name} · ${r.name}`] as const)));
  const roomNeeds = project.floors.flatMap(f => f.rooms.map(r => {
    const layout = plan.layouts.get(roomKey(f.id, r.id));
    const valid = r.flooringEnabled !== false && layout?.feasible && !plan.errors.has(roomKey(f.id, r.id));
    return { key: roomKey(f.id, r.id), name: `${f.name} · ${r.name}`, enabled: r.flooringEnabled !== false,
      boards: valid ? layout.newBoards : null, packages: valid ? packageQuantity(layout.newBoards, project.flooring) : null };
  }));
  const separatePackages = project.shareOffcuts === false
    ? roomNeeds.reduce((sum, r) => sum + (r.packages?.packages ?? 0), 0) : plan.separatePackages;
  return <section className="section project-material"><h3><Sparkles size={16} />Pakete gesamt<HelpInfo label="Paketoptimierung">Die Suche optimiert Startstücke und bei aktiviertem Reststücktausch auch die Raumreihenfolge. Deine Raumvorgaben bleiben erhalten. Beste gefundene Lösung, kein garantiertes globales Minimum. Reserve wird einmal für das gesamte Projekt berechnet.</HelpInfo></h3>
    <div className="help-row"><label className="toggle-field"><input type="checkbox" checked={project.shareOffcuts === false} onChange={e => onSharingChange(!e.target.checked)} />Ohne Reststücktausch</label><HelpInfo label="Reststücktausch">Aktiviert: Jeder Raum verwendet nur seine eigenen Reststücke. Es werden keine Teile zwischen Räumen oder Etagen getauscht. Wiederverwendung innerhalb eines Raums bleibt möglich; die Pakete werden weiterhin für das gesamte Projekt berechnet.</HelpInfo></div>
    <div className="project-packages" data-testid="project-packages">
      <strong>{plan.packages ? `${plan.packages.packages} ${plan.packages.packages === 1 ? 'Paket' : 'Pakete'} insgesamt` : plan.valid ? 'Paketinhalt eintragen' : 'Raumplanung zuerst prüfen'}</strong>
      <p>{plan.order.length} {plan.order.length === 1 ? 'Raum' : 'Räume'} · {project.flooring.reservePercent ?? 5} % Reserve</p>
    </div>
    <dl><div><dt>Neue Dielen</dt><dd data-testid="project-new-boards">{plan.newBoards}</dd></div>
      <div><dt>Reste aus anderen Räumen</dt><dd data-testid="cross-room-pieces">{plan.crossRoomReusedPieces}</dd></div>
      {plan.packages && <><div><dt>Ohne Reststücktausch</dt><dd>{plan.independentPackages?.packages} Pakete</dd></div>
        <div><dt>Einzelkauf je Raum</dt><dd>{separatePackages} Pakete</dd></div></>}
      <div><dt>Restmaterial & Schnittverlust</dt><dd>{(plan.wasteArea / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} m²</dd></div>
    </dl>
    {project.shareOffcuts === false && <div className="row-details" data-testid="room-package-overview">
      <div className="help-row"><strong>Bedarf je Raum</strong><HelpInfo label="Pakete je Raum">Neue Dielen und aufgerundete Pakete je Raum, einschließlich der eingestellten Reserve. Bei gemeinsamem Einkauf können angebrochene Pakete im nächsten Raum verwendet werden. Deshalb kann die Gesamtmenge kleiner sein als die Summe dieser Einzelkäufe.</HelpInfo></div>
      <table><thead><tr><th>Etage / Raum</th><th>Dielen</th><th>Pakete</th></tr></thead><tbody>{roomNeeds.map(r =>
        <tr key={r.key}><td>{r.name}</td><td>{r.enabled ? r.boards ?? 'Prüfen' : 'Aus'}</td><td>{r.enabled ? r.boards === null ? '–' : r.packages?.packages ?? '–' : '–'}</td></tr>
      )}</tbody></table>
    </div>}
    <button className="primary full" disabled={busy || !plan.valid || !plan.packages || !plan.order.length} onClick={onOptimize}><Sparkles size={15} />{busy ? 'Pakete werden optimiert …' : 'Pakete optimieren'}</button>
    {busy && <><p className="hint" role="status">{progress || 'Reihenfolgen und passende Startstücke werden geprüft …'}</p><button className="text-button" onClick={onCancel}>Optimierung abbrechen</button></>}
    {!!project.materialPlan && <p className="hint">{project.materialPlan.signature !== planningSignature(project) ? 'Plan geändert · erneut optimieren' : 'Reihenfolge gespeichert'}</p>}
    <details className="project-order"><summary>Verlegereihenfolge ({plan.order.length})</summary><ol>{plan.order.map(key => <li key={key}>{names.get(key)}</li>)}</ol></details>
  </section>;
}
