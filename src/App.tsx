import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronRight, Copy, FileImage, Hand, Layers, MousePointer2, Move, Plus, Ruler, ScanLine, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { calibrateFloor } from './geometry/calibration';
import { validatePolygon } from './geometry/polygon';
import { validateFlooring } from './flooring/layout';
import { packageQuantity } from './flooring/packages';
import { materialSource } from './flooring/material';
import { parseProject, parseRooms } from './import/project';
import { downloadProject, serializeProject } from './export/project';
import { demoProject, layingRules, newFloor, PRESETS, roomFlooring } from './model/types';
import type { Floor, Flooring, LayingRules, Point, Project, Room } from './model/types';
import { NumberField } from './ui/NumberField';
import { PlanCanvas } from './ui/PlanCanvas';
import { ProjectMaterial } from './ui/ProjectMaterial';
import { RoomDimensions } from './ui/RoomDimensions';
import { HelpInfo } from './ui/HelpInfo';
import { useProjectHistory } from './model/history';
import { ensureCheckpoint, saveCheckpoint } from './model/checkpoint';
import type { Checkpoint } from './model/checkpoint';
import { planProject, planningSignature, roomKey } from './optimizer/project';
import type { ProjectPlan } from './optimizer/project';
import type { Tool } from './ui/PlanCanvas';
import './App.css';

