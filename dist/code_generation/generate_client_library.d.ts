import { F_Collection_Registry } from "../F_Collection_Registry.js";
export declare function generate_client_library<Collections>(path: string, collection_registry: F_Collection_Registry<Collections>, service_name?: string): Promise<void>;
export declare function get_type_name(collection_id: string, suffix?: string): string;
export declare function uppercase(str: string): string;
