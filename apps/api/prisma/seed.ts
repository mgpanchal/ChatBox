import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const employees: Array<{ mobileNumber: string; employeeId: string; displayName: string; department: string; title: string; isAdmin?: boolean }> = [
  { mobileNumber: '+917350221528', employeeId: 'EMP-1042', displayName: 'Mangesh Panchal', department: 'Engineering', title: 'Senior Engineer', isAdmin: true },
  { mobileNumber: '+919000000001', employeeId: 'EMP-1001', displayName: 'Adam Jacobson', department: 'Engineering', title: 'Engineer' },
  { mobileNumber: '+919000000002', employeeId: 'EMP-1002', displayName: 'Heather Levy', department: 'Design', title: 'Designer' },
  { mobileNumber: '+919000000003', employeeId: 'EMP-1003', displayName: 'Lillie Douglas', department: 'Sales', title: 'Account Executive' },
  { mobileNumber: '+919000000004', employeeId: 'EMP-1004', displayName: 'Naima Shannon', department: 'People', title: 'HR Partner' },
  { mobileNumber: '+919000000005', employeeId: 'EMP-1005', displayName: 'Nicolas Bailey', department: 'Engineering', title: 'Engineer' },
  { mobileNumber: '+919000000006', employeeId: 'EMP-1006', displayName: 'Sophia Ava', department: 'People', title: 'Recruiter' },
  { mobileNumber: '+919000000007', employeeId: 'EMP-1007', displayName: 'Leonard Velasquez', department: 'Engineering', title: 'Engineer' },
  { mobileNumber: '+919000000008', employeeId: 'EMP-1008', displayName: 'Marshal Beasley', department: 'Sales', title: 'Sales Manager' },
];

async function ensureUser(e: (typeof employees)[number] & { isAdmin?: boolean }) {
  let user = await prisma.user.findUnique({ where: { mobileNumber: e.mobileNumber }, include: { profile: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        mobileNumber: e.mobileNumber,
        status: 'active',
        isAdmin: !!e.isAdmin,
        profile: { create: { employeeId: e.employeeId, displayName: e.displayName, department: e.department, title: e.title } },
      },
      include: { profile: true },
    });
  } else if (!user.profile) {
    await prisma.employeeProfile.create({
      data: { userId: user.id, employeeId: e.employeeId, displayName: e.displayName, department: e.department, title: e.title },
    });
    user = await prisma.user.findUnique({ where: { id: user.id }, include: { profile: true } });
  }
  if (e.isAdmin && user && !user.isAdmin) {
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  }

  const inviteTtlDays = Number(process.env.INVITE_TTL_DAYS ?? 7);
  const expiresAt = new Date(Date.now() + inviteTtlDays * 24 * 60 * 60 * 1000);
  const existingInvite = await prisma.invite.findFirst({
    where: { mobileNumber: e.mobileNumber, status: { in: ['pending', 'sent'] } },
  });
  if (!existingInvite) {
    await prisma.invite.create({
      data: { mobileNumber: e.mobileNumber, employeeId: e.employeeId, displayName: e.displayName, department: e.department, status: 'sent', expiresAt },
    });
  }
  return user!;
}

async function ensureConversation(opts: {
  key: string;
  kind: 'direct' | 'channel' | 'announcement';
  title: string | null;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pinned?: boolean;
  topic?: string;
  memberIds: string[];
  adminIds?: string[];
  messages: { senderId: string; body: string; createdAtAgo: number }[];
}) {
  let conv = opts.title
    ? await prisma.conversation.findFirst({ where: { kind: opts.kind, title: opts.title } })
    : null;
  if (!conv && opts.kind === 'direct' && opts.memberIds.length === 2) {
    conv = await prisma.conversation.findFirst({
      where: {
        kind: 'direct',
        AND: opts.memberIds.map((id) => ({ members: { some: { userId: id } } })),
      },
    });
  }
  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        kind: opts.kind,
        title: opts.title,
        topic: opts.topic,
        sensitivity: opts.sensitivity,
        pinned: !!opts.pinned,
      },
    });
    for (const userId of opts.memberIds) {
      await prisma.conversationMember.create({
        data: { conversationId: conv.id, userId, isAdmin: !!opts.adminIds?.includes(userId) },
      });
    }
  }

  const existingCount = await prisma.message.count({ where: { conversationId: conv.id } });
  if (existingCount === 0) {
    const now = Date.now();
    for (const m of opts.messages) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: m.senderId,
          body: m.body,
          createdAt: new Date(now - m.createdAtAgo * 1000),
        },
      });
    }
  }
  return conv;
}

type TeamSpec = { slug: string; name: string; description: string; isSystem?: boolean };
const TEAMS: TeamSpec[] = [
  { slug: 'admin', name: 'Admin', description: 'System admins — always in audience for restricted messages', isSystem: true },
  { slug: 'auditor', name: 'Auditor', description: 'Compliance auditors — read-only across all restricted content', isSystem: true },
  { slug: 'sales', name: 'Sales', description: 'Sales and account executives' },
  { slug: 'editor', name: 'Editor', description: 'Content editors and reviewers' },
  { slug: 'designer', name: 'Designer', description: 'Product and brand designers' },
  { slug: 'developer', name: 'Developer', description: 'Software engineers' },
  { slug: 'account', name: 'Account', description: 'Account managers, HR, and operations' },
];

