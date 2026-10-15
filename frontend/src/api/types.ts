/**
 * Shared API types — the frontend's copy of the sprint contract shapes.
 * Every server response is described here; the `api/*.ts` modules return these.
 */

export type Role = "user" | "moderator" | "admin";
export type VoteValue = 1 | -1 | 0;
export type ReportStatus = "open" | "resolved" | "dismissed";
export type ReportContentType = "thread" | "comment";
export type NotificationType = "reply" | "mention" | "thread_comment";
export type ModerationAction =
  | "pin"
  | "unpin"
  | "lock"
  | "unlock"
  | "move"
  | "remove";

export interface Page<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorBody {
  code: string;
  message: string;
  details: ErrorDetail[] | Record<string, unknown> | null;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

export interface UserOut {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface UserMe extends UserOut {
  email: string;
  role: Role;
  bio: string | null;
  karma: number;
  is_banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
}

export interface UserProfileOut extends UserOut {
  bio: string | null;
  karma: number;
  created_at: string;
}

export interface AuthOut {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserMe;
}

export interface CategoryOut {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
}

export interface ThreadSummary {
  id: number;
  title: string;
  category: CategoryOut;
  author: UserOut;
  tags: string[];
  score: number;
  comment_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  created_at: string;
  last_activity_at: string;
}

export interface ThreadDetail extends ThreadSummary {
  body_markdown: string;
  body_html: string;
  edited_at: string | null;
  my_vote: VoteValue;
  subscribed: boolean;
}

export interface CommentNode {
  id: number;
  thread_id: number;
  parent_id: number | null;
  depth: number;
  author: UserOut | null;
  body_markdown: string;
  body_html: string;
  score: number;
  my_vote: VoteValue;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  replies: CommentNode[];
}

export interface CommentSummary {
  id: number;
  thread_id: number;
  thread_title: string;
  body_markdown: string;
  score: number;
  is_deleted: boolean;
  created_at: string;
}

export interface VoteOut {
  score: number;
  karma: number;
  my_vote: VoteValue;
}

export interface ReportOut {
  id: number;
  content_type: ReportContentType;
  content_id: number;
  reason: string;
  note: string | null;
  reporter: UserOut;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface NotificationOut {
  id: number;
  type: NotificationType;
  thread_id: number;
  comment_id: number | null;
  actor: UserOut | null;
  is_read: boolean;
  created_at: string;
}

export interface AdminUserOut {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: Role;
  karma: number;
  is_banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  new_users_7d: number;
  total_threads: number;
  total_comments: number;
  comments_today: number;
  comments_7d: number;
  open_reports: number;
}

export interface AuditLogOut {
  id: number;
  actor: UserOut | null;
  action: string;
  target_type: "thread" | "comment" | "user" | "category" | "report";
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ---- Request bodies ---- */

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  username_or_email: string;
  password: string;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface UpdateProfileInput {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description: string | null;
  position: number;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  position?: number;
}

export interface CreateThreadInput {
  category_id: number;
  title: string;
  body: string;
  tags: string[];
}

export interface UpdateThreadInput {
  title?: string;
  body?: string;
  tags?: string[];
}

export interface CreateCommentInput {
  body: string;
  parent_id?: number | null;
}

export interface CreateReportInput {
  content_type: ReportContentType;
  content_id: number;
  reason: string;
  note?: string | null;
}

export interface ModerateThreadInput {
  action: ModerationAction;
  category_id?: number;
}

export interface ResolveReportInput {
  action: "remove_content" | "dismiss";
}

export interface BanUserInput {
  reason: string;
  expires_at?: string | null;
}

export interface SubscriptionState {
  subscribed: boolean;
}

export interface UnreadCount {
  unread: number;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
}
