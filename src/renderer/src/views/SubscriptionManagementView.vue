<script setup lang="ts">
import Loading from '@/components/LoadingIcon.vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ref, onMounted, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSubscription, useAuth, useUser, usePayment } from '@/stores'
import type { Subscription, PaymentMethod } from '@/types'

const auth = useAuth()
const user = useUser()
const subscriptionStore = useSubscription()
const paymentStore = usePayment()
const router = useRouter()
const { t } = useI18n()

const { subscriptions, error, loading } = storeToRefs(subscriptionStore)
const showCancelModal = ref(false)
const currentSubscription = ref<Subscription | null>(null)
const paymentMethods = ref<PaymentMethod[]>([])
const isMobile = ref(window.innerWidth <= 768)

const PLAN_TYPES = {
  1: 'free',
  2: 'monthly',
  3: 'yearly'
}

const currentPlanType = computed(() => {
  if (!currentSubscription.value) return 'none'
  return getPlanType(currentSubscription.value.plan_id)
})

const isAutoRenewEnabled = computed(() => {
  if (!currentSubscription.value) return false
  return currentSubscription.value.auto_renew === 1
})

const currentPlanName = computed(() => {
  const planType = currentPlanType.value
  return t(planType + '_plan')
})

const currentPlanPrice = computed(() => {
  switch (currentPlanType.value) {
    case 'free':
      return t('free')
    case 'monthly':
      return t('month_price') + t('month')
    case 'yearly':
      return t('yearly_price') + t('year')
    default:
      return ''
  }
})

const currentPlanCredits = computed(() => {
  switch (currentPlanType.value) {
    case 'free':
      return '200'
    case 'monthly':
      return '1000'
    case 'yearly':
      return '12000'
    default:
      return '0'
  }
})

const getPlanType = (planId: number): string => {
  return PLAN_TYPES[planId as keyof typeof PLAN_TYPES] || 'none'
}

