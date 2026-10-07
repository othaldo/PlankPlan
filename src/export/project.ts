import type { Project } from '../model/types';
export const serializeProject = (project: Project): string => JSON.stringify(project, null, 2);
export function downloadProject(project: Project) {
  const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `${project.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '-') || 'plankplan'}.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
