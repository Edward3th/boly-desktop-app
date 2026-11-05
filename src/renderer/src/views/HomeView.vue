<script setup lang="ts">
import { ref } from 'vue'
import AlertModal from '@/components/AlertModal.vue'
import FeaturedHeroCarousel from '@/components/games/FeaturedHeroCarousel.vue'
import QuickAccessPanel from '@/desktop-components/QuickAccessPanel.vue'
import AppUpdateActions from '@/desktop-components/AppUpdateActions.vue'
import useAppUpdateStore from '@/desktop-stores/appUpdate'

const appUpdate = useAppUpdateStore()
const showUpdateStatus = ref(false)

// Modal reactive variables
const showModal = ref(false)
const modalText = ref('')

/** The quick-access panel reports its own successes and failures through here. */
function notify(message: string) {
  modalText.value = message
  showModal.value = true
}
</script>

<template>
  <transition name="fade">
    <div v-if="showUpdateStatus" class="update-backdrop" @click="showUpdateStatus = false">
      <div class="update-status-container" @click.stop>
        <div class="update-status-header">
          <h3>{{ $t('update_info') }}</h3>
          <button class="close-button" @click="showUpdateStatus = false">×</button>
        </div>

        <AppUpdateActions />

        <p class="version">{{ appUpdate.currentVersion }}</p>
      </div>
    </div>
  </transition>

  <button class="info-button" @click="showUpdateStatus = !showUpdateStatus">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      class="bi bi-info-square-fill"
      viewBox="0 0 16 16"
    >
      <path
        d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm8.93 4.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM8 5.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2"
      />
    </svg>
  </button>

  <section class="hero">
    <div class="hero-bg color-orange"></div>
    <div class="hero-content">
      <FeaturedHeroCarousel />
    </div>
  </section>

  <QuickAccessPanel @notify="notify" />

  <Teleport to="body">
    <AlertModal :show="showModal" @close="showModal = false">
      <template #header>
        <h3>{{ $t('notification') }}</h3>
      </template>
      <template #body> {{ modalText }} </template>
    </AlertModal>
  </Teleport>
</template>

<style scoped>
body {
  overflow-x: hidden;
}

.section {
  padding-bottom: 20px;
}

.darkened {
  background: rgb(57, 23, 117);
  background: linear-gradient(135deg, rgba(57, 23, 117, 1) 15%, rgba(0, 83, 205, 1) 98%);
}

.color-green {
  background: rgb(187, 217, 37);
}

.color-blue {
  background: rgb(64, 168, 226);
}

.color-orange {
  background: var(--boly-bg-orange);
}

.color-pink {
  background: rgb(247, 70, 171);
}

.color-purple {
  background: rgb(78, 69, 153);
  border: 1px solid rgb(78, 69, 153);
}

/* Hero
   The orange band sits in its own absolutely-positioned layer so the slanted
   clip-path (which continues the navbar's skew) never clips the carousel.
-------------------------------------------- */
.hero {
  position: relative;
  width: 100%;
  /* Slide up behind the navbar so the two orange areas read as one band.
     Deliberately no z-index here: it would create a stacking context and trap
     .hero-content below the navbar, which then clips the carousel's corner. */
  position: relative;
  margin-top: -10rem;
  padding: 7rem 0 5rem;
}

.hero-bg {
  position: absolute;
  inset: 0;
  clip-path: polygon(0% 10%, 100% 0%, 100% 100%, 0% 100%);
  transform-origin: top left;
  z-index: 0;
}

/* Sits above the navbar (z-index 100) so the carousel can tuck up under the
   navbar's skewed band without its top-left corner being covered by it. Both
   are the same orange, so the overlap is invisible. */
.hero-content {
  position: relative;
  z-index: 101;
}

@media (max-width: 900px) {
  .hero {
    padding: 6rem 0 3.5rem;
  }
}

.romboid {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin: -3.5vw auto 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  padding: 0 2rem;
}

