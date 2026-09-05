/**
 * @file job.controller.ts
 * @description Job & Escrow Management Controller.
 * Handles the full marketplace lifecycle: job creation (draft/publish), discovery,
 * freelancer applications, client application review, and freelancer selection.
 * Also retains job registration with milestone breakdowns and escrow funding.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/db.config';
import { escrowService } from '../services/web3/escrow.service';
import { JobStatus, MilestoneStatus, ApplicationStatus, LedgerEventType, LedgerStatus } from '@prisma/client';
import { createNotification, createNotifications } from '../services/notification.service';
import { recordLedgerEvent, isMockTxHash, isMockEscrowAddress } from '../services/ledger.service';

/** Error thrown inside controllers and translated to an HTTP response. */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MARKETPLACE_STATUSES: JobStatus[] = [JobStatus.PUBLISHED, JobStatus.OPEN];

/** Statuses a job must be in before a freelancer can be selected. */
const SELECTABLE_JOB_STATUSES: JobStatus[] = [JobStatus.PUBLISHED, JobStatus.OPEN];

export class JobController {
  /**
   * Notify freelancers whose skills overlap a newly-listed job. Fire-and-forget:
   * capped, skill-targeted (never notifies when the job lists no skills), and
   * never blocks the request that triggered it.
   */
  private async notifyFreelancersOfListing(job: {
    id: string;
    title: string;
    skills: string[];
    clientId: string;
  }): Promise<void> {
    try {
      if (!job.skills || job.skills.length === 0) return;
      const freelancers = await prisma.user.findMany({
        where: {
          role: 'FREELANCER',
          id: { not: job.clientId },
          skills: { hasSome: job.skills },
        },
        select: { id: true },
        take: 200,
      });
      if (freelancers.length === 0) return;
      await createNotifications(
        freelancers.map((f) => f.id),
        () => ({
          type: 'JOB_POSTED',
          title: 'New job matches your skills',
          body: job.title,
          jobId: job.id,
          link: `/bounties/${job.id}`,
        })
      );
    } catch (err: any) {
      console.error('[notifications] notifyFreelancersOfListing failed:', err?.message || err);
    }
  }

  /**
   * POST /api/jobs
   * Create a new job posting (client only). Saves as a draft or publishes immediately.
   */
  public async createJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (req.user.role !== 'CLIENT' && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only clients can create jobs' });
        return;
      }

