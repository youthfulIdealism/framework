export declare class Cache<T> {
    timeout_map: Map<string, NodeJS.Timeout>;
    base_cache: Map<string, T>;
    refetch_map: Map<string, Promise<T>>;
    duration: number;
    constructor(duration: number);
    get(key: string): T;
    set(key: string, value: T): void;
    reset_expiry_timer_for(key: string): void;
    delete(key: string): void;
    first_get_then_fetch(key: string, fetch_function: () => Promise<T>): Promise<T>;
    first_fetch_then_refresh(key: string, fetch_function: () => Promise<T>): Promise<T>;
}
