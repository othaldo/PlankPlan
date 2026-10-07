import { optimizeTransverse } from './transverse';
import type { Flooring, Room } from '../model/types';
self.onmessage = (event: MessageEvent<{ room: Room; flooring: Flooring }>) => {
  try { const result = optimizeTransverse(event.data.room, event.data.flooring);
    self.postMessage({ offsetY: result.offsetY, candidates: result.candidates });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
