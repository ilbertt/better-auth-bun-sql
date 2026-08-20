const ONE_HOUR_MS = 3_600_000;

export function newUser() {
  const id = Bun.randomUUIDv7();
  return {
    id,
    name: `user-${id}`,
    email: `user-${id}@email.com`,
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function newSession(userId: string) {
  const id = Bun.randomUUIDv7();
  return {
    id,
    expiresAt: new Date(Date.now() + ONE_HOUR_MS),
    token: Bun.randomUUIDv7(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'Some User Agent',
    userId,
  };
}

export function newVerification(identifier: string) {
  return {
    id: Bun.randomUUIDv7(),
    identifier,
    value: Bun.randomUUIDv7(),
    expiresAt: new Date(Date.now() + ONE_HOUR_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
