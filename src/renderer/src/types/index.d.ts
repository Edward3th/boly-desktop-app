import type { Store } from 'pinia'

export interface LocalizedString {
  [key: string]: string
}

export interface User {
  userId?: number
  email: string
  username: string
  roleId: number
  birthday?: Date
  bio?: string
  profilePictureUrl?: string
  developerId?: number
  hash?: string
  token?: string
  email_verified: boolean
  isSubscribed?: boolean
}

export interface AuthState {
  token: string
  isLoggedIn: boolean
  error?: string
}

export interface GameType {
  game_type_id: number
  name: string
}

export interface Game {
  game_id: number
  name: LocalizedString
  description?: LocalizedString
  price: object
  banner_url?: string
  release_date: Date
  developer_id: number
  game_type_id: number
  game_type: GameType
  game_Path: string
  /** How the installed build runs: spawn the exe, or open its index.html. */
  game_Kind?: 'exe' | 'html'
  /** Folder the build was extracted into; what uninstalling deletes. */
  game_Root?: string
  /**
   * file_name.desktop of the build that is actually installed on disk. Differs
   * from the game's current file_name.desktop once a newer build is approved,
   * which is what surfaces the Update button.
   */
  installedBuildKey?: string
  file_name?: {
    desktop?: string
    web?: string
    [key: string]: string | undefined
  }
  isDownloaded?: boolean
  isDownloading?: boolean
  downloadError?: string
  isInstalled?: boolean
  isInstalling?: boolean
  installError?: string
  /** Not a real purchase — surfaced to admins/the studio's own developer so
   *  a build can be installed and played for review before it's approved. */
  pending_review?: boolean
  pending_build_id?: number
  /** Admin-only flag on the API: playable without a subscription. */
  free_to_play?: boolean
  /** Present on the public list and detail; null until the studio fills it in. */
  education?: GameEducationSummary | null
}

// ─── Mineduc curriculum & per-game educational content ───────────────────────
// Mirrors ffstudios-shop's types; the app only reads them.

// A grade level (Kínder .. 4° medio). "Grade", not "course": on the API a
// course is a class inside an institution.
export interface CurriculumGrade {
  grade_id: number
  code: string // NT2, 1B..8B, 1M..4M
  name: string
  stage: 'parvularia' | 'basica' | 'media'
  sort_order: number
}

// What the store's subject filter shows (groups Biología/Física/Química under
// "Ciencias Naturales", Kínder núcleos under their closest subject...).
export interface CurriculumSubjectGroup {
  subject_group_id: number
  slug: string
  name: string
  sort_order: number
}

export interface CurriculumSubject {
  subject_id: number
  name: string
  subject_group_id: number
  sort_order: number
  grade_ids: number[] // grades it is taught in, in grade order
}

export interface CurriculumCatalog {
  grades: CurriculumGrade[]
  subject_groups: CurriculumSubjectGroup[]
  subjects: CurriculumSubject[]
}

export interface CurriculumUnit {
  unit_id: number
  grade_id: number
  subject_id: number
  area: string
  number: number | null // null for Kínder núcleos
  title: string
  focus: string | null
  curricular_plan: string | null
  curricular_note: string | null
  source_url: string | null
}

export interface GameEducationTarget {
  grade_id: number
  subject_id: number
}

export interface GameEducationSummary {
  short_description: LocalizedString | null
  topic: LocalizedString | null
  targets: GameEducationTarget[]
}

export interface GameEducation {
  game_id: number
  description: LocalizedString | null
  short_description: LocalizedString | null
  topic: LocalizedString | null
  teaching_guide: unknown | null
  targets: (GameEducationTarget & {
    grade_code: string
    grade_name: string
    subject_name: string
    subject_group_id: number
  })[]
  units: CurriculumUnit[]
  oas: {
    oa_id: number
    grade_id: number
    subject_id: number
    code: string
    text: string
    unit_ids: number[] // every unit that works on it — intersect with `units`
  }[]
}

export interface Achievement {
  id: number
  achievement_code: string
  name: {
    en: string
    es: string
  }
  description: {
    en: string
    es: string
  }
  unlock_requirement: number
  type: string
  secret: boolean
  gameId: number
  icon_url?: string
  progress?: number
  current_progress?: number
}

