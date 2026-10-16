import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useAuth } from '@/stores'

// Use createMemoryHistory for Electron production build to avoid issues with file:// protocol
// and createWebHistory for development
const history =
  process.env.NODE_ENV === 'production'
    ? createMemoryHistory(process.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL)

export const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/games',
      name: 'games',
      component: () => import('../views/GamesView.vue')
    },
    {
      path: '/games/:id',
      name: 'game',
      component: () => import('../views/GameView.vue')
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('../views/ContactView.vue')
    },
    {
      path: '/email-success',
      name: 'email-success',
      component: () => import('../views/EmailSuccessView.vue'),
      meta: {
        requiresAuth: false
      }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue')
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue')
    },
    {
      path: '/edit',
      name: 'edit',
      component: () => import('../views/EditProfileView.vue')
    },
    {
      path: '/cart',
      name: 'cart',
      component: () => import('../views/CartView.vue')
    },
    {
      path: '/subscription',
      name: 'subscription',
      component: () => import('../views/SubscriptionView.vue')
    },
    {
      path: '/payment',
      name: 'payment',
      component: () => import('../views/PaymentView.vue')
    },
    {
      path: '/postorder',
      name: 'postOrder',
      component: () => import('../views/PostOrderView.vue')
    },
    {
      path: '/postsubscription',
      name: 'postsubscription',
      component: () => import('../views/PostSubscriptionView.vue')
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('../views/UploadView.vue')
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('../desktop-views/DesktopLibraryView.vue')
      // component: () => import('../views/LibraryView.vue')
    },
    {
      path: '/orders',
      name: 'orders',
      component: () => import('../views/OrderHistoryView.vue')
    },
    {
      path: '/webgame/:game',
      name: 'webgame',
      component: () => import('../views/WebGameView.vue')
    },
    {
      path: '/ach-pass',
      name: 'ach-pass',
      component: () => import('../views/AchievementsPassView.vue')
    },
    {
      // Achievements are edited on boly.cl; the app shows them read-only.
      path: '/developer/:game/achievements',
      redirect: (to) => `/games/${to.params.game}/achievements`
    },
    {
      path: '/u/:username',
      name: 'public-profile',
      component: () => import('../views/PublicProfileView.vue')
    },
    {
      path: '/developer/:game/edit',
      name: 'edit-game-data',
      component: () => import('../views/EditGameView.vue')
    },
    {
      path: '/games/:id/achievements',
      name: 'game-achievements',
      component: () => import('../views/GameAchievementsView.vue')
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/Policies/PrivacyPolicyView.vue')
    },
    {
      path: '/legal',
      name: 'legal',
      component: () => import('../views/Policies/LegalInfoView.vue')
    },
    {
      path: '/subscriber-agreement',
      name: 'subscriber-agreement',
      component: () => import('../views/Policies/SubscriberAgreementView.vue')
    },
    {
      path: '/refund',
      name: 'refund',
      component: () => import('../views/Policies/RefundView.vue')
    },
    {
      path: '/cookies',
      name: 'cookies',
      component: () => import('../views/Policies/CookiesView.vue')
    },
    {
      path: '/wishlist',
      name: 'wishlist',
      component: () => import('../views/WishlistView.vue'),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/payment-methods',
      name: 'payment-methods',
      component: () => import('../views/PaymentMethodsView.vue'),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/payment-methods/callback',
      name: 'payment-methods-callback',
      component: () => import('../views/PaymentMethodCallbackView.vue'),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/subscription-management',
      name: 'subscription-management',
      component: () => import('../views/SubscriptionManagementView.vue'),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('../views/VerifyEmailView.vue'),
      meta: {
        requiresAuth: false //todo: true or false
      }
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: {
        requiresAuth: false
      }
    },
    {
      path: '/confirm-password-reset',
      name: 'confirm-password-reset',
      component: () => import('../views/ConfirmPasswordResetView.vue'),
      meta: {
        requiresAuth: false
      }
    },
    {
      path: '/my-discount-codes',
      name: 'my-discount-codes',
      component: () => import('../views/DiscountCodesView.vue'),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/redeem-code/:code',
      name: 'redeem-code',
      component: () => import('../views/RedeemCodeView.vue'),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/sudoku-game',
      name: 'sudoku',
      component: () => import('../components/games/SudokuGame.vue')
    },
    {
      path: '/report-problem',
      name: 'report-problem',
      component: () => import('../views/ReportProblemView.vue'),
      meta: {
        requiresAuth: false
      }
    },
    {
      path: '/session-invalidated',
      name: 'session-invalidated',
      component: () => import('../views/SessionInvalidatedView.vue'),
      meta: {
        requiresAuth: false
      }
    },
    {
      path: '/player-stats',
      name: 'player-stats',
      component: () => import('../views/GameStatsPlayerView.vue'),
      meta: {
        requiresAuth: true
      }
    }
  ],
  //@ts-ignore
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

const DEV_SKIP_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_AUTH === 'true'

//@ts-ignore
router.beforeEach(async (to, from, next) => {
  if (DEV_SKIP_AUTH) {
    next()
    return
  }

  const auth = useAuth()

  try {
    await auth.checkToken()

    // If user is not logged in and accessing home route, redirect to login
    if (to.path === '/' && !auth.isLoggedIn) {
      next('/login')
      return
    }

    if (to.meta.requiresAuth && !auth.isLoggedIn) {
      next('/login')
    } else if (to.path === '/account' && !auth.isLoggedIn) {
      next('/login')
    } else {
      next()
    }
  } catch (error) {
    console.error('Auth error in router guard:', error)

    // If auth check fails and user is accessing home route, redirect to login
    if (to.path === '/') {
      next('/login')
      return
    }

    if (to.meta.requiresAuth || to.path === '/account') {
      next('/login')
    } else {
      next()
    }
  }
})

export default router
