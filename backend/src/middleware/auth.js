import { verifyToken } from '../modules/auth/authService.js';

export function authMiddleware(jwtSecret) {
  return (request, response, next) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication token required.',
      });
    }

    const token = authHeader.slice(7).trim();
    try {
      const decoded = verifyToken(token, jwtSecret);
      request.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name ?? null,
      };
      next();
    } catch {
      return response.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token.',
      });
    }
  };
}