      // Auto-assign dev wallet if user has no wallet connected yet
      const clientUser = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!clientUser?.walletAddress) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }
        }).catch(() => {});
      }

      const { title, description, budget, tokenSymbol, skills, deadline, milestones } = req.body;
      let { status } = req.body;

      if (!title || !description || budget === undefined || budget === null || budget === '') {
        res.status(400).json({ error: 'Invalid input payload: title, description, and budget are required' });
        return;
      }

      const parsedBudget = parseFloat(budget);
      if (isNaN(parsedBudget) || parsedBudget <= 0) {
        res.status(400).json({ error: 'Budget must be a positive number' });
        return;
      }

      if (status === undefined || status === null || status === '') {
        status = 'DRAFT';
      }
      if (!['DRAFT', 'PUBLISHED', 'OPEN'].includes(status)) {
        res.status(400).json({ error: "status must be one of: DRAFT, PUBLISHED, OPEN" });
        return;
      }

      const normalizedSkills = Array.isArray(skills)
        ? skills.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 30)
        : [];

      const deadlineDate = deadline ? new Date(deadline) : null;
      if (deadline) {
        if (isNaN(deadlineDate!.getTime())) {
          res.status(400).json({ error: 'deadline must be a valid date' });
          return;
        }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const checkDate = new Date(deadlineDate!);
        checkDate.setHours(0, 0, 0, 0);
        if (checkDate.getTime() <= todayStart.getTime()) {
          res.status(400).json({ error: 'deadline must be greater than the current date' });
          return;
        }
      }

      // Create Job and dynamic Milestones in Prisma
      const newJob = await prisma.job.create({
        data: {
          title,
          description,
          budget: parsedBudget,
          tokenSymbol: tokenSymbol || 'ETH',
          skills: normalizedSkills,
          deadline: deadlineDate,
          clientId: req.user.id,
          status: status as JobStatus,
          ...(Array.isArray(milestones) && milestones.length > 0
            ? {
                milestones: {
                  create: milestones.map((m: any, idx: number) => ({
                    order: m.order || idx + 1,
                    title: m.title || `Milestone ${idx + 1}`,
                    description: m.description || `Deliverable for Milestone ${idx + 1}`,
                    amount: parseFloat(m.amount) || parsedBudget / milestones.length,
                    status: idx === 0 ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.LOCKED
                  }))
                }
              }
            : {})
        },
        include: { milestones: { orderBy: { order: 'asc' } }, _count: { select: { applications: true } } }
      });

      // Ledger: record job creation, and one entry per inline milestone created with it.
      void recordLedgerEvent({
        jobId: newJob.id,
        eventType: LedgerEventType.JOB_CREATED,
        status: LedgerStatus.CONFIRMED,
        actorId: req.user.id,
        actorRole: req.user.role,
        amount: newJob.budget,
        currency: newJob.tokenSymbol,
        previousStatus: null,
        newStatus: newJob.status,
        description: `Job "${newJob.title}" created`,
        details: { title: newJob.title },
        dedupeKey: `job-created:${newJob.id}`
      });
      for (const m of newJob.milestones) {
        void recordLedgerEvent({
          jobId: newJob.id,
          milestoneId: m.id,
          eventType: LedgerEventType.MILESTONE_CREATED,
          status: LedgerStatus.CONFIRMED,
          actorId: req.user.id,
          actorRole: req.user.role,
          amount: m.amount,
          currency: newJob.tokenSymbol,
          previousStatus: null,
          newStatus: m.status,
          description: `Milestone "${m.title}" created`,
          details: { milestoneTitle: m.title },
          dedupeKey: `milestone-created:${m.id}`
        });
      }

      // Increment the client's posted job counter for non-draft jobs
      if (status !== 'DRAFT') {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { jobsPostedCount: { increment: 1 } }
        });
      }

      if (status === 'PUBLISHED' || status === 'OPEN') {
        void this.notifyFreelancersOfListing({
          id: newJob.id,
          title: newJob.title,
          skills: newJob.skills,
          clientId: req.user.id,
        });
      }

      res.status(201).json({ message: 'Job created successfully', job: newJob });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create job', message: error.message });
    }
  }

  /**
   * GET /api/jobs
   * Get marketplace jobs (published, plus legacy open jobs).
   * Supports search & filtering: ?q=, ?skills=, ?minBudget=, ?maxBudget=, ?token=, ?status=, ?sort=
   */
  public async getJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : (typeof req.query.search === 'string' ? req.query.search.trim() : '');
      const token = typeof req.query.token === 'string' ? req.query.token.trim() : (typeof req.query.currency === 'string' ? req.query.currency.trim() : '');
      const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
      const minBudget = req.query.minBudget !== undefined ? Number(req.query.minBudget) : undefined;
      const maxBudget = req.query.maxBudget !== undefined ? Number(req.query.maxBudget) : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';

      const where: any = { status: { in: MARKETPLACE_STATUSES } };

      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { skills: { has: q } }
        ];
      }

      if (token && token !== 'ALL') {
        where.tokenSymbol = { equals: token, mode: 'insensitive' };
      }

      if (status && (status === 'PUBLISHED' || status === 'OPEN')) {
        where.status = { in: [status as JobStatus] };
      }

      if (minBudget !== undefined && !isNaN(minBudget)) {
        where.budget = { ...(where.budget || {}), gte: minBudget };
      }
      if (maxBudget !== undefined && !isNaN(maxBudget)) {
        where.budget = { ...(where.budget || {}), lte: maxBudget };
      }

      const skillsParam = typeof req.query.skills === 'string' ? req.query.skills : (typeof req.query.skill === 'string' ? req.query.skill : '');
      const skills = skillsParam.split(',').map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== 'all');
      if (skills.length > 0) {
        where.skills = { hasEvery: skills };
      }

      let orderBy: any = { createdAt: 'desc' };
      if (sort === 'budget_asc') orderBy = { budget: 'asc' };
      else if (sort === 'budget_desc') orderBy = { budget: 'desc' };

      const jobs = await prisma.job.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, email: true, rating: true } },
          _count: { select: { applications: true } }
        },
        orderBy
      });

      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch jobs', message: error.message });
    }
  }

  /**
   * GET /api/jobs/my
   * Get the authenticated client's own jobs (all statuses) with application counts.
   */
  public async getMyJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (req.user.role !== 'CLIENT' && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only client accounts can manage job postings' });
        return;
      }

      const jobs = await prisma.job.findMany({
        where: { clientId: req.user.id },
        include: {
          client: { select: { id: true, name: true, email: true, rating: true } },
          _count: { select: { applications: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch jobs', message: error.message });
    }
  }

  /**
   * GET /api/jobs/my-projects
   * Get active assigned projects for the authenticated user (freelancer or client).
   */
  public async getMyProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const userId = req.user.id;

      const jobs = await prisma.job.findMany({
        where: {
          OR: [
            { freelancerId: userId },
            { clientId: userId },
            {
              applications: {
                some: {
                  freelancerId: userId,
                  status: ApplicationStatus.ACCEPTED
                }
              }
            }
          ]
        },
        include: {
          client: { select: { id: true, name: true, email: true, rating: true, walletAddress: true } },
          freelancer: { select: { id: true, name: true, email: true, rating: true, walletAddress: true } },
          milestones: { orderBy: { createdAt: 'asc' } },
          _count: { select: { applications: true } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch assigned projects', message: error.message });
    }
  }

  /**
   * GET /api/jobs/:id
   * Get specific job details.
   */
  public async getJobById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      let job = await prisma.job.findFirst({
        where: {
          OR: [
            { id },
            { title: { equals: id, mode: 'insensitive' } },
            { title: { equals: decodeURIComponent(id), mode: 'insensitive' } }
          ]
        },
        include: {
          client: { select: { id: true, name: true, email: true, rating: true, bio: true, createdAt: true } },
          freelancer: { select: { id: true, name: true, email: true, rating: true, bio: true } },
          milestones: { orderBy: { createdAt: 'asc' } },
          _count: { select: { applications: true } }
        }
      });

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      // Auto-create 4 default milestones in DB if job currently has none
      if (!job.milestones || job.milestones.length === 0) {
        const defaultTitles = [
          { title: "Milestone 1: Smart Contract Architecture & Specification", description: "Design specs, architecture diagrams, and interface definitions (25% vault payout)." },
          { title: "Milestone 2: Core Development & Sepolia Contract Deployment", description: "Smart contract implementation, unit tests, and Sepolia testnet deployment (25% vault payout)." },
          { title: "Milestone 3: Web3 Frontend Integration & E2E Testing", description: "Connect frontend wallet interactions, escrow hooks, and complete integration tests (25% vault payout)." },
          { title: "Milestone 4: Security Audit, Verification & Final Mainnet Release", description: "Complete security audit verification, AI code review, and final handoff (25% vault payout)." },
        ];
        const quarter = Number((job.budget / 4).toFixed(4));
        await prisma.milestone.createMany({
          data: defaultTitles.map((t) => ({
            jobId: job!.id,
            title: t.title,
            description: t.description,
            amount: quarter,
            status: MilestoneStatus.PENDING,
          }))
        });

        const reFetched = await prisma.job.findUnique({
          where: { id: job.id },
          include: {
            client: { select: { id: true, name: true, email: true, rating: true, bio: true, createdAt: true } },
            freelancer: { select: { id: true, name: true, email: true, rating: true, bio: true } },
            milestones: { orderBy: { createdAt: 'asc' } },
            _count: { select: { applications: true } }
          }
        });
        if (reFetched) job = reFetched;
      }

      // Draft jobs are private — only the owning client (or an admin) may view them.
      if (job.status === JobStatus.DRAFT) {
        const isOwnerOrAdmin = !!req.user && (req.user.id === job.clientId || req.user.role === 'ADMIN');
        if (!isOwnerOrAdmin) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }
      }

      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch job details', message: error.message });
    }
  }

  /**
   * PATCH /api/jobs/:id
   * Update an editable job (DRAFT or PUBLISHED) — owner only.
   */
  public async updateJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (job.clientId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only the job owner can edit this job' });
        return;
      }
      if (job.status !== JobStatus.DRAFT && job.status !== JobStatus.PUBLISHED) {
        res.status(409).json({ error: `Job with status ${job.status} can no longer be edited` });
        return;
      }

      const { title, description, budget, tokenSymbol, skills, deadline } = req.body;
      let { status } = req.body;

      const data: any = {};
      if (title !== undefined) {
        if (!title) {
          res.status(400).json({ error: 'Title cannot be empty' });
          return;
        }
        data.title = title;
      }
      if (description !== undefined) {
        if (!description) {
          res.status(400).json({ error: 'Description cannot be empty' });
          return;
        }
        data.description = description;
      }
      if (budget !== undefined && budget !== null && budget !== '') {
        const parsedBudget = parseFloat(budget);
        if (isNaN(parsedBudget) || parsedBudget <= 0) {
          res.status(400).json({ error: 'Budget must be a positive number' });
          return;
        }
        data.budget = parsedBudget;
      }
      if (tokenSymbol !== undefined) data.tokenSymbol = tokenSymbol;
      if (skills !== undefined) {
        data.skills = Array.isArray(skills)
          ? skills.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 30)
          : [];
      }
      if (deadline !== undefined) {
        if (deadline === null || deadline === '') {
          data.deadline = null;
        } else {
          const deadlineDate = new Date(deadline);
          if (isNaN(deadlineDate.getTime())) {
            res.status(400).json({ error: 'deadline must be a valid date' });
            return;
          }
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const checkDate = new Date(deadlineDate);
          checkDate.setHours(0, 0, 0, 0);
          if (checkDate.getTime() <= todayStart.getTime()) {
            res.status(400).json({ error: 'deadline must be greater than the current date' });
            return;
          }
          data.deadline = deadlineDate;
        }
      }
      if (status !== undefined) {
        if (!['DRAFT', 'PUBLISHED', 'OPEN'].includes(status)) {
          res.status(400).json({ error: "status must be one of: DRAFT, PUBLISHED, OPEN" });
          return;
        }
        data.status = status as JobStatus;
      }

      const updatedJob = await prisma.job.update({
        where: { id },
        data,
        include: { _count: { select: { applications: true } } }
      });

      res.json({ message: 'Job updated successfully', job: updatedJob });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update job', message: error.message });
    }
  }

  /**
   * POST /api/jobs/:id/publish
   * Publish a draft job — owner only.
   */
  public async publishJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (job.clientId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only the job owner can publish this job' });
        return;
      }
      if (job.status !== JobStatus.DRAFT) {
        res.status(409).json({ error: `Only draft jobs can be published (current status: ${job.status})` });
        return;
      }

      const updatedJob = await prisma.$transaction(async (tx) => {
        const updated = await tx.job.update({
          where: { id },
          data: { status: JobStatus.PUBLISHED },
          include: { _count: { select: { applications: true } } }
        });
        await tx.user.update({
          where: { id: req.user!.id },
          data: { jobsPostedCount: { increment: 1 } }
        });
        return updated;
      });

      void this.notifyFreelancersOfListing({
        id: updatedJob.id,
        title: updatedJob.title,
        skills: updatedJob.skills,
        clientId: req.user.id,
      });

      res.json({ message: 'Job published successfully', job: updatedJob });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to publish job', message: error.message });
    }
  }

  /**
   * POST /api/jobs/:id/applications
   * POST /api/jobs/:id/apply
   * Submit a job application (freelancer only).
   */
  public async applyToJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (req.user.role !== 'FREELANCER' && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only freelancers can apply to jobs' });
        return;
      }

      const id = String(req.params.id);
      const { pitch, proposal, requestedRate, proposedAmount, deliveryDays, walletAddress } = req.body;

      const finalPitch = (pitch || proposal || '').toString().trim();
      if (!finalPitch) {
        res.status(400).json({ error: 'Proposal (pitch) is required' });
        return;
      }
      const rawRate = requestedRate !== undefined ? requestedRate : proposedAmount;
      const parsedRate = parseFloat(rawRate);
      if (isNaN(parsedRate) || parsedRate <= 0) {
        res.status(400).json({ error: 'Proposed amount must be a positive number' });
        return;
      }
      const parsedDays = deliveryDays ? parseInt(deliveryDays, 10) : 7;

      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (job.clientId === req.user.id) {
        res.status(403).json({ error: 'Forbidden: You cannot apply to your own job' });
        return;
      }

      if (job.status !== JobStatus.PUBLISHED && job.status !== JobStatus.OPEN) {
        res.status(403).json({
          error: 'Forbidden: Applications are only accepted for published jobs',
          message: `This job is ${job.status} and is not accepting applications`
        });
        return;
      }

      const existing = await prisma.jobApplication.findUnique({
        where: { jobId_freelancerId: { jobId: id, freelancerId: req.user.id } }
      });
      if (existing) {
        res.status(409).json({ error: 'You have already applied to this job' });
        return;
      }

      const applicantWallet = walletAddress || req.user.walletAddress || null;

      const application = await prisma.$transaction(async (tx) => {
        const created = await tx.jobApplication.create({
          data: {
            jobId: id,
            freelancerId: req.user!.id,
            pitch: finalPitch,
            requestedRate: parsedRate,
            deliveryDays: parsedDays,
            walletAddress: applicantWallet,
            status: ApplicationStatus.SUBMITTED
          },
          include: { job: true, freelancer: true }
        });
        await tx.user.update({
          where: { id: req.user!.id },
          data: { jobsAppliedCount: { increment: 1 } }
        });
        // Open the client <-> applicant conversation so scope can be discussed
        // before selection (idempotent per job/freelancer pair).
        const existingConversation = await tx.conversation.findUnique({
          where: { jobId_freelancerId: { jobId: id, freelancerId: req.user!.id } }
        });
        if (!existingConversation) {
          await tx.conversation.create({
            data: {
              jobId: id,
              freelancerId: req.user!.id,
              participants: {
                create: [{ userId: job.clientId }, { userId: req.user!.id }]
              }
            }
          });
        }
        return created;
      });

      void createNotification({
        userId: job.clientId,
        type: 'APPLICATION_RECEIVED',
        title: 'New application received',
        body: `${application.freelancer?.name || 'A freelancer'} applied to "${job.title}"`,
        jobId: id,
        link: `/client/jobs/${id}`,
      });

      res.status(201).json({ message: 'Application submitted successfully', application });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to submit application', message: error.message });
    }
  }

  /**
   * GET /api/jobs/:id/applications
   * Get applications for a job — owner only.
   */
  public async getJobApplications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          client: { select: { id: true, name: true, email: true, rating: true, walletAddress: true } },
          freelancer: { select: { id: true, name: true, email: true, rating: true, walletAddress: true } },
          milestones: { orderBy: { order: 'asc' } },
          _count: { select: { applications: true } }
        }
      });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (job.clientId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only the job owner can view applications' });
        return;
      }

      const applications = await prisma.jobApplication.findMany({
        where: { jobId: id },
        include: {
          freelancer: { select: { id: true, name: true, email: true, rating: true, bio: true, location: true, portfolioLinks: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ job, applications });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch applications', message: error.message });
    }
  }

  /**
   * POST /api/jobs/:id/applications/:applicationId/review
   * Mark an application as UNDER_REVIEW — owner only.
   */
  public async reviewApplication(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const applicationId = String(req.params.applicationId);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (job.clientId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only the job owner can review applications' });
        return;
      }

      const application = await prisma.jobApplication.findFirst({
        where: { id: applicationId, jobId: id }
      });
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }
      if (application.status === ApplicationStatus.ACCEPTED || application.status === ApplicationStatus.REJECTED) {
        res.status(409).json({ error: `Application is already ${application.status.toLowerCase()}` });
        return;
      }

      const updated = await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.UNDER_REVIEW }
      });

      res.json({ message: 'Application marked as under review', application: updated });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to review application', message: error.message });
    }
  }

  /**
   * POST /api/jobs/:id/applications/:applicationId/reject
   * Reject an application — owner only.
   */
  public async rejectApplication(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const applicationId = String(req.params.applicationId);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (job.clientId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only the job owner can reject applications' });
        return;
      }

      const application = await prisma.jobApplication.findFirst({
        where: { id: applicationId, jobId: id }
      });
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }
      if (application.status === ApplicationStatus.ACCEPTED) {
        res.status(409).json({ error: 'An accepted application cannot be rejected' });
        return;
      }

      const updated = await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.REJECTED }
      });

      res.json({ message: 'Application rejected', application: updated });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reject application', message: error.message });
    }
  }

  /**
   * POST /api/jobs/:id/select
   * POST /api/jobs/:id/select-freelancer
   * Select a freelancer for a job — owner only.
   */
  public async selectFreelancer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const { applicationId, freelancerId, freelancerAddress } = req.body;

      if (!applicationId && !freelancerId && !freelancerAddress) {
        res.status(400).json({ error: 'applicationId, freelancerId, or freelancerAddress is required' });
        return;
      }

      let previousJobStatus: JobStatus | null = null;
      const result = await prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique({ where: { id } });
        if (!job) throw new HttpError(404, 'Job not found');
        previousJobStatus = job.status;
        if (job.clientId !== req.user!.id && req.user!.role !== 'ADMIN') {
          throw new HttpError(403, 'Forbidden: Only the job owner can select a freelancer');
        }
        if (job.status === JobStatus.FREELANCER_SELECTED) {
          throw new HttpError(409, `A freelancer has already been selected for this job`);
        }
        if (!SELECTABLE_JOB_STATUSES.includes(job.status)) {
          throw new HttpError(409, `Freelancers cannot be selected while the job is ${job.status}`);
        }

        let targetAppId = applicationId;
        let selectedFreelancerId = freelancerId;

        if (!selectedFreelancerId && freelancerAddress) {
          const userWithWallet = await tx.user.findUnique({
            where: { walletAddress: freelancerAddress }
          });
          if (userWithWallet) {
            selectedFreelancerId = userWithWallet.id;
          }
        }

        if (targetAppId) {
          const application = await tx.jobApplication.findFirst({
            where: { id: targetAppId, jobId: id }
          });
          if (!application) {
            throw new HttpError(404, 'Application not found for this job');
          }
          selectedFreelancerId = application.freelancerId;
        } else if (selectedFreelancerId) {
          const application = await tx.jobApplication.findFirst({
            where: { jobId: id, freelancerId: selectedFreelancerId }
          });
          if (application) {
            targetAppId = application.id;
          }
        }

        if (!selectedFreelancerId) {
          throw new HttpError(400, 'Could not determine freelancer to select');
        }

        if (targetAppId) {
          // Accept the selected application, reject all others
          await tx.jobApplication.updateMany({
            where: { jobId: id, id: { not: targetAppId } },
            data: { status: ApplicationStatus.REJECTED }
          });
          await tx.jobApplication.update({
            where: { id: targetAppId },
            data: { status: ApplicationStatus.ACCEPTED }
          });
        }

        // Move the job into the freelancer-selected marketplace state
        const updatedJob = await tx.job.update({
          where: { id },
          data: {
            status: JobStatus.FREELANCER_SELECTED,
            freelancerId: selectedFreelancerId
          },
          include: { client: true, freelancer: true, milestones: true, _count: { select: { applications: true } } }
        });

        // Open the client <-> freelancer conversation for this job (idempotent).
        const existingConversation = await tx.conversation.findUnique({
          where: { jobId_freelancerId: { jobId: id, freelancerId: selectedFreelancerId } }
        });
        if (!existingConversation) {
          await tx.conversation.create({
            data: {
              jobId: id,
              freelancerId: selectedFreelancerId,
              participants: {
                create: [{ userId: job.clientId }, { userId: selectedFreelancerId }]
              }
            }
          });
        }

        return updatedJob;
      });

      if (result.freelancerId) {
        void createNotification({
          userId: result.freelancerId,
          type: 'APPLICATION_ACCEPTED',
          title: 'You were selected for a job',
          body: `The client selected you for "${result.title}"`,
          jobId: result.id,
          link: `/projects/${result.id}`,
        });
      }

      void recordLedgerEvent({
        jobId: result.id,
        eventType: LedgerEventType.JOB_ACTIVATED,
        status: LedgerStatus.CONFIRMED,
        actorId: req.user.id,
        actorRole: req.user.role,
        amount: result.budget,
        currency: result.tokenSymbol,
        previousStatus: previousJobStatus,
        newStatus: result.status,
        description: 'Freelancer selected — job activated',
        details: { freelancerId: result.freelancerId },
        dedupeKey: `job-activated:${result.id}`
      });

      res.json({
        message: 'Freelancer selected successfully',
        job: result
      });
    } catch (error: any) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to select freelancer', message: error.message });
    }
  }

  /**
   * DELETE /api/jobs/:id
   * Delete an owned job posting — owner only.
   * Only DRAFT / PUBLISHED / OPEN jobs can be deleted (still in discovery).
   * Once a job has entered an active hiring/contract/escrow flow it cannot be removed.
   */
  public async deleteJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (req.user.role !== 'CLIENT' && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only clients can delete job postings' });
        return;
      }

      const id = String(req.params.id);
      const job = await prisma.job.findUnique({
        where: { id },
        include: { applications: { where: { status: ApplicationStatus.ACCEPTED }, select: { id: true } } }
      });
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (job.clientId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Only the job owner can delete this job' });
        return;
      }

      const DELETABLE_STATUSES: JobStatus[] = [JobStatus.DRAFT, JobStatus.PUBLISHED, JobStatus.OPEN];
      if (!DELETABLE_STATUSES.includes(job.status)) {
        res.status(409).json({
          error: `Job with status ${job.status} is in an active hiring/escrow flow and cannot be deleted`
        });
        return;
      }
      if (job.applications.length > 0) {
        res.status(409).json({ error: 'Cannot delete a job with an accepted application' });
        return;
      }

      await prisma.$transaction([
        prisma.jobApplication.deleteMany({ where: { jobId: id } }),
        prisma.milestone.deleteMany({ where: { jobId: id } }),
        prisma.job.delete({ where: { id } })
      ]);

      res.json({ message: 'Job deleted successfully', id });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete job', message: error.message });
    }
  }

  /**
   * POST /api/jobs/:id/fund
   * Client links deployed JobEscrow vault contract address from Sepolia Devnet or deploys new vault
   */
  public async fundJobEscrow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const id = String(req.params.id);
      const { escrowAddress, freelancerAddress, tokenAddress = '0x0000000000000000000000000000000000000000' } = req.body;

      const job = await prisma.job.findUnique({
        where: { id },
        include: { freelancer: true }
      });

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      let finalEscrowAddress = escrowAddress;
      let vaultResult: { escrowAddress: string; txHash: string } | null = null;

      // If client provides a pre-deployed escrowAddress from Sepolia Devnet, link directly
      if (!finalEscrowAddress) {
        const targetFreelancerAddr = freelancerAddress || job.freelancer?.walletAddress || '0x0000000000000000000000000000000000000000';
        const fundingWei = BigInt(Math.floor(job.budget * 1e18)).toString();
        try {
          vaultResult = await escrowService.createJobEscrowVault(job.id, targetFreelancerAddr, tokenAddress, fundingWei);
        } catch (vaultError: any) {
          void recordLedgerEvent({
            jobId: id,
            eventType: LedgerEventType.BLOCKCHAIN_FAILED,
            status: LedgerStatus.FAILED,
            actorId: req.user.id,
            actorRole: req.user.role,
            amount: job.budget,
            currency: job.tokenSymbol,
            previousStatus: job.status,
            newStatus: job.status,
            description: 'Escrow vault deployment failed on-chain',
            details: { errorMessage: String(vaultError?.message || vaultError) },
            dedupeKey: `escrow-creation-failed:${id}:${Date.now()}`
          });
          throw vaultError; // preserve existing error-response behavior exactly
        }
        finalEscrowAddress = vaultResult.escrowAddress;
      }

      // Update Job status and escrow address in DB
      const updatedJob = await prisma.job.update({
        where: { id },
        data: {
          escrowAddress: finalEscrowAddress,
          status: JobStatus.IN_PROGRESS
        },
        include: { client: true, freelancer: true, milestones: true }
      });

      if (vaultResult) {
        // A new vault was actually deployed (or simulated, if the factory isn't configured).
        const mocked = isMockTxHash(vaultResult.txHash) || isMockEscrowAddress(vaultResult.escrowAddress);
        void recordLedgerEvent({
          jobId: id,
          escrowId: finalEscrowAddress,
          eventType: LedgerEventType.ESCROW_CREATED,
          status: mocked ? LedgerStatus.PENDING : LedgerStatus.CONFIRMED,
          actorId: req.user.id,
          actorRole: req.user.role,
          amount: job.budget,
          currency: job.tokenSymbol,
          previousStatus: job.status,
          newStatus: updatedJob.status,
          description: mocked
            ? 'Escrow vault creation simulated (factory not configured on this environment)'
            : 'Escrow vault deployed on-chain',
          details: { escrowAddress: finalEscrowAddress, mocked },
          blockchainTransactionHash: vaultResult.txHash,
          dedupeKey: `escrow-created:${id}`
        });
      } else {
        // Client linked a pre-deployed escrow address directly — no vault-creation call
        // was made, so no on-chain funding confirmation is available at this call site.
        void recordLedgerEvent({
          jobId: id,
          escrowId: finalEscrowAddress,
          eventType: LedgerEventType.ESCROW_FUNDED,
          status: LedgerStatus.PENDING,
          actorId: req.user.id,
          actorRole: req.user.role,
          amount: job.budget,
          currency: job.tokenSymbol,
          previousStatus: job.status,
          newStatus: updatedJob.status,
          description: 'Job linked to a client-provided escrow address (on-chain funding not independently verified by the backend)',
          details: { escrowAddress: finalEscrowAddress },
          dedupeKey: `escrow-funded:${id}`
        });
      }

      res.json({
        message: 'Job escrow vault linked and funded successfully',
        job: updatedJob,
        vault: vaultResult || { escrowAddress: finalEscrowAddress }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Escrow funding failed', message: error.message });
    }
  }
}

export const jobController = new JobController();
