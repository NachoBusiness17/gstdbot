/**
 * Local usage instrumentation only.
 * This file does not create backed GSTD balances, rewards or on-chain receipts.
 * Real money uses the platform ledger with one 85/10/5 accepted-work split.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const LEDGER_FILE = join(
    process.env.GSTD_CONFIG_DIR || '/home/bot/.config/gstdbot',
    'fees_ledger.json'
);

// ─── Fee rates (GSTD) ─────────────────────────────────────────────
export const FEE_RATES = {
    inference_per_request: 0.001,    // per AI query
    inference_per_1k_tokens: 0.0005, // additional per 1K output tokens
    storage_per_mb_day: 0.00001,     // per MB stored per day
    relay_per_gb: 0.005,             // per GB relayed
    pin_per_mb_day: 0.000005,        // per MB pinned per day
};

export type FeeType = 'inference' | 'storage' | 'relay' | 'pin';

export interface FeeEvent {
    id:            string;
    type:          FeeType;
    total:         number;    // total GSTD fee
    node_operator: number;    // 90%
    treasury:      number;    // 10%
    description:   string;
    metadata:      Record<string, any>;
    timestamp:     string;
    settled_chain: boolean;   // true when sent to TON
    tx_hash?:      string;
}

export interface ReserveStats {
    treasury_gstd:      number;   // 10% accumulated for protocol
    node_earnings_gstd: number;   // 90% paid to operators
    total_fees_gstd:    number;
    total_events:       number;
    by_type: Record<FeeType, { total: number; events: number }>;
    settled_gstd:       number;   // sent to chain
    pending_gstd:       number;   // not yet settled
    first_event?:       string;
    last_event?:        string;
}

// ─── Fee Ledger ───────────────────────────────────────────────────
export class FeeLedger {
    private events: FeeEvent[] = [];
    private totals = {
        node_operator: 0,
        treasury:      0,
        total:         0,
        settled:       0,
    };
    private byType: Record<FeeType, { total: number; events: number }> = {
        inference: { total: 0, events: 0 },
        storage:   { total: 0, events: 0 },
        relay:     { total: 0, events: 0 },
        pin:       { total: 0, events: 0 },
    };
    private onNodeEarning: ((amount: number, type: FeeType) => void) | null = null;

    constructor() {
        this.load();
    }

    /** Hook to notify RevenueEngine when node_operator share is credited */
    onNodeEarned(cb: (amount: number, type: FeeType) => void): void {
        this.onNodeEarning = cb;
    }

    // ─── Record fees ──────────────────────────────────────────────

    /** AI inference completed */
    chargeInference(model: string, tokens: number): FeeEvent {
        const base    = FEE_RATES.inference_per_request;
        const tokenFee = Math.floor(tokens / 1000) * FEE_RATES.inference_per_1k_tokens;
        const total   = Math.round((base + tokenFee) * 1e6) / 1e6;
        return this.record('inference', total, `AI inference (${model}, ${tokens} tokens)`, { model, tokens });
    }

    /** File uploaded to IPFS storage */
    chargeStorage(sizeBytes: number, durationDays: number): FeeEvent {
        const mb    = sizeBytes / (1024 * 1024);
        const total = Math.round(mb * durationDays * FEE_RATES.storage_per_mb_day * 1e6) / 1e6;
        return this.record('storage', total, `Storage ${mb.toFixed(2)} MB × ${durationDays}d`, { size_bytes: sizeBytes, days: durationDays });
    }

    /** CID pinned on this node */
    chargePin(sizeBytes: number, durationDays: number): FeeEvent {
        const mb    = sizeBytes / (1024 * 1024);
        const total = Math.round(mb * durationDays * FEE_RATES.pin_per_mb_day * 1e6) / 1e6;
        return this.record('pin', total, `Pin ${mb.toFixed(2)} MB × ${durationDays}d`, { size_bytes: sizeBytes, days: durationDays });
    }

    /** Data relayed through this node */
    chargeRelay(bytes: number): FeeEvent {
        const gb    = bytes / (1024 * 1024 * 1024);
        const total = Math.round(gb * FEE_RATES.relay_per_gb * 1e6) / 1e6;
        return this.record('relay', total, `Relay ${gb.toFixed(3)} GB`, { bytes });
    }

    // ─── Core ─────────────────────────────────────────────────────

    private record(type: FeeType, total: number, description: string, metadata: Record<string, any>): FeeEvent {
        const node_operator = 0; // Unfunded local activity is usage only, never a token claim.
        const treasury = 0;
        total = 0;

        const event: FeeEvent = {
            id:            `${type}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
            type, total, node_operator, treasury,
            description, metadata,
            timestamp:     new Date().toISOString(),
            settled_chain: false,
        };

        this.events.push(event);

        this.totals.node_operator += node_operator;
        this.totals.treasury      += treasury;
        this.totals.total         += total;
        this.byType[type].total   += total;
        this.byType[type].events  += 1;



        if (this.events.length % 10 === 0) this.save();

        return event;
    }

    // ─── Stats & access ───────────────────────────────────────────

    getStats(): ReserveStats {
        return {
            treasury_gstd:      0, // Local activity is not backed monetary accounting.
            node_earnings_gstd: 0, // Local activity is not backed monetary accounting.
            total_fees_gstd:    0, // Local activity is not backed monetary accounting.
            total_events:       this.events.length,
            by_type:            { ...this.byType },
            settled_gstd:       0, // Local activity is not backed monetary accounting.
            pending_gstd:       0, // Local activity is not backed monetary accounting.
            first_event:        this.events[0]?.timestamp,
            last_event:         this.events[this.events.length - 1]?.timestamp,
        };
    }

    getRecentEvents(limit = 50): FeeEvent[] {
        return this.events.slice(-limit).reverse().map(event=>({...event,total:0,node_operator:0,treasury:0,metadata:{...event.metadata,legacy_estimate_gstd:event.total,monetary_claim:false}}));
    }

    /** Mark treasury portion as settled (sent to TON) */
    markSettled(_amount: number, _txHash: string): void {
        throw new Error('Local usage estimates cannot be settled as tokens; use the backed platform ledger.');
    }

    // ─── Persistence ──────────────────────────────────────────────

    private load(): void {
        try {
            if (!existsSync(LEDGER_FILE)) return;
            const raw = JSON.parse(readFileSync(LEDGER_FILE, 'utf-8'));
            this.events = raw.events || [];
            // Migrate old gold_reserve field → treasury
            if (raw.totals) {
                this.totals.node_operator = raw.totals.node_operator || 0;
                this.totals.treasury      = raw.totals.treasury || raw.totals.gold_reserve || 0;
                this.totals.total         = raw.totals.total || 0;
                this.totals.settled       = raw.totals.settled || 0;
            }
            this.byType = raw.by_type || this.byType;
        } catch { /* corrupt file → start fresh */ }
    }

    save(): void {
        try {
            writeFileSync(LEDGER_FILE, JSON.stringify({
                events:  this.events.slice(-10_000),
                totals:  this.totals,
                by_type: this.byType,
            }, null, 2), 'utf-8');
        } catch { /* ignore */ }
    }
}
