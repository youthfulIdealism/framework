import { Request, Response, NextFunction, Router } from "express";

import { Auth_Data } from "../types/auth_data.js"

export type Register_Configuration = {
    limit?: number,
    auth_fetcher: (req: Request, res: Response) => Promise<Auth_Data>,
    api_url_prefix?: string,
    intermediary_layers: string[],
}