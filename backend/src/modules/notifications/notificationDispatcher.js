import { EmailNotificationProvider } from './emailNotificationProvider.js';
import { WebhookNotificationProvider } from './webhookNotificationProvider.js';

export class NotificationDispatcher {
  /**
   * @param {{
   *   channels?: string,
   *   emailConfig: { host?: string, port?: number, user?: string, password?: string, from: string },
   *   webhookConfig: { url?: string },
   *   logger: import('pino').Logger
   * }} config
   */
  constructor(config) {
    this.channels = (config.channels ?? 'email,webhook')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    this.logger = config.logger;

    this.emailProvider = new EmailNotificationProvider({
      ...config.emailConfig,
      logger: this.logger,
    });

    this.webhookProvider = new WebhookNotificationProvider({
      ...config.webhookConfig,
      logger: this.logger,
    });
  }

  /**
   * Dispatches a message to all enabled channels.
   * @param {{ to?: string, subject: string, text: string, type?: string, metadata?: object }} message
   */
  async send(message) {
    const results = {};

    if (this.channels.includes('email')) {
      results.email = await this.emailProvider.send({
        to: message.to ?? 'candidate@example.com',
        subject: message.subject,
        text: message.text,
      });
    }

    if (this.channels.includes('webhook')) {
      results.webhook = await this.webhookProvider.send(message);
    }

    this.logger.info(
      { subject: message.subject, type: message.type, channels: this.channels, results },
      'Notification dispatched across channels'
    );

    return results;
  }
}
