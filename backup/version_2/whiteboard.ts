


export class Whiteboard {

    data: Map<string, any>

    constructor(){
        this.data = new Map();
    }

    async get<W>(key: string, value_fetcher: () => Promise<W>): Promise<W> {
        if(this.data.has(key)){
            return this.data.get(key) as W;
        }
        let value = await value_fetcher();
        this.data.set(key, value);
        return value;
    }
}