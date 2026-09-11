export class WebhookNotificationProvider {
  /** @param {{ url?: string, logger: import('pino').Logger, fetchFn?: typeof fetch }} config */
  constructor(config) {
    this.url = config.url;
    this.logger = config.logger;
    this.fetchFn = config.fetchFn || globalThis.fetch;
  }

  /**
   * @param {{ to?: string, subject: string, text: string, type?: string, metadata?: object }} message
   */
  async send(message) {
    if (!this.url) {
      this.logger.warn({ subject: message.subject }, 'Webhook notification skipped because WEBHOOK_NOTIFICATION_URL is not configured');
      return { delivered: false, reason: 'WEBHOOK_NOT_CONFIGURED' };
    }

    try {
      const payload = {
        text: `*${message.subject}*\n${message.text}`,
        subject: message.subject,
        message: message.text,
        type: message.type,
        timestamp: new Date().toISOString(),
        metadata: message.metadata ?? {},
      };

      const response = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook endpoint returned HTTP ${response.status}`);
      }

      this.logger.info({ subject: message.subject }, 'Webhook notification delivered');
      return { delivered: true };
    } catch (error) {
      this.logger.error({ error: error.message, subject: message.subject }, 'Webhook notification failed');
      return { delivered: false, error: error.message };
    }
  }
}
