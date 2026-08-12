import { ENTRANCE_LIFECYCLE_PORTS } from '../nodes/modifierNodes';

export interface LifecycleSpec {
  portIndex: number;
  portName: string;
  methodName: string;
  params: string;
  alwaysEmit: boolean;
}

export function getLifecycleSpecs(): LifecycleSpec[] {
  return ENTRANCE_LIFECYCLE_PORTS.map((p, i) => ({
    portIndex: i,
    portName: p.name,
    methodName: p.method,
    params: p.params || '',
    alwaysEmit: !!p.alwaysEmit,
  }));
}
