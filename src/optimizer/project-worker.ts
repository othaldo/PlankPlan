import { optimizeProject } from './project';
import type { Project } from '../model/types';
self.onmessage = (event: MessageEvent<Project>) => {
  try {
    const plan = optimizeProject(event.data, (completed, total) => self.postMessage({ completed, total }));
    self.postMessage({ plan });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