.romboid p {
  font-family: 'Poppins', sans-serif;
  color: white;
  transform: none;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.romboid h2 {
  font-family: 'Poppins', sans-serif;
  background: white;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: white !important;
  font-size: 70px;
  transform: rotate(-2deg);
  font-weight: 900;
  -webkit-text-stroke: 3px rgba(255, 255, 255, 0.2);
  filter: drop-shadow(2px 2px 0px rgba(135, 206, 250, 0.6))
    drop-shadow(0 2px 4px rgba(173, 216, 230, 0.4));
}

.home-body1-description {
  margin-top: 4.6rem;
  font-family: 'Poppins', sans-serif !important;
  transform: none !important;
  font-size: 28px !important;
  text-align: center !important;
  font-weight: 400 !important;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  width: 80%;
}

.title-section {
  transform: rotate(-3deg);
}

.main {
  padding-top: 30rem;
  margin-bottom: 0rem;
  margin-top: -20rem;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  clip-path: polygon(0% 20%, 100% 0%, 100% 100%, 0% 100%);
  transform-origin: top left;
  z-index: 2;
  position: relative;
  width: 100%;
}

.home-section {
  padding: 12rem 4rem;
  margin-top: -1rem;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  transform-origin: top left;
  z-index: 2;
  position: relative;
}

.main p {
  padding-inline: 5rem;
  z-index: 2;
  position: relative;
  width: 80vw;
}

.divider {
  margin-top: -4rem;
  padding-top: 5rem;
  margin-bottom: -1rem;
  padding-bottom: 2rem;
  clip-path: polygon(0% 50%, 100% 0%, 100% 100%, 0% 100%);
  transform-origin: top left;
  position: relative;
  z-index: 4;
}

.pre-footer {
  margin-bottom: -15rem;
  padding-bottom: 5rem;
  padding-top: 2rem;
  clip-path: polygon(0% 0%, 100% 0%, 0% 100%, 0% 100%);
  transform-origin: top left;
  position: relative;
  z-index: 1;
}

.animated-section {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr 1fr 2fr 1fr 2fr;
  justify-items: center;
  width: 80%;
  grid-template-rows: auto auto;
}

.animated-item {
  flex-direction: column;
  align-items: center;
  text-align: center;
  align-self: center;
  color: white;
  font-size: 28px;
  font-family: Arial, sans-serif;
}

.graph-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  justify-items: center;
  width: 70%;
  grid-template-rows: auto auto;
}

.graph-section * {
  grid-column-start: var(--x);
  grid-row-start: var(--y);
}

.carousel-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  justify-items: center;
  align-items: center;
  width: 100%;
  height: 100vh;
}

.carousel-section img {
  width: 20rem;
  height: auto;
}

.view-container {
  height: var(--h, 50rem);
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding-bottom: 10rem;
}

.view-container-grid {
  padding-inline: 10rem;
  column-gap: 15rem;
  row-gap: 0rem;
  height: 50rem;
  width: 100%;
  display: grid;
  grid-template-columns: 5fr 4fr;
  grid-template-rows: 13rem;
  justify-items: center;
  align-items: center;
  grid-auto-rows: max-content;
}

.view-container-grid h2 {
  line-height: 100%;
}

.view-container-grid * {
  align-self: start;
}

.form-element {
  background-color: transparent;
  border-color: white;
  border: 4px solid #ffffff;
  border-radius: 15px 15px 15px 15px;
  -webkit-border-radius: 15px 15px 15px 15px;
  -moz-border-radius: 15px 15px 15px 15px;
  padding: 1rem;
  margin: 1rem;
  width: 100%;
  height: var(--h, 4rem);
  color: white;
  font-weight: bold;
  font-size: 18px;
  display: flex;
}

.form-element select,
.form-element option {
  background-color: rgba(64, 168, 226, 0.9);
  color: white;
}

.form-element option:hover {
  background-color: rgba(64, 168, 226, 1);
}

.form-element::placeholder {
  vertical-align: text-top;
  color: white;
  font-weight: bold;
  font-size: 18px;
}

