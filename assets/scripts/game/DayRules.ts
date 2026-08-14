/** Shared day-loop constants. No component imports (avoids cycles). */

export const STAMINA_MAX = 100;
export const STAMINA_PASSOUT = 70;
export const SNACK_STAMINA = 40;
/** Real seconds per in-game minute. */
export const SEC_PER_GAME_MIN = 0.7;
/** In-game day length (starts 06:00 → ends ~02:00). */
export const DAY_MINUTES = 20 * 60;

export const STAMINA_COST = {
    pull: 1,
    harvest: 1,
    water: 2,
    till: 4,
    dig: 4,
    chop: 5,
    fish: 8,
} as const;

export type PlotPhase = 'soil' | 'tilled' | 'crop';

export type PlotSnapshot = {
    key: string;
    phase: PlotPhase;
    stage: number;
    watered: boolean;
};

export type ClockState = {
    day: number;
    season: number;
    weekday: number;
    /** Minutes since 06:00. */
    minutes: number;
    paused: boolean;
};

export function defaultClock(): ClockState {
    return { day: 2, season: 0, weekday: 2, minutes: 0, paused: false };
}

export function clockHour(minutes: number): number {
    return (6 + Math.floor(minutes / 60)) % 24;
}

export function clockMinute(minutes: number): number {
    return minutes % 60;
}

export function advancePlotsOvernight(plots: PlotSnapshot[]): PlotSnapshot[] {
    return plots.map((p) => {
        if (p.phase === 'crop' && p.watered && p.stage < 2) {
            return { ...p, stage: 2 };
        }
        return p;
    });
}

export function rollCalendar(clock: ClockState): ClockState {
    let day = clock.day + 1;
    let season = clock.season;
    const weekday = (clock.weekday + 1) % 7;
    if (day > 28) {
        day = 1;
        season = (season + 1) % 4;
    }
    return { day, season, weekday, minutes: 0, paused: clock.paused };
}
