/**
 * @file auth.controller.ts
 * @description Authentication & Profile Management Controller.
 * Handles Email/Password registration, Login, JWT verification, Profile
 * management, and the post-signup onboarding (profile setup) flow.
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.config';
import { env } from '../config/env.config';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

/**
 * Fields safe to return to the client.
 * NEVER includes passwordHash or siweNonce.
 */
function toPublicProfile(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    walletAddress: user.walletAddress,
    bio: user.bio,
    location: user.location,
    rating: user.rating,
    portfolioLinks: user.portfolioLinks,
    skills: user.skills,
    jobsPostedCount: user.jobsPostedCount,
    jobsAppliedCount: user.jobsAppliedCount,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  };
}

/**
 * Auth-response user shape (matches GET /api/auth/me and the login/signup
 * payloads). Never leaks secret columns.
 */
function toAuthUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    walletAddress: user.walletAddress,
    bio: user.bio,
    location: user.location,
    rating: user.rating,
    portfolioLinks: user.portfolioLinks,
    skills: user.skills,
    isPro: user.isPro,
    jobsPostedCount: user.jobsPostedCount,
    jobsAppliedCount: user.jobsAppliedCount,
    onboardingCompleted: user.onboardingCompleted,
  };
}

/** Editable profile fields shared by PUT /profile and onboarding completion. */
function sanitizeProfileInput(body: any): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body?.name !== undefined) {
    data.name = String(body.name).trim() || null;
  }
  if (body?.bio !== undefined) {
    data.bio = String(body.bio).trim().slice(0, 1000) || null;
  }
  if (body?.location !== undefined) {
    data.location = String(body.location).trim().slice(0, 120) || null;
  }
  if (body?.walletAddress !== undefined) {
    const trimmed = String(body.walletAddress).trim();
    if (trimmed) data.walletAddress = trimmed;
  }
  if (body?.portfolioLinks !== undefined && Array.isArray(body.portfolioLinks)) {
    data.portfolioLinks = body.portfolioLinks
      .map((link: any) => String(link).trim())
      .filter((link: string) => link.length > 0)
      .slice(0, 50);
  }
  if (body?.skills !== undefined && Array.isArray(body.skills)) {
    const seen = new Set<string>();
    data.skills = body.skills
      .map((s: any) => String(s).trim())
      .filter((s: string) => {
        const k = s.toLowerCase();
        if (!s || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 30);
  }
  return data;
}

export class AuthController {
  /**
   * POST /api/auth/signup
   * Register new user with email, password, name, and role.
   */
  public async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, role } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const userRole = role === 'CLIENT' ? 'CLIENT' : role === 'JUROR' ? 'JUROR' : 'FREELANCER';
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name || normalizedEmail.split('@')[0],
          role: userRole,
          walletAddress: null,
          isPro: false,
          jobsPostedCount: 0,
          jobsAppliedCount: 0,
          portfolioLinks: [],
        },
      });

      const tokenPayload = {
        id: user.id,
        sub: user.id,
        email: user.email,
        role: user.role,
        isPro: user.isPro,
      };

      const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({ token, user: toAuthUser(user) });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Registration failed', message: error.message });
    }
  }

  /**
   * POST /api/auth/login
   * Authenticate user with email and password. The returned
   * `user.onboardingCompleted` flag lets the client route to onboarding.
   */
  public async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const tokenPayload = {
        id: user.id,
        sub: user.id,
        email: user.email,
        role: user.role,
        isPro: user.isPro,
      };

      const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '7d' });

      res.json({ token, user: toAuthUser(user) });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed', message: error.message });
    }
  }

  /**
   * POST /api/auth/admin-login
   * Authenticate against the separate `admins` table (Supabase-managed team
   * roster — same table the Next.js /api/admins route already validates
   * against) and issue a real, verifiable JWT with role ADMIN, so the admin
   * console can call the same authenticateToken-protected endpoints as
   * everyone else instead of relying on a synthetic client-only session.
   */
  public async adminLogin(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const admin = await prisma.admin.findUnique({ where: { email: normalizedEmail } });

      if (!admin || admin.password !== password) {
        res.status(401).json({ error: 'Invalid admin credentials' });
        return;
      }

      const tokenPayload = {
        id: admin.id,
        sub: admin.id,
        email: admin.email,
        role: 'ADMIN',
        isPro: false,
      };
      const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '7d' });

      res.json({
        token,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: 'ADMIN',
          seatNumber: admin.seatNumber,
          title: admin.title,
          walletAddress: null,
        },
      });
    } catch (error: any) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Admin login failed', message: error.message });
    }
  }

  /**
   * GET /api/auth/me
   * Fetch authenticated user's profile from database.
   */
  public async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Admin sessions (POST /auth/admin-login) live in the separate `admins`
      // table, not `User` — resolve those independently.
      if (req.user.role === 'ADMIN') {
        const admin = await prisma.admin.findUnique({ where: { id: req.user.id } });
        if (!admin) {
          res.status(404).json({ error: 'Admin profile not found' });
          return;
        }
        res.json({
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: 'ADMIN',
          seatNumber: admin.seatNumber,
          title: admin.title,
          walletAddress: null,
        });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });

      if (!user) {
        res.status(404).json({ error: 'User profile not found' });
        return;
      }

      res.json(toAuthUser(user));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch profile', message: error.message });
    }
  }

  /**
   * POST /api/auth/onboarding/complete
   * Auth required. Persists the final onboarding payload (same editable fields
   * as PUT /profile) and flips onboardingCompleted. Safe to call repeatedly.
   */
  public async completeOnboarding(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const current = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!current) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const data = sanitizeProfileInput(req.body);
      data.onboardingCompleted = true;

      const updated = await prisma.user.update({ where: { id: req.user.id }, data });
      res.json({ message: 'Onboarding complete', user: toAuthUser(updated) });
    } catch (error: any) {
      console.error('completeOnboarding error:', error);
      res.status(500).json({ error: 'Failed to complete onboarding', message: error.message });
    }
  }

  /**
   * POST /api/auth/logout
   */
  public async logout(_req: Request, res: Response): Promise<void> {
    res.json({ message: 'Logged out successfully' });
  }

  /**
   * GET /api/auth/profile
   * Fetch current authenticated user's public profile fields.
   */
  public async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });

      if (!user) {
        res.status(404).json({ error: 'User profile not found' });
        return;
      }

      res.json({ user: toPublicProfile(user) });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch profile', message: error.message });
    }
  }

  /**
   * POST /api/auth/connect-wallet
   * Link a MetaMask (EVM) wallet address to the authenticated user's profile.
   * The address is unique platform-wide: linking one already held by another
   * account is rejected.
   */
  public async connectWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const raw = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress.trim() : '';
      if (!raw) {
        res.status(400).json({ error: 'walletAddress is required' });
        return;
      }

      const walletAddress = raw.toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
        res.status(400).json({ error: 'Invalid Ethereum wallet address' });
        return;
      }

      const holder = await prisma.user.findUnique({ where: { walletAddress } });
      if (holder && holder.id !== req.user.id) {
        res.status(409).json({
          error: 'Wallet already linked',
          message: 'This wallet address is already linked to another account',
        });
        return;
      }

      try {
        const user = await prisma.user.update({
          where: { id: req.user.id },
          data: { walletAddress },
        });
        res.json(toAuthUser(user));
      } catch (err: any) {
        if (err?.code === 'P2002') {
          res.status(409).json({
            error: 'Wallet already linked',
            message: 'This wallet address is already linked to another account',
          });
          return;
        }
        throw err;
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to connect wallet', message: error.message });
    }
  }

  /**
   * POST /api/auth/disconnect-wallet
   * Remove the wallet address from the authenticated user's profile.
   */
  public async disconnectWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { walletAddress: null },
      });

      res.json(toAuthUser(user));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to disconnect wallet', message: error.message });
    }
  }

  /**
   * PUT /api/auth/profile
   * Update profile fields the user is allowed to edit: name, bio, location,
   * walletAddress, and portfolioLinks. Role/rating/counters and onboarding
   * state are never editable through this endpoint. Used both by the profile
   * page and for per-step saves during onboarding.
   */
  public async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const data = sanitizeProfileInput(req.body);

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data,
      });

      res.json({ message: 'Profile updated successfully', user: toPublicProfile(updatedUser) });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update profile', message: error.message });
    }
  }
}

export const authController = new AuthController();