const handleResize = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)

  if (!auth.isLoggedIn && !auth.token) {
    router.push('/login')
    return
  }

  if (auth.isLoggedIn && user.userId) {
    try {
      const success = await subscriptionStore.getUserSubscriptions(user.userId, {
        token: auth.token
      })

      if (success && subscriptions.value.length > 0) {
        const activeSubscription = subscriptions.value.find((sub) => sub.is_active === 1)
        if (activeSubscription) {
          currentSubscription.value = activeSubscription
        }
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error)
    }

    try {
      await paymentStore.fetchPaymentMethods(user.userId, auth.token)
      paymentMethods.value = paymentStore.paymentMethods
    } catch (error) {
      console.error('Error fetching payment methods:', error)
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

const formatDate = (dateString: string | Date): string => {
  return new Date(dateString).toLocaleDateString()
}

const getCardIcon = (cardType: string): string => {
  const type = cardType.toLowerCase()
  if (type.includes('visa')) return '💳 Visa'
  if (type.includes('mastercard')) return '💳 MasterCard'
  if (type.includes('amex') || type.includes('american')) return '💳 American Express'
  if (type.includes('diners')) return '💳 Diners'
  if (type.includes('magna')) return '💳 Magna'
  return '💳 ' + cardType
}

// Plans and payment methods are managed on boly.cl; the app has no purchase
// pages for signed-in users.
const goToChangeSubscription = () => {
  window.open('https://boly.cl/subscription', '_blank')
}

const goToPaymentMethods = () => {
  window.open('https://boly.cl/payment-methods', '_blank')
}

const cancelSubscription = async () => {
  if (!auth.isLoggedIn || !currentSubscription.value) {
    return
  }

  try {
    const success = await subscriptionStore.cancelAutoRenewal(
      currentSubscription.value.subscription_id,
      { token: auth.token }
    )

    if (success) {
      // Refresh subscription data
      if (user.userId) {
        await subscriptionStore.getUserSubscriptions(user.userId, { token: auth.token })
      }
    }
  } catch (err) {
    console.error('Error cancelling subscription auto-renewal:', err)
  } finally {
    showCancelModal.value = false
  }
}

const renewSubscription = async () => {
  if (!auth.isLoggedIn || !currentSubscription.value) {
    return
  }

  try {
    const success = await subscriptionStore.renewSubscription(
      currentSubscription.value.subscription_id,
      { token: auth.token }
    )

    if (success) {
      if (user.userId) {
        await subscriptionStore.getUserSubscriptions(user.userId, { token: auth.token })
      }
    }
  } catch (err) {
    console.error('Error renewing subscription:', err)
  }
}
</script>

<template>
  <div v-if="loading" class="loading_container">
    <Loading />
  </div>

  <div :class="{ section: !isMobile, 'mobile-section': isMobile }">
    <div class="header">
      <h1>{{ t('subscription_management') }}</h1>
    </div>

    <div v-if="!loading" class="subscription-container">
      <!-- Error message -->
      <div v-if="error" class="error-message">{{ error }}</div>

      <!-- Current Plan Information -->
      <div v-if="currentSubscription" class="current-plan">
        <div class="plan-header">
          <h2>{{ t('current_subscription') }}</h2>
          <span :class="['plan-badge', `badge-${currentPlanType}`]">
            {{ currentPlanName }}
          </span>
        </div>

        <div class="plan-details">
          <div class="detail-item">
            <span class="detail-label">{{ t('plan_name') }}:</span>
            <span class="detail-value">{{ currentPlanName }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">{{ t('price') }}:</span>
            <span class="detail-value">{{ currentPlanPrice }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">{{ t('credits') }}:</span>
            <span class="detail-value">{{ currentPlanCredits }} {{ t('credits') }}</span>
          </div>
          <div v-if="isAutoRenewEnabled" class="detail-item">
            <span class="detail-label">{{ t('next_billing') }}:</span>
            <span class="detail-value">{{ formatDate(currentSubscription.active_until) }}</span>
          </div>
          <div v-else class="detail-item">
            <span class="detail-label">{{ t('expiration_date') }}:</span>
            <span class="detail-value">{{ formatDate(currentSubscription.active_until) }}</span>
          </div>
        </div>
        <div class="plan-actions">
          <button class="btn-purple" @click="goToChangeSubscription">
            {{ t('change_subscription') }}
          </button>

          <button
            v-if="currentPlanType !== 'free' && isAutoRenewEnabled"
            class="btn-red"
            @click="cancelSubscription"
          >
            {{ t('cancel_subscription') }}
          </button>

          <button
            v-if="currentPlanType !== 'free' && !isAutoRenewEnabled"
            class="btn-green"
            @click="renewSubscription"
          >
            {{ t('renew_subscription') }}
          </button>
        </div>
      </div>

      <div v-else class="no-subscription">
        <p>{{ t('no_active_subscription') }}</p>
        <button class="btn-purple" @click="goToChangeSubscription">
          {{ t('subscribe_now') }}
        </button>
      </div>

      <!-- Payment Method Information -->
      <div class="payment-methods">
        <h2>{{ t('payment_methods') }}</h2>

        <div v-if="paymentMethods.length > 0" class="card-list">
          <div v-for="method in paymentMethods" :key="method.payment_method_id" class="card-item">
            <div class="card-info">
              <div class="card-type">{{ getCardIcon(method.card_type) }}</div>
              <div class="card-details">
                <span class="card-number"
                  >{{ t('card_ending_in') }} {{ method.last_four_digits.slice(-4) }}</span
                >
                <span class="card-added"
                  >{{ t('added_on') }} {{ formatDate(method.created_at) }}</span
                >
              </div>
            </div>
          </div>

          <button class="btn-blue manage-btn" @click="goToPaymentMethods">
            {{ t('manage_payment_methods') }}
          </button>
        </div>

        <div v-else class="no-cards">
          <p>{{ t('no_payment_methods') }}</p>
          <button class="btn-blue" @click="goToPaymentMethods">
            {{ t('add_payment_method') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation buttons -->
    <button class="back-button" @click="router.go(-1)">{{ t('back') }}</button>

    <!-- Cancel Confirmation Modal -->
    <!-- <ConfirmModal
      v-if="showCancelModal"
      :title="t('confirm_cancellation')"
      :message="t('confirm_cancel_subscription')"
      :confirm-text="t('yes_cancel')"
      :cancel-text="t('no_keep_subscription')"
      @confirm="cancelSubscription"
      @close="showCancelModal = false"
    /> -->
  </div>
</template>

<style scoped>
.section {
  min-height: 50vh;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 80%;
}

.mobile-section {
  padding: 10px;
  width: 95%;
  margin: 0 auto;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h1 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 2.5rem;
  margin: 0;
  text-align: left;
}

h2 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 1.5rem;
  margin-top: 0;
  margin-bottom: 10px;
}

.subscription-container {
  display: flex;
  flex-direction: column;
  gap: 30px;
  width: 100%;
}

.current-plan,
.payment-methods {
  background-color: var(--boly-bg-dark-transparent);
  border-radius: 15px;
  padding: 20px;
  width: 100%;
  box-sizing: border-box;
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.plan-badge {
  padding: 5px 15px;
  border-radius: 30px;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 0.9rem;
}

.badge-free {
  background-color: var(--boly-button-blue);
  color: white;
}

.badge-monthly {
  background-color: var(--boly-button-purple);
  color: white;
}

.badge-yearly {
  background-color: var(--boly-highlight);
  color: black;
}

.plan-details {
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
  width: 100%;
  box-sizing: border-box;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.detail-label {
  font-weight: bold;
  color: var(--light);
}

.detail-value {
  color: var(--white);
}

.plan-actions {
  display: flex;
  gap: 15px;
  justify-content: flex-start;
}

.no-subscription {
  background-color: var(--boly-bg-dark-transparent);
  border-radius: 15px;
  padding: 30px;
  text-align: center;
}

.no-subscription p {
  margin-bottom: 20px;
  color: var(--light);
}

.payment-methods {
  margin-top: 10px;
}

.card-list {
  margin-top: 20px;
}

.card-item {
  background-color: var(--boly-bg-blue-transparent);
  border-radius: 10px;
  padding: 15px;
  margin-bottom: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-info {
  display: flex;
  align-items: center;
}

.card-type {
  font-size: 1.2rem;
  margin-right: 15px;
}

.card-details {
  display: flex;
  flex-direction: column;
}

.card-number {
  font-weight: bold;
  color: var(--white);
  margin-bottom: 5px;
}

.card-added {
  text-align: left;
  color: var(--gray);
  font-size: 0.8rem;
}

.manage-btn {
  margin-top: 15px;
}

.no-cards {
  text-align: center;
  padding: 20px 0;
  color: var(--gray);
}

.error-message {
  background-color: rgba(245, 101, 101, 0.2);
  color: #f56565;
  padding: 10px;
  border-radius: 5px;
  margin-bottom: 15px;
  font-weight: bold;
}

.back-button {
  margin-top: 20px;
  padding: 8px 15px;
  border: none;
  border-radius: 5px;
  background-color: var(--boly-button-blue);
  color: white;
  font-family: 'Anton', sans-serif;
  cursor: pointer;
  transition: 0.2s;
}

.back-button:hover {
  background-color: var(--boly-button-blue-hover);
}

button,
.btn-purple,
.btn-blue,
.btn-red,
.btn-green {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  font-family: 'Anton', sans-serif;
  font-size: 1rem;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-purple {
  background-color: var(--boly-button-purple);
}

.btn-purple:hover {
  background-color: var(--boly-button-purple-hover);
}

.btn-blue {
  background-color: var(--boly-button-blue);
}

.btn-blue:hover {
  background-color: var(--boly-button-blue-hover);
}

.btn-red {
  background-color: var(--boly-button-red);
}

.btn-red:hover {
  background-color: var(--boly-button-red-hover);
}

.btn-green {
  background-color: #10b981; /* Green color for the renew button */
}

.btn-green:hover {
  background-color: #059669; /* Darker green for hover state */
}

/* Mobile specific styles */
@media (max-width: 768px) {
  h1 {
    font-size: 1.8rem;
  }

  .plan-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .plan-actions {
    flex-direction: column;
    width: 100%;
  }

  .plan-actions button {
    width: 100%;
  }

  .card-info {
    width: 100%;
  }
}

/* Very small screens */
@media (max-width: 480px) {
  .current-plan,
  .payment-methods {
    padding: 15px;
  }

  .plan-details {
    padding: 15px;
  }

  .detail-item {
    flex-direction: column;
    gap: 5px;
  }

  .card-item {
    padding: 10px;
  }

  .card-type {
    font-size: 1rem;
  }
}
</style>
