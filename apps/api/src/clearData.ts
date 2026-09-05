import { prisma } from './config/db.config';

async function clearAllTestData() {
  console.log('Cleaning up all test projects, milestones, escrows, and applications...');

  try {
    const deletedMilestones = await prisma.milestone.deleteMany({});
    console.log(`Deleted ${deletedMilestones.count} milestones.`);

    const deletedApps = await prisma.jobApplication.deleteMany({});
    console.log(`Deleted ${deletedApps.count} job applications.`);

    const deletedJobs = await prisma.job.deleteMany({});
    console.log(`Deleted ${deletedJobs.count} jobs.`);

    await prisma.user.updateMany({
      data: { jobsPostedCount: 0 }
    });
    console.log('Reset user job counters.');

    console.log('Database cleanup completed successfully!');
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

clearAllTestData();
