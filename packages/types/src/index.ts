export type UserStatus = 'invited' | 'active' | 'deactivated';

export type UserRole =
  | 'super_admin'
  | 'company_admin'
  | 'department_admin'
  | 'group_admin'
  | 'employee'
  | 'auditor';

export type EmployeeProfile = {
  id: string;
  employeeId: string;
  displayName: string;
  mobileNumber: string;
  department?: string;
  location?: string;
  role: UserRole;
  status: UserStatus;
};

export type InviteStatus = 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked';

export type Invite = {
  id: string;
  mobileNumber: string;
  employeeId: string;
  status: InviteStatus;
  expiresAt: string;
};

export type ConversationKind = 'direct' | 'group' | 'announcement';

export type Conversation = {
  id: string;
  kind: ConversationKind;
  title?: string;
  memberCount: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt?: string;
};
