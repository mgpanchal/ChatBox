export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export type ConversationSummary = {
  id: string;
  kind: 'announcement' | 'channel' | 'direct';
  title: string;
  preview: string;
  time: string;
  unread: number;
  sensitivity: Sensitivity;
  pinned?: boolean;
  initials: string;
};

export type ChatMessage = {
  id: string;
  author: string;
  initials: string;
  body: string;
  time: string;
  self?: boolean;
};

export type Person = {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
};

export const me = {
  employeeId: 'EMP-1042',
  displayName: 'Mangesh Panchal',
  initials: 'MP',
  department: 'Engineering',
  title: 'Senior Engineer',
  mobileMasked: '+91 ••••• ••345',
};

export const conversations: ConversationSummary[] = [
  { id: 'ann-co', kind: 'announcement', title: 'Company Announcements', preview: 'Q1 town hall recap and policy updates', time: '09:41', unread: 1, sensitivity: 'internal', pinned: true, initials: 'CO' },
  { id: 'ann-hr', kind: 'announcement', title: 'HR Updates', preview: 'Updated leave policy effective May 12', time: '08:12', unread: 0, sensitivity: 'internal', pinned: true, initials: 'HR' },
  { id: 'ch-eng', kind: 'channel', title: '# engineering', preview: 'Adam: deploy is green', time: '09:30', unread: 4, sensitivity: 'internal', initials: 'EN' },
  { id: 'ch-design', kind: 'channel', title: '# design', preview: 'Heather: new tokens in Figma', time: 'Yesterday', unread: 0, sensitivity: 'internal', initials: 'DS' },
  { id: 'ch-sales', kind: 'channel', title: '# sales — confidential', preview: 'Pipeline review at 4 PM', time: '07:55', unread: 2, sensitivity: 'confidential', initials: 'SA' },
  { id: 'dm-adam', kind: 'direct', title: 'Adam Jacobson', preview: 'Sent the spec, take a look?', time: '09:12', unread: 1, sensitivity: 'internal', initials: 'AJ' },
  { id: 'dm-heather', kind: 'direct', title: 'Heather Levy', preview: 'Let me know when you are free', time: 'Yesterday', unread: 0, sensitivity: 'internal', initials: 'HL' },
];

export const messages: Record<string, { meta: ConversationSummary; thread: ChatMessage[] }> = {
  'ch-eng': {
    meta: conversations.find((c) => c.id === 'ch-eng')!,
    thread: [
      { id: '1', author: 'Adam Jacobson', initials: 'AJ', body: 'Morning team. Pushed the auth refactor to staging.', time: '09:02' },
      { id: '2', author: 'Heather Levy', initials: 'HL', body: 'Nice. I will run the OTP flow against it after standup.', time: '09:05' },
      { id: '3', author: 'Mangesh Panchal', initials: 'MP', body: 'Anything I should pick up while you do that?', time: '09:08', self: true },
      { id: '4', author: 'Adam Jacobson', initials: 'AJ', body: 'Take a look at the device-binding ticket. It blocks the next milestone.', time: '09:12' },
      { id: '5', author: 'Mangesh Panchal', initials: 'MP', body: 'On it.', time: '09:13', self: true },
      { id: '6', author: 'Adam Jacobson', initials: 'AJ', body: 'deploy is green', time: '09:30' },
    ],
  },
  'ch-sales': {
    meta: conversations.find((c) => c.id === 'ch-sales')!,
    thread: [
      { id: '1', author: 'Lillie Douglas', initials: 'LD', body: 'Acme renewal is moving — call scheduled for Thursday.', time: '07:40' },
      { id: '2', author: 'Marshal Beasley', initials: 'MB', body: 'Can we share the call notes here once we have them?', time: '07:43' },
      { id: '3', author: 'Lillie Douglas', initials: 'LD', body: 'Yes — this channel is Confidential, so notes stay here.', time: '07:50' },
      { id: '4', author: 'Mangesh Panchal', initials: 'MP', body: 'Pipeline review at 4 PM today, agenda?', time: '07:55', self: true },
    ],
  },
  'ch-design': {
    meta: conversations.find((c) => c.id === 'ch-design')!,
    thread: [
      { id: '1', author: 'Heather Levy', initials: 'HL', body: 'New design tokens are up in Figma — same monochrome direction we agreed on.', time: '14:21' },
      { id: '2', author: 'Sophia Ava', initials: 'SA', body: 'Looks great. Should we mirror them as CSS variables?', time: '14:30' },
    ],
  },
  'ann-co': {
    meta: conversations.find((c) => c.id === 'ann-co')!,
    thread: [
      { id: '1', author: 'Company Announcements', initials: 'CO', body: 'Q1 town hall recording is now available. Q&A summary attached. Read by 2,847 of 5,012 employees.', time: '09:41' },
    ],
  },
  'ann-hr': {
    meta: conversations.find((c) => c.id === 'ann-hr')!,
    thread: [
      { id: '1', author: 'HR Updates', initials: 'HR', body: 'Updated leave policy effective May 12. Please review the document and acknowledge.', time: '08:12' },
    ],
  },
  'dm-adam': {
    meta: conversations.find((c) => c.id === 'dm-adam')!,
    thread: [{ id: '1', author: 'Adam Jacobson', initials: 'AJ', body: 'Sent the spec, take a look?', time: '09:12' }],
  },
  'dm-heather': {
    meta: conversations.find((c) => c.id === 'dm-heather')!,
    thread: [{ id: '1', author: 'Heather Levy', initials: 'HL', body: 'Let me know when you are free', time: 'Yesterday' }],
  },
};

export const people: Person[] = [
  { id: 'p1', name: 'Adam Jacobson', initials: 'AJ', role: 'Engineer', department: 'Engineering' },
  { id: 'p2', name: 'Heather Levy', initials: 'HL', role: 'Designer', department: 'Design' },
  { id: 'p3', name: 'Lillie Douglas', initials: 'LD', role: 'Account Executive', department: 'Sales' },
  { id: 'p4', name: 'Marshal Beasley', initials: 'MB', role: 'Sales Manager', department: 'Sales' },
  { id: 'p5', name: 'Naima Shannon', initials: 'NS', role: 'HR Partner', department: 'People' },
  { id: 'p6', name: 'Nicolas Bailey', initials: 'NB', role: 'Engineer', department: 'Engineering' },
  { id: 'p7', name: 'Sophia Ava', initials: 'SA', role: 'Recruiter', department: 'People' },
  { id: 'p8', name: 'Leonard Velasquez', initials: 'LV', role: 'Engineer', department: 'Engineering' },
];