.form-element:focus {
  outline: none;
}

.form-button {
  background-color: #b533c7;
  color: white;
  font-weight: bold;
  font-size: 18px;
  border: none;
  padding: 12px 30px;
  border-radius: 12px;
  cursor: pointer;
  text-transform: uppercase;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  transition: 0.3s;
  width: 50vh;
  font-family: 'Poppins', sans-serif;
}

.form-button:hover {
  background-color: #9d2fad;
}

.RRSS-container-section {
  z-index: 5;
  display: flex;
  max-width: 100%;
}

.RRSS-container-grid {
  column-gap: 2rem;
  width: 50%;
  height: 25rem;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  justify-items: center;
  align-items: center;
  z-index: 5;
  margin: auto;
  max-width: 100%;
}

.RRSS-item {
  background-image: url('@/assets/images/elements/6.webp');
  background-size: cover;
  width: 10rem;
  height: 35rem;
  padding-top: 0rem;
  margin-top: -12rem;
}

.RRSS-item p {
  transform: rotate(-90deg);
  margin-top: 8rem;
  margin-left: -6rem;
  text-align: end;
  font-size: 4rem;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  color: rgb(78, 69, 153);
  width: 22rem;
}

.RRSS-item img {
  width: 15rem;
  margin-left: -2.25rem;
  height: 8rem;
  margin-top: 6rem;
}

.item-form-grid {
  grid-column-start: var(--column-s);
  grid-column-end: var(--column-e);
  grid-row-start: var(--row-s);
  grid-row-end: var(--row-e);
  height: auto;
}

.item-form-grid h2 {
  text-align: left;
  align-self: start;
  font-size: 3vw;
}

.item-form-grid p {
  text-align: left;
  align-self: start;
  font-size: 2vw;
}

.item-graph {
  font-family: 'Poppins', sans-serif;
  flex-direction: column;
  align-items: center;
  text-align: center;
  align-self: center;
  color: white;
  font-size: 28px;
}

.item-graph * {
  font-weight: bold;
}

.item-graph-img {
  width: 25rem;
  height: 25rem;
  margin: -2rem;
}

.button {
  padding-inline: 10px;
  height: 40px;
  border: none;
  border-radius: 10px;
  color: white;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: larger;
}

.boly-container {
  position: absolute;
  top: 150px;
  left: 30%;
  width: 300px;
  height: 300px;
  z-index: 5;
  overflow: hidden;
}

.boly-container video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

p {
  text-align: center;
  font-family: 'Lato', sans-serif;
  font-size: 1.75rem;
  width: 100%;
}

h2 {
  text-align: center;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 3.75rem;
  width: 100%;
}

h1 {
  text-align: center;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 500%;
  width: 100%;
}

.img-dev {
  height: 50%;
  width: auto;
}

.section-title {
  text-align: left;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: 300%;
}

.section-text {
  text-align: left;
  font-size: 115%;
  margin: 40px;
  width: 80%;
}

.home-title-card {
  margin-left: auto;
}

.svg-container {
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  width: 60%;
  padding: 0 5vw;
  gap: 8rem;
}

.svg-link {
  text-decoration: none;
  color: inherit;
  display: block;
}

.svg-left,
.svg-right {
  transition: all 0.3s ease;
  cursor: pointer;
}

.svg-left {
  align-self: flex-start;
}

.svg-right {
  align-self: flex-end;
}

.svg-left img,
.svg-right img {
  width: 15vw;
  height: auto;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
  transition: all 0.3s ease;
}

.svg-left:hover,
.svg-right:hover {
  transform: scale(1.05);
}

.svg-left:hover::before,
.svg-right:hover::before {
  content: '';
  position: absolute;
  top: -20px;
  left: -20px;
  right: -20px;
  bottom: -20px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 15px;
  z-index: -1;
  transition: all 0.3s ease;
}

.svg-left h3,
.svg-right h3 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 2rem;
  color: white;
  text-align: center;
  margin: 2rem 0 0rem 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  letter-spacing: 1px;
}

