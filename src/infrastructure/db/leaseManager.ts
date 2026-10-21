import type { LeaseRecord } from '@/domain/contracts';
import { db, type LedynDatabase } from '@/infrastructure/db/database';
import { AppError, toAppError } from '@/shared/errors';

export const ACTIVE_READING_LEASE_KEY = 'active-reading-session';
export const LEASE_TTL_MS = 10_000;
export const LEASE_HEARTBEAT_MS = 2_000;

export interface LeaseBroadcastMessage {
  type: 'LEASE_ACQUIRED' | 'LEASE_RELEASED';
  ownerId: string;
  sessionId: string;
  documentId: string;
  revision: number;
  timestamp: number;
}

/**
 * Gerencia exclusão mútua de leitura ativa entre abas da mesma origem.
 * A fonte de verdade é sempre a transação no Dexie (`leases` store);
 * `BroadcastChannel` é usado como notificação complementar imediata quando disponível.
 */
export class ReadingLeaseManager {
  private readonly database: LedynDatabase;
  private readonly ownerId: string;
  private readonly nowFn: () => number;
  private channel: BroadcastChannel | null = null;
  private onConflictCallback?: () => void;

  constructor(options: {
    ownerId: string;
    database?: LedynDatabase;
    nowFn?: () => number;
    enableBroadcast?: boolean;
    onConflict?: () => void;
  }) {
    this.ownerId = options.ownerId;
    this.database = options.database ?? db;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.onConflictCallback = options.onConflict;

    if (
      (options.enableBroadcast ?? true) &&
      typeof BroadcastChannel !== 'undefined'
    ) {
      try {
        this.channel = new BroadcastChannel('ledyn-reading-lease');
        this.channel.onmessage = (event: MessageEvent<LeaseBroadcastMessage>) => {
          const data = event.data;
          if (
            data &&
            data.type === 'LEASE_ACQUIRED' &&
            data.ownerId !== this.ownerId
          ) {
            this.onConflictCallback?.();
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }

  getOwnerId(): string {
    return this.ownerId;
  }

  async acquireOrRenewLease(
    sessionId: string,
    documentId: string,
  ): Promise<LeaseRecord> {
    try {
      const now = this.nowFn();
      const record = await this.database.transaction(
        'rw',
        this.database.leases,
        async () => {
          const existing = await this.database.leases.get(
            ACTIVE_READING_LEASE_KEY,
          );

          if (
            existing &&
            existing.ownerId !== this.ownerId &&
            existing.expiresAt > now
          ) {
            throw new AppError(
              'SESSION_LOCKED',
              'Já existe uma leitura ativa em outra aba.',
            );
          }

          const nextRevision = (existing?.revision ?? 0) + 1;
          const updated: LeaseRecord = {
            key: ACTIVE_READING_LEASE_KEY,
            ownerId: this.ownerId,
            sessionId,
            documentId,
            expiresAt: now + LEASE_TTL_MS,
            revision: nextRevision,
          };

          await this.database.leases.put(updated);
          return updated;
        },
      );

      this.postBroadcast({
        type: 'LEASE_ACQUIRED',
        ownerId: this.ownerId,
        sessionId,
        documentId,
        revision: record.revision,
        timestamp: now,
      });

      return record;
    } catch (error) {
      throw toAppError(error, 'STORAGE_UNAVAILABLE');
    }
  }

  async verifyOwnership(): Promise<boolean> {
    const now = this.nowFn();
    const existing = await this.database.leases.get(ACTIVE_READING_LEASE_KEY);
    if (!existing) {
      return false;
    }
    return existing.ownerId === this.ownerId && existing.expiresAt > now;
  }

  async releaseLeaseIfOwned(): Promise<void> {
    try {
      const now = this.nowFn();
      let releasedSessionId = '';
      let releasedDocId = '';
      let revision = 0;

      await this.database.transaction('rw', this.database.leases, async () => {
        const existing = await this.database.leases.get(
          ACTIVE_READING_LEASE_KEY,
        );
        if (existing && existing.ownerId === this.ownerId) {
          releasedSessionId = existing.sessionId;
          releasedDocId = existing.documentId;
          revision = existing.revision;
          await this.database.leases.delete(ACTIVE_READING_LEASE_KEY);
        }
      });

      if (releasedSessionId) {
        this.postBroadcast({
          type: 'LEASE_RELEASED',
          ownerId: this.ownerId,
          sessionId: releasedSessionId,
          documentId: releasedDocId,
          revision,
          timestamp: now,
        });
      }
    } catch {
      // Silencioso no cleanup/unload
    }
  }

  destroy(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // Ignora erro de fechamento
      }
      this.channel = null;
    }
  }

  private postBroadcast(msg: LeaseBroadcastMessage): void {
    if (!this.channel) {
      return;
    }
    try {
      this.channel.postMessage(msg);
    } catch {
      // Ignora falha de BroadcastChannel
    }
  }
}
