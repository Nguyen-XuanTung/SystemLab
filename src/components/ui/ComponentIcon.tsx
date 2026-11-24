import {
  Activity,
  Copy,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  ListOrdered,
  Network,
  ShieldAlert,
} from 'lucide-react';
import type { ComponentType } from '@/engine/models/types';

interface ComponentIconProps {
  type: ComponentType;
  className?: string;
}

export function ComponentIcon({ type, className = 'h-4 w-4' }: ComponentIconProps) {
  switch (type) {
    case 'client':
      return <Globe className={className} aria-hidden="true" />;
    case 'load_balancer':
      return <Network className={className} aria-hidden="true" />;
    case 'api_gateway':
      return <Activity className={className} aria-hidden="true" />;
    case 'app_server':
      return <Cpu className={className} aria-hidden="true" />;
    case 'cache':
      return <Layers className={className} aria-hidden="true" />;
    case 'database':
      return <Database className={className} aria-hidden="true" />;
    case 'message_queue':
      return <ListOrdered className={className} aria-hidden="true" />;
    case 'worker':
      return <HardDrive className={className} aria-hidden="true" />;
    case 'circuit_breaker':
      return <ShieldAlert className={className} aria-hidden="true" />;
    case 'read_replica':
      return <Copy className={className} aria-hidden="true" />;
  }
}
