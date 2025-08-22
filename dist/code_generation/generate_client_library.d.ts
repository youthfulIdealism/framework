import { F_Collection_Registry } from "../F_Collection_Registry.js";
export declare function generate_client_library<Collections>(path: string, collection_registry: F_Collection_Registry<Collections>): Promise<void>;
export declare function get_type_name(collection_id: string, suffix?: string): string;
