import { optimizeTransverse } from './transverse';
import { findFixedStagger } from './automatic';
import type { Flooring, Room } from '../model/types';
self.onmessage = (event: MessageEvent<{ room: Room; flooring: Flooring; kind?: 'transverse' | 'fixed-start' }>) => {
  try {
    if (event.data.kind === 'fixed-start') {
      const result = findFixedStagger(event.data.room, event.data.flooring);
      self.postMessage(result.fixedStagger === undefined ? { error: result.layout.warnings.join(' ') } : { fixedStagger: result.fixedStagger, candidates: result.candidates });
      return;
    }
    const result = optimizeTransverse(event.data.room, event.data.flooring);
    self.postMessage({ offsetY: result.offsetY, candidates: result.candidates });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
