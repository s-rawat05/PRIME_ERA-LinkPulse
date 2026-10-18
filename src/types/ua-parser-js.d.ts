// Minimal typings for ua-parser-js 1.x (MIT). v2 ships types but is AGPL-licensed, so v1 is pinned.
declare module "ua-parser-js" {
  export interface IResult {
    ua: string;
    browser: { name?: string; version?: string; major?: string };
    device: { model?: string; type?: string; vendor?: string };
    engine: { name?: string; version?: string };
    os: { name?: string; version?: string };
    cpu: { architecture?: string };
  }
  export class UAParser {
    constructor(ua?: string);
    getResult(): IResult;
  }
}