.svg-left p,
.svg-right p {
  font-family: 'Poppins', sans-serif;
  font-size: 1.2rem;
  color: white;
  text-align: center;
  margin: 0 1rem;
  line-height: 1.6;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  font-weight: 400;
}

/* Our Project Section Styles */
.our-project-content {
  width: 100%;
  max-width: 1200px;
  padding: 0 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rem;
}
.flow-arrow {
  font-size: 2rem;
  color: white;
  margin: 0 1rem;
}

.flow-item {
  display: flex;
  align-items: center;
  filter: drop-shadow(10px 8px 2px rgba(0, 0, 0, 0.2));
}

.flow-icon {
  width: 180px;
  height: 180px;
  display: flex;
  justify-content: space-between;
}

.flow-icon:hover {
  transform: scale(1.05);
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.3));
  transition: all 0.3s ease;
}

.project-description {
  text-align: center;
  max-width: 900px;
}

.main-description {
  font-family: 'Poppins', sans-serif;
  font-size: 2rem;
  font-weight: 600;
  color: white;
  margin-bottom: 2rem;
  line-height: 1.4;
}

.secondary-description {
  font-family: 'Poppins', sans-serif;
  font-size: 1.4rem;
  font-weight: 400;
  color: white;
  line-height: 1.6;
  opacity: 0.9;
  margin-bottom: 100px;
}

.process-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2rem 0;
}

.dev-icons-image {
  max-width: 100%;
  height: auto;
  max-height: 300px;
  object-fit: contain;
  filter: drop-shadow(0 8px 32px rgba(0, 0, 0, 0.2));
  transition: all 0.3s ease;
}

.dev-icons-image:hover {
  transform: scale(1.05);
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.3));
}

.connection-text {
  text-align: center;
  max-width: 800px;
}

.connection-text p {
  font-family: 'Poppins', sans-serif;
  font-size: 1.3rem;
  color: white;
  line-height: 1.6;
  font-weight: 400;
}

.target-audience {
  width: 100%;
}

.target-audience h2 {
  text-align: center;
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 2.5rem;
  color: white;
  margin: 0 auto 3rem auto;
  width: 65%;
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.3));
}

.audience-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0rem;
  max-width: 880px;
  margin: 0 auto;
  position: relative;
}

.audience-grid::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 10%;
  bottom: 10%;
  width: 4px;
  background: #ffffff;
  transform: translateX(-50%);
  z-index: 10;
  border-radius: 2px;
  box-shadow: 0 0 25px rgba(255, 255, 255, 0.5);
}

.audience-column {
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 1rem;
  position: relative;
  z-index: 2;
}

.audience-column h3 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 2rem;
  color: white;
  margin-bottom: 1.5rem;
}

.audience-column ul {
  list-style: none;
  padding: 0;
  margin: 0 0 2rem 0;
}

.audience-column li {
  font-family: 'Poppins', sans-serif;
  font-size: 1.1rem;
  color: white;
  margin-bottom: 0.8rem;
  position: relative;
  padding-left: 7rem;
  text-align: left;
}

.audience-column li::before {
  content: '';
  background-image: url('@/assets/svgs/HomeViewSvgs/tick.svg');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  width: 1rem;
  height: 1rem;
  position: absolute;
  left: 5.5rem;
  top: 0.15rem;
}

