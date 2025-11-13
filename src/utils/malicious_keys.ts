export function detect_malicious_keys(input: any): any {
    if(Array.isArray(input)){
        input.map(detect_malicious_keys);
    }

    if(typeof input === 'object' && input !== null){
        for(let [key, value] of Object.entries(input)){
            if(key.trim().startsWith('$')) { throw new Error(`Invalid key detected: ${key}`)}
            detect_malicious_keys(value);
        }
    }
}