export interface AchievementStoreState {
  inspectedGame: Partial<Game>
  achievements: Achievement[]
  loading: boolean
}

export type AchievementStore = AchievementStoreState & {
  fetchAchievements(gameId: number, auth: { token: string }): Promise<void>
  updateAchievements(auth: { token: string }): Promise<{ message: string; error: string }>
  fetchUserProgress(gameId: number, auth: { token: string }): Promise<any>
}

export interface UserUpdateRequest {
  username: string
  email: string
  birthday?: string
  bio?: string
  profile_picture_url?: string
}

export interface PasswordUpdateRequest {
  oldpass: string
  pass: string
}

export interface SubscriptionState {
  subscriptions: Subscription[]
  loading: boolean
  error: string | null
  paymentResult: any | null
  transactionStatus: any | null
  cancelSuccess: boolean
}

export interface Subscription {
  subscription_id: number
  user_id: number
  plan_id: number
  is_active: number
  auto_renew: number
  active_until: Date
}

export interface SubscriptionResponse {
  subscription: Subscription | Subscription[]
  message?: string
}

export interface AuthToken {
  token: string
}

export interface PaymentMethod {
  payment_method_id: number
  user_id: number
  provider: string
  tbk_user: string
  card_type: string
  last_four_digits: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PaymentState {
  token: string
  hostUrl: string
  transactionUrl: string | null
  orderId: string
  sessionId: string
  discount: number
  totalPrice: number
  order: number[]
  orderResult: Record<string, any>
  discount_code: string
  isCodeValid: boolean
  isCodeInvalid: boolean
  loading: boolean
  error: string | null
  paymentMethods: PaymentMethod[]
  enrollmentToken: string
  enrollmentUrl: string
  enrollmentLoading: boolean
  enrollmentError: string | null
}

export interface WishlistItem {
  user_id: number
  game_game_id: number
}

export interface Developer {
  developer_id: number
  name: string
  web_url?: string
  picture_url?: string
  banner_url?: string
  description?: Record<string, string>
}

export interface Order {
  order_id: number
  discount_code?: string
  final_amount: {
    amount: number
    currency: string
  }
  state: string
  session_id?: string
  token: string
  created_at: Date
  updated_at: Date
  user_id: number
  subscription_id?: number
  payment_method_id?: number
  details?: string
}

export interface Auth {
  token: string
  isLoggedIn: boolean
}

export enum DiscountType {
  PERCENTAGE_ORDER = 'PERCENTAGE_ORDER',
  SUBSCRIPTION_ACCESS = 'SUBSCRIPTION_ACCESS',
  TEMPORARY_GAME_ACCESS = 'TEMPORARY_GAME_ACCESS'
}

export enum SubscriptionDurationUnit {
  DAYS = 'day',
  MONTHS = 'month',
  YEARS = 'year'
}

export interface DiscountCode {
  discount_code_id: number
  code: string
  is_active: boolean
  valid_from?: Date
  valid_until?: Date
  discount_type: DiscountType
  discount_percentage?: number
  applies_to_game_id?: number
  applies_to_plan_id?: number
  subscription_duration_value?: number
  subscription_duration_unit?: SubscriptionDurationUnit
  max_total_uses?: number
  current_total_uses: number
  max_unique_users?: number
}

export interface ApplicablePlan {
  plan_id: number
  name: string
  price: number
}

export interface DiscountCodeValidation {
  discount_code_id: number
  code: string
  discount_type: DiscountType
  discount_percentage?: number
  applies_to_game_id?: number
  applies_to_plan_id?: number
  subscription_duration_value?: number
  subscription_duration_unit?: SubscriptionDurationUnit
  applicablePlan?: ApplicablePlan
  message: string
}

export interface CreateDiscountCodeRequest {
  code: string
  is_active?: boolean
  valid_from?: Date
  valid_until?: Date
  discount_type: DiscountType
  discount_percentage?: number
  applies_to_game_id?: number
  applies_to_plan_id?: number
  subscription_duration_value?: number
  subscription_duration_unit?: SubscriptionDurationUnit
  max_total_uses?: number
  max_unique_users?: number
}

export interface UserHasDiscountCode {
  user_id: number
  discount_code_id: number
  created_at: string
  updated_at: string
  used_at?: string | Date | null
  discountCode: DiscountCode
}