async function ensureTeams() {
  const map: Record<string, string> = {};
  for (const t of TEAMS) {
    const existing = await prisma.team.findUnique({ where: { slug: t.slug } });
    if (existing) {
      map[t.slug] = existing.id;
    } else {
      const created = await prisma.team.create({
        data: { slug: t.slug, name: t.name, description: t.description, isSystem: !!t.isSystem },
      });
      map[t.slug] = created.id;
    }
  }
  return map;
}

async function setTeamMembers(teamId: string, userIds: string[]) {
  const existing = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  const have = new Set(existing.map((e) => e.userId));
  const toAdd = userIds.filter((id) => !have.has(id));
  if (toAdd.length) {
    await prisma.teamMember.createMany({ data: toAdd.map((userId) => ({ teamId, userId })), skipDuplicates: true });
  }
}

function teamForDepartment(department: string | undefined | null): string {
  if (department === 'Engineering') return 'developer';
  if (department === 'Design') return 'designer';
  if (department === 'Sales') return 'sales';
  if (department === 'People') return 'account';
  return 'account';
}

async function main() {
  const users = await Promise.all(employees.map(ensureUser));
  const [me, adam, heather, lillie, naima] = users;

  const teamIds = await ensureTeams();

  for (const u of users) {
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: u.id } });
    const slug = teamForDepartment(profile?.department);
    if (teamIds[slug]) await setTeamMembers(teamIds[slug]!, [u.id]);
    if (u.isAdmin) await setTeamMembers(teamIds['admin']!, [u.id]);
  }
  await setTeamMembers(teamIds['editor']!, [heather.id]);

  await ensureConversation({
    key: 'ann-co',
    kind: 'announcement',
    title: 'Company Announcements',
    sensitivity: 'internal',
    pinned: true,
    topic: 'Company-wide announcements from leadership',
    memberIds: users.map((u) => u.id),
    adminIds: [naima.id],
    messages: [
      { senderId: naima.id, body: 'Q1 town hall recording is now available. Q&A summary attached.', createdAtAgo: 60 * 60 * 5 },
      { senderId: naima.id, body: 'Reminder: please complete the security training by end of week.', createdAtAgo: 60 * 60 * 2 },
    ],
  });

  await ensureConversation({
    key: 'ch-eng',
    kind: 'channel',
    title: '# engineering',
    sensitivity: 'internal',
    topic: 'Engineering team coordination',
    memberIds: [me.id, adam.id, heather.id],
    adminIds: [me.id],
    messages: [
      { senderId: adam.id, body: 'Morning team. Pushed the auth refactor to staging.', createdAtAgo: 60 * 60 * 2 },
      { senderId: heather.id, body: 'Nice. I will run the OTP flow against it after standup.', createdAtAgo: 60 * 60 * 2 - 180 },
      { senderId: me.id, body: 'Anything I should pick up while you do that?', createdAtAgo: 60 * 60 * 1 },
      { senderId: adam.id, body: 'Take a look at the device-binding ticket. It blocks the next milestone.', createdAtAgo: 60 * 60 * 1 - 240 },
      { senderId: me.id, body: 'On it.', createdAtAgo: 60 * 30 },
      { senderId: adam.id, body: 'deploy is green', createdAtAgo: 60 * 5 },
    ],
  });

  await ensureConversation({
    key: 'ch-sales',
    kind: 'channel',
    title: '# sales — confidential',
    sensitivity: 'confidential',
    topic: 'Sales pipeline and client deals — confidential',
    memberIds: [me.id, lillie.id],
    adminIds: [lillie.id],
    messages: [
      { senderId: lillie.id, body: 'Acme renewal is moving — call scheduled for Thursday.', createdAtAgo: 60 * 90 },
      { senderId: lillie.id, body: 'This channel is Confidential. Notes stay here, no forwards.', createdAtAgo: 60 * 88 },
      { senderId: me.id, body: 'Pipeline review at 4 PM today, agenda?', createdAtAgo: 60 * 25 },
    ],
  });

  await ensureConversation({
    key: 'ch-design',
    kind: 'channel',
    title: '# design',
    sensitivity: 'internal',
    memberIds: [me.id, heather.id, adam.id],
    messages: [
      { senderId: heather.id, body: 'New design tokens are up in Figma — same monochrome direction.', createdAtAgo: 60 * 60 * 26 },
    ],
  });

  await ensureConversation({
    key: 'dm-adam',
    kind: 'direct',
    title: null,
    sensitivity: 'internal',
    memberIds: [me.id, adam.id],
    messages: [
      { senderId: adam.id, body: 'Sent the spec, take a look?', createdAtAgo: 60 * 50 },
    ],
  });

  console.log(`✓ ${users.length} users, ${TEAMS.length} teams, 5 conversations, sample messages seeded.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
