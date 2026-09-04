/**
 * @file auth.middleware.ts
 * @description Authentication & Authorization middleware.
 * Verifies JWT tokens in incoming Request authorization headers and attaches decoded user payload to Express Request.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string | null;
    role: string;
    walletAddress?: string | null;
    isPro?: boolean;
  };
}

/**
 * Middleware to enforce authentication via Bearer JWT token
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access Denied: Missing authentication token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedRequest['user'];
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    return;
  }
}

/**
 * Middleware to restrict a route to ADMIN-role sessions. Must run after
 * authenticateToken (relies on req.user being set).
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }
  next();
}

/**
 * Middleware to attach the authenticated user when a valid Bearer JWT is present.
 * Unlike authenticateToken, requests without a token (or with an invalid one)
 * continue as anonymous — used on publicly-browsable routes that must still
 * hide owner-private records (e.g. draft jobs).
 */
export function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedRequest['user'];
    req.user = decoded;
  } catch {
    // Invalid or expired token — treat the request as anonymous.
  }
  next();
}
