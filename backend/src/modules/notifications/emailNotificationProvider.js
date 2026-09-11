import nodemailer from 'nodemailer';
export class EmailNotificationProvider {
  /** @param {{host?:string,port?:number,user?:string,password?:string,from:string,logger:import('pino').Logger}} config */
  constructor(config) { this.from = config.from; this.logger = config.logger; this.transport = config.host ? nodemailer.createTransport({ host: config.host, port: config.port ?? 587, auth: config.user ? { user: config.user, pass: config.password } : undefined }) : null; }
  /** @param {{to:string,subject:string,text:string}} message */
  async send(message) { if (!this.transport) { this.logger.warn({ subject: message.subject }, 'Email notification skipped because SMTP is not configured'); return { delivered: false, reason: 'SMTP_NOT_CONFIGURED' }; } await this.transport.sendMail({ from: this.from, ...message }); return { delivered: true }; }
}
