import { useState } from 'react';
import type { SetStateAction } from 'react';
import type { Project } from './types';

export function useProjectHistory(initial: Project) {
  const [state, setState] = useState({ project: initial, past: [] as Project[], future: [] as Project[] });
  function setProject(action: SetStateAction<Project>) {
    setState(s => {
      const next = typeof action === 'function' ? action(s.project) : action;
      if (next === s.project) return s;
      return { project: next, past: [...s.past.slice(-29), s.project], future: [] };
    });
  }
  function undo() { setState(s => s.past.length ? { project: s.past.at(-1)!, past: s.past.slice(0, -1), future: [s.project, ...s.future] } : s); }
  function redo() { setState(s => s.future.length ? { project: s.future[0], past: [...s.past, s.project], future: s.future.slice(1) } : s); }
  return { project: state.project, setProject, undo, redo, canUndo: !!state.past.length, canRedo: !!state.future.length };
}
