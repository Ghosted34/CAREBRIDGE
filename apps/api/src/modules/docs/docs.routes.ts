import { Router } from 'express';

export const docsRouter = Router();

export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CareBridge API',
    version: '0.2.0',
    description:
      'Coordinated access to verified healthcare capacity in Lagos (dental pilot). Manages patient requests, clinic offers, real capacity slots, clinical referrals, cost estimates, clinical documents, payments, and care journeys.',
  },
  servers: [{ url: '/api/v1', description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'API is running' } },
      },
    },
    '/auth/register': {
      post: {
        summary:
          'Register a patient or provider staff account; provider staff may include `clinic` details to self-onboard a pending facility',
        responses: {
          '201': { description: 'User created (clinic sign-ups are pending verification)' },
          '400': {
            description: 'Facility details sent by a patient',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '409': {
            description: 'Email, phone or registration number already registered',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/providers/{id}/team': {
      get: {
        summary: 'List the members of a clinic (any member, operator, admin)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Team members with roles and account status' } },
      },
      post: {
        summary: 'Add or re-role a team member (clinic owner of a verified facility)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Member added, activated if they were pending' },
          '409': {
            description: 'Facility not verified, wrong role, suspended or self',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/providers/{id}/team/{userId}': {
      delete: {
        summary: 'Remove a team member (clinic owner of a verified facility)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Member removed' },
          '409': {
            description: 'Owner membership, or removing yourself',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/staff-accounts': {
      get: {
        summary: 'Search provider-staff accounts a clinic owner may invite (contact details only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Matching staff accounts' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Sign in with email and password',
        responses: { '200': { description: 'JWT token returned' } },
      },
    },
    '/requests': {
      post: {
        summary:
          'Submit a new care request with triage; optional `target_provider_id` sends it straight to a clinic the patient chose',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Request created (`provider_accepted` when directed at a clinic)' },
          '404': {
            description: 'The chosen clinic cannot take this request; nothing stored',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '422': { description: 'Emergency redirect' },
        },
      },
    },
    '/requests/{id}/matches': {
      get: {
        summary: 'Get intelligent matching score breakdown for verified providers',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Ranked providers with score breakdown' } },
      },
    },
    '/providers/{id}/slots': {
      get: {
        summary: 'List bookable appointment slots for a provider',
        responses: { '200': { description: 'List of slots' } },
      },
      post: {
        summary: 'Create a bookable slot',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Slot created' } },
      },
    },
    '/requests/{id}/referrals': {
      post: {
        summary: 'Create a clinician-to-clinician referral (needs a completed or checked-in visit)',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Referral sent' },
          '409': {
            description: 'VISIT_REQUIRED: the patient has not been seen yet',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
      get: {
        summary: 'List referrals for a request',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Referrals list' } },
      },
    },
    '/requests/{id}/estimates': {
      post: {
        summary: 'Issue a cost estimate for treatment (needs a completed or checked-in visit)',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Estimate issued' },
          '409': {
            description: 'VISIT_REQUIRED: the patient has not been seen yet',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
      get: {
        summary: 'List cost estimates for a request',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Estimates list' } },
      },
    },
    '/requests/{id}/documents/upload-url': {
      post: {
        summary: 'Request pre-signed upload URL for clinical document (photo, X-ray)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Signed upload URL and storage key' } },
      },
    },
    '/requests/{id}/payments/initialize': {
      post: {
        summary: 'Initialize payment (deposit/consultation fee) via Paystack or mock gateway',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Payment reference and authorization URL' } },
      },
    },
    '/admin/stuck-requests': {
      get: {
        summary: 'SLA monitoring: list stuck care requests',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Stuck requests with SLA status' } },
      },
    },
    '/admin/audit-logs': {
      get: {
        summary: 'Audit log viewer with actor, action, and entity filters',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Paginated audit logs' } },
      },
    },
  },
};

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openapiSpec);
});

docsRouter.get('/docs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>CareBridge API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body { margin: 0; background: #f8fafc; font-family: sans-serif; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    };
  </script>
</body>
</html>`);
});
