export class BrowserJobSource {
  constructor(name) { this.name = name; this.type = 'browser'; }
  async discover() { throw new Error('Browser job discovery requires an explicitly reviewed public-site adapter and is disabled by default.'); }
}
