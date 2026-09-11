/** Source adapter shape for a company-provided public careers API or feed. */
export class CompanyCareerSource {
  /** @param {{name:string, endpoint:string, mapJob:(raw:unknown)=>object[]}} config */
  constructor(config) { Object.assign(this, config); this.type = 'company-careers'; }
  async discover() { const response = await fetch(this.endpoint); if (!response.ok) throw new Error(`Company source returned ${response.status}`); return this.mapJob(await response.json()); }
}
