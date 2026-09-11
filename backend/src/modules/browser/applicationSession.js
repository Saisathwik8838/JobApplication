export class ApplicationSession {
  /** @param {{page:import('playwright').Page, job:object, application:object, answers:object[], resumePath?:string}} input */
  constructor(input) { Object.assign(this, input); this.events = []; }
  /** @param {string} event @param {object} [data] */
  record(event, data = {}) { this.events.push({ event, data, timestamp: new Date().toISOString() }); }
}