.cta-button {
  font-family: 'Poppins', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  padding: 1rem 2rem;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.educators-btn {
  background: var(--boly-button-pink);
  color: white;
}

.educators-btn:hover {
  background: var(--boly-button-pink-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.developers-btn {
  background: linear-gradient(135deg, #512da8, #4527a0);
  color: white;
}

.developers-btn:hover {
  background: linear-gradient(135deg, #673ab7, #512da8);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.our-project-title {
  font-family: 'Poppins', sans-serif;
  background: white;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: white !important;
  font-size: 70px;
  transform: rotate(-2deg);
  font-weight: 900;
}

.our-games-title {
  font-family: 'Poppins', sans-serif;
  background: white;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: white !important;
  font-size: 50px;
  font-weight: 900;
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.3));
  margin-top: 200px;
}

.our-games-content {
  width: 100%;
  max-width: 1200px;
  padding: 0 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rem;
}

.games-section-bg {
  background-image: url('@/assets/images/boly/back-bd.webp');
  background-size: cover;
  background-repeat: no-repeat;
}

.games-btn {
  background: var(--boly-button-pink);
  color: white;
  font-family: 'Poppins', sans-serif;
  font-size: 1.3rem;
  font-weight: 600;
  padding: 1rem 3rem;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.games-btn:hover {
  background: var(--boly-button-pink-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

@media (max-width: 768px) {
  .audience-grid {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .main-description {
    font-size: 1.5rem;
  }

  .secondary-description {
    font-size: 1.2rem;
  }

  .dev-icons-image {
    max-width: 90%;
  }
}

/* Technology Section Styles */
.technology-content {
  width: 100%;
  max-width: 1200px;
  padding: 0 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rem;
}

.technology-cards {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 2rem;
  width: 100%;
  max-width: 1000px;
}

.tech-card {
  background: rgba(255, 255, 255, 0.15);
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 25px;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  transition: all 0.3s ease;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  position: relative;
  min-height: 300px;
}

.tech-card:hover {
  transform: translateY(-10px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.solution-card {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.card-visual {
  width: 240px;
  height: 240px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-svg {
  width: 240px;
  height: 240px;
  transition: all 0.3s ease;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
}

.solution-svg {
  animation: pulse-glow 3s ease-in-out infinite;
}

.tech-card:hover .card-svg {
  transform: scale(1.1);
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
}

@keyframes pulse-glow {
  0%,
  100% {
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
    transform: scale(1);
  }
  50% {
    filter: drop-shadow(0 8px 16px rgba(255, 215, 0, 0.4));
    transform: scale(1.05);
  }
}

.card-percentage {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-size: 3rem;
  color: white;
  font-weight: 900;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  margin: 0;
}

.card-text {
  text-align: center;
}

.card-text p {
  font-family: 'Poppins', sans-serif;
  font-size: 1rem;
  color: white;
  margin: 0.5rem 0;
  line-height: 1.4;
}

.card-text strong {
  font-weight: 700;
}

.concrete-example {
  max-width: 800px;
  text-align: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 2rem;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.concrete-example p {
  font-family: 'Poppins', sans-serif;
  font-size: 1.2rem;
  color: white;
  margin: 0;
  line-height: 1.6;
  font-style: italic;
}

@media (max-width: 768px) {
  .technology-cards {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .card-percentage {
    font-size: 2.5rem;
  }

  .concrete-example {
    padding: 1.5rem;
  }

  .concrete-example p {
    font-size: 1rem;
  }
}

/* Boly Carousel Section Styles */

.boly-carousel-content {
  width: 100%;
  max-width: 1200px;
  padding: 0 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3rem;
}

.boly-carousel-content .carousel-container {
  flex-direction: column;
  background-color: white;
  border-radius: 20px;
  align-items: center;
  overflow: hidden;
  width: 100%;
  max-width: 900px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.boly-carousel-content .mobile-carousel {
  margin: 0 auto;
  max-width: 100%;
  border-radius: 15px;
}

.boly-slide {
  width: 100%;
  display: flex;
  flex-direction: row;
  padding: 3rem;
  gap: 2rem;
  align-items: center;
}

.boly-slide.mobile-slide {
  flex-direction: column;
  padding: 2rem 1rem;
  gap: 1.5rem;
}

.boly-slide-image-only {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
}

.boly-slide-image-only.mobile-slide {
  padding: 1rem;
}

.boly-image-wrapper {
  position: relative;
  width: 350px;
  height: 250px;
  overflow: hidden;
  border-radius: 15px;
  flex-shrink: 0;
  margin: 0 1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.boly-image-wrapper.mobile-image {
  width: 100%;
  height: auto;
  max-height: 250px;
  border-radius: 10px;
  margin: 0;
}

.boly-image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 15px;
  transition: transform 0.3s ease;
}

.boly-image-wrapper img:hover {
  transform: scale(1.02);
}

.boly-details {
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  padding-left: 2rem;
}

.boly-details.mobile-details {
  text-align: center;
  padding: 0;
  max-width: 100%;
}

.boly-details h3 {
  font-family: 'Anton', Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
  font-style: italic;
  font-size: 2rem;
  color: white;
  margin-bottom: 1rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.boly-details.mobile-details h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.boly-desc {
  font-family: 'Poppins', sans-serif;
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
}

.boly-desc.mobile-desc {
  font-size: 1rem;
}

.boly-nav-counter {
  height: 50px;
  display: flex;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 200%;
  justify-content: center;
  align-items: center;
  margin-top: 1rem;
}

.boly-nav-counter.mobile-nav-counter {
  height: 40px;
  gap: 0.4rem;
  font-size: 150%;
}

.boly-nav-dot {
  transition:
    transform 0.2s ease,
    color 0.2s ease;
  user-select: none;
  color: rgba(255, 255, 255, 0.5);
}

.boly-nav-dot:hover {
  transform: scale(1.2);
  color: rgba(255, 255, 255, 0.8);
}

.boly-nav-dot.active {
  color: white;
}

/* Carousel component styling for boly section */
.boly-carousel-content .carousel__icon {
  fill: white;
  transition: transform 0.2s ease;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
}

.boly-carousel-content .carousel__icon:hover {
  transform: scale(1.2);
}

.form-subtitle {
  font-family: 'Anton', sans-serif;
  font-size: 2.5rem;
  color: white;
  margin-top: 1rem;
  text-align: left;
}

.update-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 999;
  pointer-events: all;
}

.update-status-container {
  position: fixed;
  bottom: 80px;
  right: 20px;
  background: #1a1a2e;
  color: white;
  padding: 18px;
  border-radius: 12px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 270px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(181, 51, 199, 0.3);
}

.update-status-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(181, 51, 199, 0.3);
  padding-bottom: 10px;
}

.update-status-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  font-family: 'Poppins', sans-serif;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
}

.close-button {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0 5px;
}

.version {
  margin: 12px 0 0 0;
  font-size: 11px;
  font-family: 'Poppins', sans-serif;
  color: rgba(255, 255, 255, 0.35);
  width: 100%;
  text-align: right;
}

.info-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: #b533c7;
  color: white;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 999;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.info-button:hover {
  background-color: #9d2fad;
  transform: scale(1.05);
}

.info-button svg {
  width: 24px;
  height: 24px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media only screen and (max-width: 768px) {
  .info-button {
    width: 40px;
    height: 40px;
    bottom: 15px;
    right: 15px;
  }

  .info-button svg {
    width: 20px;
    height: 20px;
  }

  .update-status-container {
    bottom: 65px;
    right: 15px;
    width: 200px;
    max-width: 80%;
    max-height: 150px;
    padding: 12px;
  }
}

@media (max-width: 768px) {
  .boly-slide {
    padding: 1.5rem;
  }

  .boly-carousel-content .carousel__slide {
    touch-action: pan-y;
  }

  .boly-carousel-content .carousel__pagination {
    margin-top: 10px;
  }

  .boly-carousel-content .carousel__pagination-button {
    padding: 5px;
  }
}
</style>

<style>
/* Global pink carousel navigation buttons */
.carousel__prev,
.carousel__next {
  background: rgb(247, 70, 171) !important;
  background-color: rgb(247, 70, 171) !important;
  border-radius: 50% !important;
  width: 50px !important;
  height: 50px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.carousel__prev:hover,
.carousel__next:hover {
  background: rgb(227, 50, 151) !important;
  background-color: rgb(227, 50, 151) !important;
}

.carousel__icon {
  fill: white !important;
}
</style>
