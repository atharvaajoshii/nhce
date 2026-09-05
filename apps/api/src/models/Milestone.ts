/**
 * @file Milestone.ts
 * @description Milestone deliverable & verification status model interfaces.
 */

export enum MilestoneStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  VERIFYING = 'VERIFYING',
  APPROVED = 'APPROVED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  PROCESSING_AUTORELEASE = 'PROCESSING_AUTORELEASE',
  LOCKED = 'LOCKED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  COMPLETED = 'COMPLETED'
}

export interface IMilestoneDeliverable {
  id: string;
  jobId: string;
  title: string;
  description: string;
  amount: number;
  deadline?: Date;
  deliverableLink?: string;
  githubPrUrl?: string;
  deploymentUrl?: string;
  aiReviewScore?: number;
  status: MilestoneStatus;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubmitMilestoneDTO {
  milestoneId: string;
  deliverableLink?: string;
  githubPrUrl?: string;
  deploymentUrl?: string;
}