const STORAGE_KEY = 'plankplan.project.v1';
const format = (n: number, digits = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
function initialProject(): { project: Project; error: string } {
  try { const stored = localStorage.getItem(STORAGE_KEY); return { project: stored ? parseProject(stored) : demoProject(), error: '' }; }
  catch { return { project: demoProject(), error: 'Das gespeicherte Projekt konnte nicht geladen werden. Ein Beispielprojekt wurde geöffnet.' }; }
}
function readImage(file: File): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    reader.onload = () => {
      const dataUrl = String(reader.result), image = new Image();
      image.onerror = () => reject(new Error('Das Bildformat wird nicht unterstützt.'));
      image.onload = () => {
        if (image.naturalWidth > 20000 || image.naturalHeight > 20000) reject(new Error('Das Bild darf maximal 20.000 Pixel pro Seite groß sein.'));
        else resolve({ dataUrl, widthPx: image.naturalWidth, heightPx: image.naturalHeight });
      }; image.src = dataUrl;
    }; reader.readAsDataURL(file);
  });
}
function App() {
  const [initial] = useState(initialProject);
  const { project, setProject, undo, redo, canUndo, canRedo } = useProjectHistory(initial.project);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const latestProject = useRef(project);
  useEffect(() => { latestProject.current = project; }, [project]);
  const [scaleRooms, setScaleRooms] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [floorId, setFloorId] = useState(project.floors[0].id);
  const [roomId, setRoomId] = useState<string | null>(project.floors[0].rooms[0]?.id ?? null);
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<Point[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState(4000);
  const [snap, setSnap] = useState(10);
  const [snapRooms, setSnapRooms] = useState(true);
  const [showBoards, setShowBoards] = useState(true);
  const [showCutColors, setShowCutColors] = useState(true);
  const [notice, setNotice] = useState(initial.error);
  const [saveState, setSaveState] = useState('Lokal gespeichert');
  const [roomsDialog, setRoomsDialog] = useState(false);
  const [roomsText, setRoomsText] = useState('{\n  "rooms": [{\n    "name": "Schlafzimmer",\n    "polygon": [[0,0],[4200,0],[4200,3600],[0,3600]]\n  }]\n}');
  const [optimizing, setOptimizing] = useState(false);
  const worker = useRef<Worker | null>(null);
  const projectWorker = useRef<Worker | null>(null);
  const [projectBusy, setProjectBusy] = useState(false), [projectProgress, setProjectProgress] = useState('');
  const [optimizedProject, setOptimizedProject] = useState<{ floors: Floor[]; flooring: Flooring; materialPlan: Project['materialPlan']; plan: ProjectPlan } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null), jsonInput = useRef<HTMLInputElement>(null);
  const floor = project.floors.find(f => f.id === floorId) ?? project.floors[0];
  const room = floor.rooms.find(r => r.id === roomId);
  const roomMaterial = room ? roomFlooring(room, project.flooring) : project.flooring;
  const globalPlan = useMemo(() => optimizedProject?.floors === project.floors && optimizedProject.flooring === project.flooring && optimizedProject.materialPlan === project.materialPlan && project.materialPlan?.signature === planningSignature(project)
    ? optimizedProject.plan : planProject(project), [project, optimizedProject]);
  const computation = useMemo(() => ({
    layouts: new Map(floor.rooms.flatMap(r => { const l = globalPlan.layouts.get(roomKey(floor.id, r.id)); return l ? [[r.id, l] as const] : []; })),
    errors: new Map(floor.rooms.flatMap(r => { const error = globalPlan.errors.get(roomKey(floor.id, r.id)); return error ? [[r.id, error] as const] : []; })),
  }), [floor.id, floor.rooms, globalPlan]);
  const layout = room ? computation.layouts.get(room.id) : undefined;
  const packages = layout?.feasible && room?.flooringEnabled !== false ? packageQuantity(layout.newBoards, project.flooring) : null;
  const totalArea = [...computation.layouts.values()].reduce((a, l) => a + l.roomArea, 0) / 1e6;

  useEffect(() => {
    let active = true;
    void ensureCheckpoint(initial.project).then(saved => {
      if (active) setCheckpoint(saved);
    }).catch(() => { if (active) setNotice('Die automatische Sicherung ist nicht verfügbar. Bitte das Projekt als JSON speichern.'); });
    return () => { active = false; };
  }, [initial]);

  async function safety(label: string) {
    try {
      setCheckpoint(await saveCheckpoint(project, label));
      if (latestProject.current !== project) { setNotice('Das Projekt wurde währenddessen geändert. Bitte die Aktion erneut ausführen.'); return false; }
      return true;
    }
    catch { setNotice('Die Sicherung konnte nicht gespeichert werden. Bitte zuerst JSON speichern.'); return false; }
  }
  function resetEditing() { setTool('select'); setDraft([]); setCalibrationPoints([]); setScaleRooms(false); setCanvasVersion(v => v + 1); }

  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, serializeProject(project)); setSaveState('Lokal gespeichert'); }
      catch { setSaveState('Browserspeicher voll · bitte JSON speichern'); }
    }, 300); return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    worker.current?.terminate(); worker.current = null; setOptimizing(false);
  }, [project, floorId, roomId]);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => { projectWorker.current?.terminate(); projectWorker.current = null; setProjectBusy(false); }, [project.floors, project.flooring, project.shareOffcuts]);
  useEffect(() => () => projectWorker.current?.terminate(), []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.target as HTMLElement).matches('input,textarea,select')) return;
      if (event.key === 'Escape') { setDraft([]); setTool('select'); setCalibrationPoints([]); setRoomsDialog(false); }
      if (tool === 'draw' && (event.key === 'Backspace' || event.key === 'Delete')) { event.preventDefault(); setDraft(p => p.slice(0, -1)); }
    } window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [tool]);

  function updateFloor(fn: (f: Floor) => Floor) {
    setSaveState('Wird gespeichert …');
    setProject(p => ({ ...p, floors: p.floors.map(f => f.id === floor.id ? fn(f) : f) }));
  }
  function updateRoom(fn: (r: Room) => Room) {
    if (!room) return; updateFloor(f => ({ ...f, rooms: f.rooms.map(r => r.id === room.id ? fn(r) : r) }));
  }
  function changeFloor(id: string) {
    setFloorId(id); setRoomId(project.floors.find(f => f.id === id)?.rooms[0]?.id ?? null);
    setTool('select'); setDraft([]); setCalibrationPoints([]); setScaleRooms(false);
  }
  function addFloor() {
    if (project.floors.length >= 50) { setNotice('Maximal 50 Etagen pro Projekt.'); return; }
    const next = newFloor(project.floors.length === 1 ? 'Obergeschoss' : `Etage ${project.floors.length + 1}`);
    setProject(p => ({ ...p, floors: [...p.floors, next] })); setFloorId(next.id); setRoomId(null); setDraft([]); setCalibrationPoints([]); setTool('select');
  }
  function selectTool(next: Tool) {
    setTool(next); setDraft([]); setCalibrationPoints([]); setScaleRooms(false);
    if (next === 'draw' && floor.background && !floor.calibration) setNotice('Bitte zuerst den Grundriss kalibrieren, damit Raummaße stimmen.');
  }
  function addRoom(polygon: Point[]) {
    const error = validatePolygon(polygon); if (error) { setNotice(error); return; }
    if (floor.rooms.length >= 100) { setNotice('Maximal 100 Räume pro Etage.'); return; }
    const next: Room = { id: crypto.randomUUID(), name: `Raum ${floor.rooms.length + 1}`, polygon, layout: { direction: 0, offsetX: 0, offsetY: 0 } };
    updateFloor(f => ({ ...f, rooms: [...f.rooms, next] })); setRoomId(next.id); setDraft([]); setTool('select');
  }
  async function loadBackground(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8e6) { setNotice('Bitte ein PNG-, JPG- oder WebP-Bild bis 8 MB wählen.'); return; }
    try {
      const image = await readImage(file);
      if (!await safety('Vor dem Laden eines Grundrissbilds')) return;
      updateFloor(f => ({ ...f, background: { ...image, name: file.name.slice(0, 120), opacity: .45, origin: { x: 0, y: 0 } }, calibration: null }));
      setCalibrationPoints([]); setDraft([]); setScaleRooms(false); setTool('calibrate'); setNotice('Grundriss geladen. Bestehende Raummaße bleiben erhalten. Zwei Punkte einer bekannten Strecke anklicken und die reale Länge eintragen.');
    } catch (e) { setNotice((e as Error).message); }
  }
  async function applyCalibration() {
    if (!floor.background || calibrationPoints.length !== 2) return;
    try {
      const next = calibrateFloor(floor, calibrationPoints as [Point, Point], distance, scaleRooms);
      if (!await safety('Vor dem Kalibrieren des Grundrissbilds')) return;
      updateFloor(() => next);
      setCalibrationPoints([]); setScaleRooms(false); setTool('select');
      setNotice(scaleRooms ? 'Maßstab und Raumkonturen angepasst. Mit Rückgängig lässt sich die Änderung zurücknehmen.' : 'Bildmaßstab kalibriert. Alle vorhandenen Raummaße bleiben unverändert.');
    } catch (e) { setNotice((e as Error).message); }
  }
  function updateMaterial(changes: Partial<Flooring>) {
    const flooring = { ...project.flooring, ...changes };
    try { validateFlooring(flooring); setProject(p => ({ ...p, flooring })); }
    catch (e) { setNotice((e as Error).message); }
  }
  function updateRules(changes: Partial<LayingRules>) {
    if (!room) return false;
    const rules = { ...layingRules(roomMaterial), ...changes };
    try { validateFlooring({ ...project.flooring, ...rules }); updateRoom(r => ({ ...r, rules })); return true; }
    catch (e) { setNotice((e as Error).message); return false; }
  }
  function optimize(kind: 'transverse' | 'fixed-start' = 'transverse') {
    if (!room) return;
    worker.current?.terminate(); const next = new Worker(new URL('./optimizer/worker.ts', import.meta.url), { type: 'module' });
    worker.current = next; setOptimizing(true);
    const targetFloor = floor.id, targetRoom = room.id;
    const targetProject = project;
    next.onmessage = (event: MessageEvent<{ offsetY?: number; fixedStagger?: number; candidates?: number; error?: string }>) => {
      next.terminate(); worker.current = null; setOptimizing(false);
      if (latestProject.current !== targetProject) { setNotice('Das Projekt wurde während der Suche geändert. Bitte die Suche erneut starten.'); return; }
      if (kind === 'fixed-start') {
        setProject(p => ({ ...p, floors: p.floors.map(f => f.id !== targetFloor ? f : { ...f,
          rooms: f.rooms.map(r => r.id !== targetRoom ? r : { ...r, layout: { ...r.layout, mode: 'automatic', pattern: 'custom', startWithFullPlank: true,
            fixedStagger: event.data.fixedStagger ?? r.layout.fixedStagger ?? roomFlooring(r, p.flooring).jointOffset } }) }) }));
        setNotice(event.data.error ?? `Passender Versatz gefunden: ${format(event.data.fixedStagger!)} mm · erste Startdiele in voller Länge. Mindeststücklänge und Fugenabstand sind eingehalten.`);
        return;
      }
      if (event.data.error) { setNotice(event.data.error); return; }
      if (event.data.offsetY !== undefined) {
        setProject(p => ({ ...p, floors: p.floors.map(f => f.id !== targetFloor ? f : { ...f,
          rooms: f.rooms.map(r => r.id !== targetRoom ? r : { ...r, layout: { ...r.layout, offsetY: event.data.offsetY! } }) }) }));
        setNotice(`Quer-Offset optimiert · ${event.data.candidates} Varianten geprüft. Schmale Bereiche an Nischen und schrägen Wänden bleiben gegebenenfalls bestehen.`);
      }
    };
    next.onerror = () => { next.terminate(); worker.current = null; setOptimizing(false); setNotice('Die Optimierung konnte nicht abgeschlossen werden.'); };
    next.postMessage({ room, flooring: roomMaterial, kind });
  }
  function optimizePackages() {
    projectWorker.current?.terminate();
    const next = new Worker(new URL('./optimizer/project-worker.ts', import.meta.url), { type: 'module' });
    projectWorker.current = next; setProjectBusy(true); setProjectProgress('');
    const target = project;
    next.onmessage = (event: MessageEvent<{ plan?: ProjectPlan; error?: string; completed?: number; total?: number }>) => {
      if (projectWorker.current !== next) return;
      if (event.data.completed !== undefined) { setProjectProgress(`${event.data.completed} von ${event.data.total} Varianten geprüft`); return; }
      next.terminate(); projectWorker.current = null; setProjectBusy(false);
      if (event.data.error) { setNotice(event.data.error); return; }
      const plan = event.data.plan;
      if (!plan?.valid) { setNotice('Mindestens ein Raum hat keinen gültigen Verlegeplan. Bitte die Raumhinweise prüfen.'); return; }
      const materialPlan = { roomOrder: plan.order, adaptive: plan.adaptive, signature: planningSignature(target) };
      setOptimizedProject({ floors: target.floors, flooring: target.flooring, materialPlan, plan });
      setProject(p => ({ ...p, materialPlan }));
      setNotice(`Beste gefundene Planung: ${plan.packages?.packages ?? '–'} ${plan.packages?.packages === 1 ? 'Paket' : 'Pakete'} · ${plan.newBoards} neue Dielen · ${plan.crossRoomReusedPieces} Reststücke aus anderen Räumen.`);
    };
    next.onerror = () => { next.terminate(); projectWorker.current = null; setProjectBusy(false); setNotice('Die Paketoptimierung konnte nicht abgeschlossen werden.'); };
    next.postMessage(target);
  }
  async function loadProject(file?: File) {
    if (!file) return;
    if (file.size > 24e6) { setNotice('Das Projekt darf maximal 24 MB groß sein.'); return; }
    try { const next = parseProject(await file.text()); if (!await safety('Vor dem Laden eines Projekts')) return;
      setProject(next); setFloorId(next.floors[0].id); setRoomId(next.floors[0].rooms[0]?.id ?? null);
      setTool('select'); setDraft([]); setCalibrationPoints([]); setNotice('Projekt einschließlich aller Etagen und Grundrisse geladen.');
    } catch (e) { setNotice((e as Error).message); }
  }
  function importRooms() {
    try { const next = parseRooms(roomsText); if (floor.rooms.length + next.length > 100) throw new Error('Maximal 100 Räume pro Etage.');
      updateFloor(f => ({ ...f, rooms: [...f.rooms, ...next] })); setRoomId(next[0].id); setRoomsDialog(false); setNotice(`${next.length} Räume hinzugefügt.`);
    } catch (e) { setNotice((e as Error).message); }
  }
  const tools = [{ id: 'select', label: 'Auswählen', icon: MousePointer2 }, { id: 'draw', label: 'Raum zeichnen', icon: ScanLine }, { id: 'move-room', label: 'Raum verschieben', icon: Move },
    { id: 'calibrate', label: 'Kalibrieren', icon: Ruler }, { id: 'pan', label: 'Verschieben', icon: Hand }] as const;
  const canDraw = !floor.background || !!floor.calibration;

  return <div className="app">
    <header className="app-header"><a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark"><Layers size={25} /></span>
      <span>Plank<span className="brand-light">Plan</span><small>GUT GEPLANT. GUT VERLEGT.</small></span></a>
      <div className="project-title"><input aria-label="Projektname" value={project.name} maxLength={120} onChange={e => setProject(p => ({ ...p, name: e.target.value || 'Mein Verlegeprojekt' }))} />
        <span><span className="status-dot" />{saveState}</span></div>
      <div className="header-actions"><button disabled={!canUndo} onClick={() => { undo(); resetEditing(); setNotice('Letzte Änderung zurückgenommen.'); }}>Rückgängig</button>
        <button disabled={!canRedo} onClick={() => { redo(); resetEditing(); setNotice('Änderung wiederhergestellt.'); }}>Wiederholen</button>
        <details className="safety-menu"><summary>Sicherung</summary><div><p>{checkpoint ? `${checkpoint.label} · ${new Date(checkpoint.date).toLocaleString('de-DE')}` : 'Noch keine Sicherung vorhanden.'}</p>
          <button disabled={!checkpoint} onClick={() => { if (checkpoint) downloadProject(checkpoint.project); }}>Sicherung als JSON speichern</button>
          <button disabled={!checkpoint} onClick={() => { if (!checkpoint) return;
            const next = parseProject(serializeProject(checkpoint.project)); setProject(next); setFloorId(next.floors[0].id); setRoomId(next.floors[0].rooms[0]?.id ?? null);
            resetEditing(); setNotice('Gesicherten Stand wiederhergestellt. Rückgängig bringt dich zum vorherigen Stand zurück.'); }}>Sicherung wiederherstellen</button>
        </div></details>
        <button onClick={() => jsonInput.current?.click()}><ArrowUpFromLine size={16} />Projekt laden</button>
        <button className="primary" onClick={() => downloadProject(project)}><ArrowDownToLine size={16} />JSON speichern</button></div>
      <input hidden type="file" accept=".json,application/json" ref={jsonInput} onChange={e => { void loadProject(e.target.files?.[0]); e.target.value = ''; }} />
    </header>
    <div className="workspace">
      <aside className="setup-panel">
        <div className="panel-heading"><span className="eyebrow">DEIN PROJEKT</span><h2>Einrichtung</h2></div>
        <section className="section"><h3><span className="step-number">01</span>Etage & Grundriss</h3>
          <div className="floor-list">{project.floors.map(f => <button key={f.id} className={f.id === floor.id ? 'floor-item active' : 'floor-item'} onClick={() => changeFloor(f.id)}>
            <Layers size={16} /><span>{f.name}</span><small>{f.rooms.length}</small></button>)}</div>
          <button className="text-button" onClick={addFloor}><Plus size={15} />Etage hinzufügen</button>
          <label className="field"><span>Etagenname</span><input aria-label="Etagenname" value={floor.name} maxLength={120} onChange={e => updateFloor(f => ({ ...f, name: e.target.value || 'Etage' }))} /></label>
          <button className="upload-box" onClick={() => imageInput.current?.click()}><FileImage size={23} /><strong>{floor.background ? 'Grundriss ersetzen' : 'Grundrissbild laden'}</strong><small>PNG, JPG oder WebP · bis 8 MB</small></button>
          <input hidden type="file" accept="image/png,image/jpeg,image/webp" ref={imageInput} onChange={e => { void loadBackground(e.target.files?.[0]); e.target.value = ''; }} />
          {floor.background && <div className="background-controls"><div className="file-name">{floor.background.name}</div>
            <label className="range-field"><span>Bilddeckkraft <b>{Math.round(floor.background.opacity * 100)} %</b></span>
              <input aria-label="Bilddeckkraft" type="range" min="0" max="1" step=".05" value={floor.background.opacity} onChange={e => updateFloor(f => ({ ...f, background: { ...f.background!, opacity: Number(e.target.value) } }))} /></label>
            <button className="secondary full" onClick={() => selectTool('calibrate')}><Ruler size={15} />{floor.calibration ? 'Maßstab neu kalibrieren' : 'Maßstab kalibrieren'}</button>
            <p className={floor.calibration ? 'calibrated' : 'hint warning-text'}>{floor.calibration ? <><Check size={13} />{format(floor.calibration.mmPerPixel, 3)} mm / Bildpixel</> : 'Noch kein realer Maßstab festgelegt.'}</p>
            <details><summary>Bildposition im Plan</summary><div className="field-pair">
              <NumberField label="Grundrissposition X" value={floor.background.origin.x} min={-1e6} onChange={x => updateFloor(f => ({ ...f, background: { ...f.background!, origin: { ...f.background!.origin, x } } }))} />
              <NumberField label="Grundrissposition Y" value={floor.background.origin.y} min={-1e6} onChange={y => updateFloor(f => ({ ...f, background: { ...f.background!, origin: { ...f.background!.origin, y } } }))} />
            </div><div className="help-row"><HelpInfo label="Bildposition">Verschiebt das Hintergrundbild unabhängig von den Räumen.</HelpInfo></div></details>
            <button className="text-button muted" onClick={async () => { if (!await safety('Vor dem Entfernen des Grundrissbilds')) return;
              updateFloor(f => ({ ...f, background: null, calibration: null })); setCalibrationPoints([]); setTool('select'); }}>Hintergrund entfernen</button>
          </div>}
          {tool === 'calibrate' && <div className="calibration-card"><strong>Maßstab</strong><HelpInfo label="Kalibrierung">Anfang und Ende einer bekannten Strecke im Bild wählen und deren reale Länge eingeben. Kalibriert standardmäßig nur das Bild; bestehende Raummaße bleiben erhalten.</HelpInfo><p>{calibrationPoints.length}/2 Messpunkte</p>
            <NumberField label="Reale Strecke" value={distance} min={1} max={1e6} onChange={setDistance} />
            <button className="primary full" disabled={calibrationPoints.length !== 2} onClick={applyCalibration}>Maßstab übernehmen</button>
            <button className="text-button" onClick={() => setCalibrationPoints([])}>Messpunkte zurücksetzen</button>
            {floor.rooms.length > 0 && <>
              <label className="toggle-field"><input type="checkbox" checked={scaleRooms} onChange={e => setScaleRooms(e.target.checked)} />Raumkonturen ebenfalls skalieren</label>
              {scaleRooms && <small className="warning-text">Ändert die Maße aller Räume dieser Etage. Nur für Konturen verwenden, die im bisherigen Bildmaßstab nachgezeichnet wurden.</small>}</>}
          </div>}
        </section>
        <section className="section"><h3><span className="step-number">02</span>Räume</h3>
          {floor.rooms.map(r => <button key={r.id} className={r.id === roomId ? 'room-item active' : 'room-item'} onClick={() => { setRoomId(r.id); selectTool('select'); }}>
            <span className="room-dot" /><span>{r.name}</span><small>{r.flooringEnabled === false ? 'ohne Laminat' : computation.layouts.has(r.id) ? `${format(computation.layouts.get(r.id)!.roomArea / 1e6)} m²` : 'Prüfen'}</small><ChevronRight size={14} /></button>)}
          {!floor.rooms.length && <p className="hint">Raum zeichnen oder JSON einfügen.</p>}
          <div className="button-row"><button className="secondary" disabled={!canDraw} onClick={() => selectTool('draw')}><Plus size={15} />Raum zeichnen</button>
            <button className="icon-button" title="Räume aus JSON einfügen" onClick={() => setRoomsDialog(true)}><ArrowUpFromLine size={16} /></button></div>
          {room && <><label className="field"><span>Raumname</span><input aria-label="Raumname" value={room.name} maxLength={120} onChange={e => updateRoom(r => ({ ...r, name: e.target.value || 'Raum' }))} /></label>
            <RoomDimensions key={room.id} room={room} onChange={polygon => updateRoom(r => ({ ...r, polygon }))} onError={setNotice} />
            <label className="toggle-field"><input type="checkbox" checked={room.flooringEnabled !== false} onChange={e => updateRoom(r => ({ ...r, flooringEnabled: e.target.checked }))} />Laminat in diesem Raum verlegen</label>
            <div className="button-row"><button className="text-button muted" onClick={() => {
              if (floor.rooms.length >= 100) { setNotice('Maximal 100 Räume pro Etage.'); return; }
              const clone = { ...room, id: crypto.randomUUID(), name: `${room.name.slice(0, 108)} Kopie`, polygon: room.polygon.map(p => ({ x: p.x + 600, y: p.y + 600 })) };
              updateFloor(f => ({ ...f, rooms: [...f.rooms, clone] })); setRoomId(clone.id);
            }}><Copy size={13} />Duplizieren</button>
              <button className="text-button muted" onClick={() => {
                if (!window.confirm(`„${room.name}“ löschen?`)) return;
                const next = floor.rooms.filter(r => r.id !== room.id); updateFloor(f => ({ ...f, rooms: next })); setRoomId(next[0]?.id ?? null);
              }}><Trash2 size={13} />Löschen</button></div></>}
        </section>
        <section className="section material-section"><h3><span className="step-number">03</span>Dein Laminat<HelpInfo label="Materialeinstellungen">Dielenformat und Paketinhalt gelten für das Projekt. Verlegeregeln stellst du rechts am ausgewählten Raum ein.</HelpInfo></h3>
          <label className="field"><span>Formatvorlage</span><select aria-label="Laminatvorlage" value={PRESETS.findIndex(p => p.name === project.flooring.name && p.length === project.flooring.length && p.width === project.flooring.width)}
            onChange={e => { const preset = PRESETS[Number(e.target.value)]; if (preset) setProject(p => ({ ...p, flooring: { ...preset, ...layingRules(p.flooring) } })); }}>
            <option value={-1}>Eigene Maße</option>{PRESETS.map((p, i) => <option value={i} key={p.name}>{p.name}</option>)}</select></label>
          <div className="material-swatch"><span /><div><strong>{project.flooring.name}</strong><small>{project.flooring.length} × {project.flooring.width} × {project.flooring.thickness} mm</small></div></div>
          <div className="field-pair"><NumberField label="Dielenlänge" value={project.flooring.length} min={100} max={5000} onChange={length => updateMaterial({ length, name: 'Eigene Maße' })} />
            <NumberField label="Dielenbreite" value={project.flooring.width} min={20} max={1000} onChange={width => updateMaterial({ width, name: 'Eigene Maße' })} /></div>
          <NumberField label="Stärke" value={project.flooring.thickness} min={1} max={100} onChange={thickness => updateMaterial({ thickness })} />
          <div className="field-pair"><NumberField label="Dielen pro Paket" value={project.flooring.boardsPerPack ?? 0} max={500} unit="Stk." onChange={boardsPerPack => updateMaterial({ boardsPerPack: boardsPerPack || undefined })} />
            <NumberField label="Zusätzliche Reserve" value={project.flooring.reservePercent ?? 5} max={100} unit="%" onChange={reservePercent => updateMaterial({ reservePercent })} /></div>
          <NumberField label="Sägeblattbreite / Schnittverlust" value={project.flooring.sawKerf ?? 3} max={10} step={.1} onChange={sawKerf => updateMaterial({ sawKerf })} />
          {!project.flooring.boardsPerPack && <p className="hint warning-text">Paketinhalt fehlt.</p>}
        </section>
        <ProjectMaterial project={project} plan={globalPlan} busy={projectBusy} progress={projectProgress} onOptimize={optimizePackages}
          onSharingChange={shareOffcuts => {
            projectWorker.current?.terminate(); projectWorker.current = null; setProjectBusy(false); setOptimizedProject(null); setNotice('');
            setProject(p => ({ ...p, shareOffcuts, materialPlan: undefined }));
          }}
          onCancel={() => { projectWorker.current?.terminate(); projectWorker.current = null; setProjectBusy(false); setNotice('Optimierung abgebrochen. Die bisherige Planung bleibt erhalten.'); }} />
      </aside>
      <main className="plan-panel"><div className="plan-heading"><div><span className="eyebrow">VERLEGEPLAN</span><h1>{floor.name}</h1><p>{floor.rooms.length} {floor.rooms.length === 1 ? 'Raum' : 'Räume'}<span>·</span>{format(totalArea)} m² Raumfläche</p></div>
        <span className="local-badge"><span className="status-dot" />Lokal auf deinem Gerät</span></div>
        <div className="canvas-toolbar"><div className="tool-group">{tools.map(t => <button key={t.id} className={tool === t.id ? 'active' : ''}
          disabled={(t.id === 'calibrate' && !floor.background) || (t.id === 'draw' && !canDraw)} onClick={() => selectTool(t.id)} title={t.label}><t.icon size={16} /><span>{t.label}</span></button>)}</div>
          <label className="snap-select">Raster <select aria-label="Zeichenraster" value={snap} onChange={e => setSnap(Number(e.target.value))}>{[1, 10, 50, 100].map(n => <option key={n} value={n}>{n} mm</option>)}</select></label></div>
        <label className="snap-rooms-control"><input type="checkbox" checked={snapRooms} onChange={e => setSnapRooms(e.target.checked)} />An anderen Raumkanten einrasten <small>beim Zeichnen, Eckpunkte ziehen und Raum verschieben</small></label>
        <div className="drawing-help">{tool === 'draw' ? <><ScanLine size={14} />Eckpunkte anklicken · ersten Punkt zum Schließen wählen · Shift: 45° · Esc: Abbrechen</> :
          tool === 'calibrate' ? <><Ruler size={14} />Zwei Punkte einer bekannten Strecke im Grundriss anklicken.</> :
          tool === 'pan' ? <><Hand size={14} />Plan mit gedrückter Maustaste verschieben · Mausrad: schieben · Strg + Mausrad: zoomen.</> :
          tool === 'move-room' ? <><Move size={14} />Raum anklicken und ziehen. Nahe Ecken und Wände rasten exakt zusammen.</> :
          <><MousePointer2 size={14} />Leertaste + Ziehen: Plan schieben · Wandmaß: Länge ändern · +: Punkt einfügen · Shift: gerade ziehen.</>}
          {tool === 'draw' && draft.length > 0 && <div className="drawing-actions"><button onClick={() => setDraft(draft.slice(0, -1))}>Punkt zurück</button><button disabled={draft.length < 3} onClick={() => addRoom(draft)}>Raum schließen</button></div>}</div>
        <PlanCanvas key={`${floor.id}:${canvasVersion}`} floor={floor} selectedId={roomId} layouts={computation.layouts} tool={tool} draft={draft} setDraft={setDraft}
          calibrationPoints={calibrationPoints} setCalibrationPoints={setCalibrationPoints} onSelect={setRoomId} onRoom={addRoom}
          onPolygon={(id, polygon) => updateFloor(f => ({ ...f, rooms: f.rooms.map(r => r.id === id ? { ...r, polygon } : r) }))}
          onError={setNotice} snap={snap} snapRooms={snapRooms} showBoards={showBoards} showCutColors={showCutColors} />
        <div className="canvas-footer">{showCutColors ? <div className="legend"><span><i className="legend-full" />Ganze Diele</span><span><i className="legend-cut" />Zuschnitt</span><span><i className="legend-reused" />Reststück</span></div> : <div className="legend"><span>Fugenbild ohne Zuschnittfarben</span></div>}
          <label><input type="checkbox" checked={showCutColors} onChange={e => setShowCutColors(e.target.checked)} />Zuschnitte farbig markieren</label>
          <label><input type="checkbox" checked={showBoards} onChange={e => setShowBoards(e.target.checked)} />Dielen anzeigen</label></div>
      </main>
      <aside className="results-panel"><span className="eyebrow">VERLEGUNG & ERGEBNIS</span><h2>{room?.name ?? 'Raum auswählen'}</h2>
        {room && room.flooringEnabled !== false ? <><section className="layout-controls"><h3>Verlegeregeln für diesen Raum<HelpInfo label="Raumregeln">Diese Werte gelten nur für {room.name}. Andere Räume behalten ihre Regeln. Bitte an die Verlegeanleitung deines Bodens anpassen.</HelpInfo></h3>
          <NumberField label="Bewegungsfuge" value={roomMaterial.expansionGap} max={100} onChange={expansionGap => updateRules({ expansionGap })} />
          <NumberField label="Mindest-Reihenbreite" value={roomMaterial.minRowWidth} min={1} max={project.flooring.width} onChange={minRowWidth => updateRules({ minRowWidth })} />
          <NumberField label="Mindest-Endstück" value={roomMaterial.minEndPieceLength} min={1} max={project.flooring.length} onChange={minEndPieceLength => updateRules({ minEndPieceLength })} />
          <NumberField label="Stirnfugenversatz je Reihe" value={roomMaterial.jointOffset} max={project.flooring.length - 1} onChange={jointOffset => updateRules({ jointOffset })} />
          <NumberField label="Mindest-Fugenversatz" value={roomMaterial.minJointOffset ?? 300} max={project.flooring.length / 2} onChange={minJointOffset => updateRules({ minJointOffset })} />
          </section><section className="layout-controls"><h3>Richtung & Planung</h3><div className="direction-buttons">{[0, 90].map(angle => <button className={room.layout.direction === angle ? 'active' : ''} key={angle} onClick={() => updateRoom(r => ({ ...r, layout: { ...r.layout, direction: angle } }))}>{angle === 0 ? '↔' : '↕'} {angle}°</button>)}</div>
          <NumberField label="Eigener Winkel" value={room.layout.direction} min={-360} max={360} unit="°" onChange={direction => updateRoom(r => ({ ...r, layout: { ...r.layout, direction } }))} />
          <button className="primary full" disabled={optimizing} onClick={() => optimize('fixed-start')}>
            {optimizing ? 'Passender Versatz wird gesucht …' : 'Festen Versatz mit ganzer Startdiele einstellen'}
          </button>
          {room.layout.mode !== 'manual' && <>
            <label className="field"><span>Verlegemuster</span><select aria-label="Verlegemuster" value={room.layout.pattern ?? 'optimized'}
              onChange={e => updateRoom(r => ({ ...r, layout: { ...r.layout, pattern: e.target.value as 'optimized' | 'half' | 'third' | 'custom' } }))}>
              <option value="optimized">Material sparen · freier Versatz</option><option value="half">Regelmäßig · Halbversatz</option><option value="third">Regelmäßig · Drittelversatz</option><option value="custom">Eigener fester Versatz</option>
            </select></label>
            {room.layout.pattern === 'custom' && <NumberField label="Fester Versatz je Reihe" value={room.layout.fixedStagger ?? roomMaterial.jointOffset} min={0} max={project.flooring.length - .1} step={.1}
              onChange={fixedStagger => updateRoom(r => ({ ...r, layout: { ...r.layout, fixedStagger } }))} />}
            <div className="help-row"><HelpInfo label="Verlegemuster">{room.layout.pattern === 'custom'
              ? 'Jede nächste Reihe verschiebt die Fugen um genau diesen Wert. Beim Erreichen einer Dielenlänge beginnt das Muster wieder von vorn. Auch die Paketoptimierung hält den Versatz ein.'
              : room.layout.pattern === 'half' || room.layout.pattern === 'third'
              ? `Die Fugen wiederholen sich alle ${room.layout.pattern === 'half' ? 'zwei' : 'drei'} Reihen. Die Automatik sucht einen passenden Start. Das feste Muster bleibt auch bei der Paketoptimierung erhalten und kann mehr Material benötigen.`
              : 'Die Suche bevorzugt weniger neue Dielen. Reststücke können zu unterschiedlichen Startlängen führen.'}</HelpInfo></div>
            <label className="toggle-field"><input type="checkbox" checked={room.layout.startWithFullPlank ?? false}
              onChange={e => updateRoom(r => ({ ...r, layout: { ...r.layout, startWithFullPlank: e.target.checked } }))} />Mit ganzer Startdiele beginnen</label>
            <div className="help-row"><HelpInfo label="Ganze Startdiele">Volle Länge ({project.flooring.length} mm). Die Reihenbreite ist separat einstellbar. Konflikte mit Mindestlängen oder Raumkontur werden angezeigt.</HelpInfo></div>
            <label className="field"><span>Erste Reihe</span><select aria-label="Erste Reihe" value={room.layout.firstRowWidth === undefined ? 'automatic' : room.layout.firstRowWidth === 'full' ? 'full' : 'custom'}
              onChange={e => { const choice = e.target.value; updateRoom(r => ({ ...r, layout: { ...r.layout,
                firstRowWidth: choice === 'automatic' ? undefined : choice === 'full' ? 'full' : Math.min(project.flooring.width, Math.max(.1, layout?.firstRowWidth || project.flooring.width)) } })); }}>
              <option value="automatic">Breite automatisch planen</option>
              <option value="full">Volle Dielenbreite ({project.flooring.width} mm)</option>
              <option value="custom">Breite selbst festlegen</option>
            </select></label>
            {typeof room.layout.firstRowWidth === 'number' && <NumberField label="Breite der ersten Reihe" value={Math.min(room.layout.firstRowWidth, project.flooring.width)} min={.1} max={project.flooring.width} step={.1}
              onChange={firstRowWidth => updateRoom(r => ({ ...r, layout: { ...r.layout, firstRowWidth } }))} />}
            <div className="help-row"><HelpInfo label="Erste Reihenbreite">{room.layout.firstRowWidth === undefined ? 'Die Automatik verteilt die Breite auf beide Randreihen.' : 'Deine erste Reihenbreite bleibt fest. Die letzte Reihe passt sich an; die Längsplanung folgt deinen Vorgaben oben.'}</HelpInfo></div>
          </>}
          {room.layout.mode !== 'manual' && <div className={layout?.feasible ? 'auto-status' : 'auto-status blocked'}><Sparkles size={16} /><div><strong>{layout?.feasible ? 'Automatisch geplant' : 'Keine zulässige Verlegung gefunden'}</strong>{!layout?.feasible && layout?.warnings[0] && <p>{layout.warnings[0]}</p>}</div><HelpInfo label="Automatische Planung">Mindeststücklänge: {roomMaterial.minEndPieceLength} mm. Mindestabstand benachbarter Fugen: {roomMaterial.minJointOffset ?? 300} mm.</HelpInfo></div>}
          <details className="manual-controls"><summary>Manuell anpassen (Experten)</summary><label className="toggle-field"><input type="checkbox" checked={room.layout.mode === 'manual'} onChange={e => updateRoom(r => ({ ...r, layout: { ...r.layout, mode: e.target.checked ? 'manual' : 'automatic' } }))} />Manuelle Rasterplanung aktivieren</label>
          {room.layout.mode === 'manual' && <>
          <label className="range-field"><span>Quer-Offset <b>{format(room.layout.offsetY)} mm</b></span><input aria-label="Quer-Offset" type="range" min="0" max={project.flooring.width - .1} step=".1" value={room.layout.offsetY}
            onChange={e => updateRoom(r => ({ ...r, layout: { ...r.layout, offsetY: Number(e.target.value) } }))} /></label>
          <div className="help-row"><HelpInfo label="Quer-Offset">Verschiebt die Reihen quer zur Dielenrichtung.</HelpInfo></div>
          <NumberField label="Längs-Offset" value={room.layout.offsetX} max={project.flooring.length - .1} step={.1} onChange={offsetX => updateRoom(r => ({ ...r, layout: { ...r.layout, offsetX } }))} />
          <button className="primary full optimize-button" disabled={optimizing || !layout} onClick={() => optimize()}><Sparkles size={16} />{optimizing ? 'Varianten werden geprüft …' : 'Quer-Offset optimieren'}</button>
          <div className="help-row"><HelpInfo label="Manuelle Planung">Das Raster bleibt fest; Mindestlängen werden nicht automatisch gelöst. Für die automatische Planung die manuelle Rasterplanung ausschalten.</HelpInfo></div></>}
          </details></section>
          {computation.errors.has(room.id) && <div className="warning-card"><TriangleAlert size={18} /><p>{computation.errors.get(room.id)}</p></div>}
          {layout && <>{layout.feasible && <><section className="edge-result"><h3>Deine Randreihen</h3><div className="edge-pair"><div className={layout.firstRowWidth < roomMaterial.minRowWidth - .01 ? 'too-narrow' : ''}><span>Erste Reihe</span><strong>{format(layout.firstRowWidth)}<small>mm</small></strong></div>
            <div className={layout.lastRowWidth < roomMaterial.minRowWidth - .01 ? 'too-narrow' : ''}><span>Letzte Reihe</span><strong>{format(layout.lastRowWidth)}<small>mm</small></strong></div></div>
            <p>{Math.min(layout.firstRowWidth, layout.lastRowWidth) < roomMaterial.minRowWidth - .01 ? <TriangleAlert size={13} /> : <Check size={13} />}Ziel: mindestens {roomMaterial.minRowWidth} mm</p></section>
            <section className="quantities"><h3>Material im Überblick</h3><div className="area-number">{format(layout.coveredArea / 1e6, 2)}<small>m²</small><span>verlegte Fläche</span></div>
              <dl><div><dt>Raumfläche</dt><dd>{format(layout.roomArea / 1e6, 2)} m²</dd></div><div><dt>Ganze Dielen</dt><dd>{layout.fullBoards}</dd></div><div><dt>Dielen mit Zuschnitt</dt><dd>{layout.cutBoards}</dd></div>
                <div><dt>Reststücke wiederverwendet</dt><dd data-testid="reused-pieces">{layout.reusedPieces}</dd></div>
                <div className="total"><dt>Neue Dielen insgesamt</dt><dd data-testid="new-boards">{layout.newBoards}</dd></div><div><dt>Ausgangsmaterial</dt><dd>{format(layout.materialArea / 1e6, 2)} m²</dd></div><div><dt>Restmaterial & Schnittverlust</dt><dd>{format(layout.wastePercent)} %</dd></div><div><dt>Verbleibende Restfläche</dt><dd>{format(layout.wasteArea / 1e6, 2)} m²</dd></div><div><dt>Davon nutzbare Reststücke</dt><dd>{format(layout.remainingOffcutArea / 1e6, 2)} m²</dd></div></dl>
              {globalPlan.order.length <= 1 ? <div className="package-result"><strong>{packages ? `${packages.packages} ${packages.packages === 1 ? 'Paket' : 'Pakete'} für diesen Raum` : 'Paketinhalt fehlt'}</strong>
                {packages && <p>{layout.newBoards} Dielen + {packages.reserveBoards} Reserve</p>}</div> : <p className="hint">Paketbedarf links unter „Pakete gesamt“.</p>}
              <div className="help-row"><HelpInfo label="Materialbedarf">Pakete werden aufgerundet, mit {project.flooring.reservePercent ?? 5} % Reserve. Gerade Reststücke in voller Dielenbreite werden wiederverwendet, mit passenden Klickkanten und {project.flooring.sawKerf ?? 3} mm Schnittverlust. Schräg- und Längszuschnitte zählen als Restmaterial.</HelpInfo></div></section></>}
            {layout.warnings.length > 0 && <div className="warning-card"><TriangleAlert size={18} /><div><strong>Diese Stellen prüfen</strong><ul>{layout.warnings.map(w => <li key={w}>{w}</li>)}</ul></div></div>}
            <details className="row-details"><summary>{layout.rows.length} Reihen im Detail</summary><table><thead><tr><th>Reihe</th><th>Start / Ende (mm)</th><th>Startquelle</th><th>Endquelle</th></tr></thead><tbody>{layout.rows.map(r => {
              const boards = layout.boards.filter(b => b.row === r.index);
              return <tr key={r.index}><td>{r.index + 1}</td><td>{format(r.firstLength, 0)} / {format(r.lastLength, 0)}</td><td>{materialSource(boards[0]?.material)}</td><td>{materialSource(boards.at(-1)?.material)}</td></tr>;
            })}</tbody></table></details>
            {!!layout.offcuts.length && <details className="row-details"><summary>{layout.offcuts.length} noch verfügbare Reststücke</summary><table><thead><tr><th>Quelle</th><th>Länge (mm)</th><th>Geeignet für</th></tr></thead><tbody>{layout.offcuts.map(s => <tr key={s.id}><td>{s.sourceBoardId}</td><td>{format(s.length, 1)}</td><td>{s.edge === 'right' ? 'Reihenanfang' : 'Reihenende'}</td></tr>)}</tbody></table></details>}
          </>}
        </> : <div className="empty-results"><ScanLine size={24} /><p>{room ? 'Laminat ausgeschaltet. Kein Materialbedarf.' : 'Raum zeichnen oder auswählen.'}</p></div>}
      </aside>
    </div>
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Hinweis schließen" onClick={() => setNotice('')}><X size={17} /></button></div>}
    {roomsDialog && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="rooms-dialog-title"><button className="modal-close" aria-label="Dialog schließen" onClick={() => setRoomsDialog(false)}><X size={20} /></button>
      <span className="eyebrow">RÄUME IMPORTIEREN</span><h2 id="rooms-dialog-title">Koordinaten rein. Räume da.</h2><p>Räume werden zur aktuellen Etage hinzugefügt. Alle Koordinaten sind in Millimetern.</p><textarea aria-label="Raumdefinitionen als JSON" rows={12} value={roomsText} onChange={e => setRoomsText(e.target.value)} />
      <button className="primary full" onClick={importRooms}>Räume hinzufügen</button></div></div>}
  </div>;
}
export default App;
