import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, path: string) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
        const text = await res.text();
        resolve({ status: res.status, body: text });
      } finally {
        server.close();
      }
    });
  });
}

describe('Registration Flow UX (Sprint 14)', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // === Form Structure ===

  test('registration uses a form element', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="register-form"');
    expect(res.body).toContain('<form');
    expect(res.body).toContain('onsubmit');
  });

  test('registration form has submit button with id', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="reg-submit-btn"');
    expect(res.body).toContain('type="submit"');
  });

  // === Progress Indicator ===

  test('registration form has progress bar', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('register-progress');
    expect(res.body).toContain('register-step');
    expect(res.body).toContain('id="reg-step-1"');
    expect(res.body).toContain('id="reg-step-3"');
  });

  test('progress steps have CSS styles', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.register-progress');
    expect(res.body).toContain('.register-step');
    expect(res.body).toContain('.register-step.filled');
    expect(res.body).toContain('.register-step.active');
  });

  test('updateRegProgress function exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('function updateRegProgress');
  });

  // === Validation ===

  test('required fields are marked with asterisks', async () => {
    const res = await request(app, '/');
    // Agent name, description, endpoint are required
    const requiredCount = (res.body.match(/color:#ff4444">\*/g) || []).length;
    expect(requiredCount).toBeGreaterThanOrEqual(3);
  });

  test('required fields have aria-required attribute', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-required="true"');
  });

  test('endpoint field has type=url', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('type="url"');
    expect(res.body).toContain('id="reg-endpoint"');
  });

  test('validateField function exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('function validateField');
  });

  test('field error elements exist for required fields', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="err-name"');
    expect(res.body).toContain('id="err-description"');
    expect(res.body).toContain('id="err-endpoint"');
  });

  test('field error CSS classes exist', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.field-error');
    expect(res.body).toContain('.field-error.visible');
  });

  test('valid/invalid input CSS classes exist', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.register-panel input.invalid');
    expect(res.body).toContain('.register-panel input.valid');
  });

  test('inline validation on input events', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain("oninput=\"validateField(this, 'name')\"");
    expect(res.body).toContain("oninput=\"validateField(this, 'description')\"");
    expect(res.body).toContain("oninput=\"validateField(this, 'endpoint')\"");
  });

  // === Field Hints ===

  test('registration form has field hints', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('class="field-hint"');
    expect(res.body).toContain('A2A endpoint');
  });

  test('field hint CSS exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.field-hint');
  });

  // === Error Recovery ===

  test('registration uses AbortController for timeout', async () => {
    const res = await request(app, '/');
    // Check the registerAgent function uses AbortController
    expect(res.body).toContain('AbortController');
    expect(res.body).toContain('Registration timed out');
  });

  test('submit button shows loading spinner during registration', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('loading-spinner');
    expect(res.body).toContain('Registering with 6 HCS standards');
  });

  test('form resets after successful registration', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('register-form');
    expect(res.body).toContain('.reset()');
  });

  // === Success Feedback ===

  test('successful registration shows HCS-20 points info', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('+100 HCS-20 registration points');
  });

  test('success result has animation class', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('success-overlay');
    expect(res.body).toContain('.success-overlay');
  });
});
