/*
 * Typed contract shapes shared by the admin app.
 * These repeat the shapes declared in the sprint's shared interface.
 */

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: ErrorDetail[] | Record<string, unknown> | null;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

export interface Page<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

export type Role = "user" | "moderator" | "admin";

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
  my_vote: 1 | -1 | 0;
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
  my_vote: 1 | -1 | 0;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  replies: CommentNode[];
}

export type ReportStatus = "open" | "resolved" | "dismissed";

export interface ReportOut {
  id: number;
  content_type: "thread" | "comment";
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
  type: "reply" | "mention" | "thread_comment";
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

export type AuditTargetType =
  | "thread"
  | "comment"
  | "user"
  | "category"
  | "report";

export interface AuditLogOut {
  id: number;
  actor: UserOut | null;
  action: string;
  target_type: AuditTargetType;
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type CategoryWrite = {
  name: string;
  slug: string;
  description: string | null;
  position: number;
};

export type CategoryPatch = Partial<CategoryWrite>;
