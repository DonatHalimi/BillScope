import { AppError } from '../lib/http-errors.js';

export async function profileRoutes(app) {
  app.patch('/', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 60 },
          lastName: { type: 'string', minLength: 1, maxLength: 60 },
          phone: { type: 'string', minLength: 7, maxLength: 24, pattern: '^\\+?[0-9][0-9() .-]{5,22}$' },
          preferredCurrency: { type: 'string', enum: ['EUR', 'USD', 'GBP', 'JPY', 'CHF'] }
        }
      }
    }
  }, async (request) => {
    const update = { ...request.body };
    for (const key of ['firstName', 'lastName', 'phone']) {
      if (update[key] !== undefined) {
        update[key] = update[key].trim();
        if (!update[key]) throw new AppError(400, `${key} cannot be blank.`, 'PROFILE_FIELD_REQUIRED');
      }
    }
    const user = await app.prisma.user.update({ where: { id: request.user.sub }, data: update });
    if (!user.isActive) throw new AppError(401, 'Account is unavailable.', 'ACCOUNT_UNAVAILABLE');
    return { user: {
      id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email,
      phone: user.phone, role: user.role, preferredCurrency: user.preferredCurrency, createdAt: user.createdAt
    } };
  });
}
