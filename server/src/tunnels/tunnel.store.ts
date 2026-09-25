import { TunnelRecord, ActivityLogEntry } from './tunnel.model.js';

export interface ITunnelStore {
  get(id: string): Promise<TunnelRecord | null>;
  set(record: TunnelRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
  getAll(): Promise<TunnelRecord[]>;
  getActive(): Promise<TunnelRecord[]>;
  recordActivity(entry: ActivityLogEntry): Promise<void>;
  getActivity(limit?: number): Promise<ActivityLogEntry[]>;
}

export class MemoryTunnelStore implements ITunnelStore {
  private tunnels = new Map<string, TunnelRecord>();
  private activityLog: ActivityLogEntry[] = [];
  private maxActivityEntries = 1000;

  async get(id: string): Promise<TunnelRecord | null> {
    return this.tunnels.get(id) || null;
  }

  async set(record: TunnelRecord): Promise<void> {
    this.tunnels.set(record.id, { ...record });
  }

  async delete(id: string): Promise<boolean> {
    return this.tunnels.delete(id);
  }

  async getAll(): Promise<TunnelRecord[]> {
    return Array.from(this.tunnels.values());
  }

  async getActive(): Promise<TunnelRecord[]> {
    const now = Date.now();
    return Array.from(this.tunnels.values()).filter(
      (t) => t.status !== 'expired' && t.expiresAt > now
    );
  }

  async recordActivity(entry: ActivityLogEntry): Promise<void> {
    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxActivityEntries) {
      this.activityLog.pop();
    }
  }

  async getActivity(limit: number = 100): Promise<ActivityLogEntry[]> {
    return this.activityLog.slice(0, limit);
  }
}

export const tunnelStore = new MemoryTunnelStore();
