import { describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from '../../src/modules/notifications/notificationDispatcher.js';
import { WebhookNotificationProvider } from '../../src/modules/notifications/webhookNotificationProvider.js';

describe('Notification System', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  it('formats generic payload for webhook correctly', async () => {
    let capturedBody = null;
    const mockFetch = vi.fn(async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => 'OK' };
    });

    const provider = new WebhookNotificationProvider({
      url: 'https://webhook.site/test-uuid',
      logger: mockLogger,
      fetchFn: mockFetch,
    });

    const result = await provider.send({
      type: 'GATE2_RECHECK',
      subject: 'Action Required: Recheck Application',
      text: 'Please review and confirm submission',
      metadata: { applicationId: 'app-999' },
    });

    expect(result.delivered).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedBody).toHaveProperty('subject', 'Action Required: Recheck Application');
    expect(capturedBody).toHaveProperty('type', 'GATE2_RECHECK');
    expect(capturedBody.metadata.applicationId).toBe('app-999');
  });

  it('skips channels when not configured', async () => {
    const dispatcher = new NotificationDispatcher({
      channels: 'webhook',
      emailConfig: { from: 'agent@example.com' },
      webhookConfig: { url: '' }, // Not configured
      logger: mockLogger,
    });

    const result = await dispatcher.send({
      subject: 'Test Notification',
      text: 'Test content',
    });

    expect(result.email).toBeUndefined();
    expect(result.webhook).toEqual({ delivered: false, reason: 'WEBHOOK_NOT_CONFIGURED' });
  });

  it('dispatches across enabled channels', async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'OK' }));
    const dispatcher = new NotificationDispatcher({
      channels: 'webhook',
      emailConfig: { from: 'agent@example.com' },
      webhookConfig: { url: 'https://hooks.slack.com/services/xxx', fetchFn: mockFetch },
      logger: mockLogger,
    });

    const result = await dispatcher.send({
      type: 'HIGH_MATCH',
      subject: 'High Match Found',
      text: 'Match score: 95%',
    });

    expect(result.webhook.delivered).toBe(true);
  });
});
