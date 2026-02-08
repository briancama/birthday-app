/**
 * Firebase Phone Authentication Service
 * Handles phone verification via OTP and linking with Supabase users
 * Uses Firebase compat SDK (global firebase object loaded via script tags)
 */

import { FIREBASE_CONFIG } from '../config.js';

class FirebaseAuthService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.recaptchaVerifier = null;
    this.confirmationResult = null;
  }

  /**
   * Initialize Firebase app and auth
   */
  async init() {
    try {
      // Firebase compat API - firebase is global from script tags
      if (!window.firebase) {
        throw new Error('Firebase SDK not loaded globally. Check script tags in HTML.');
      }

      this.app = firebase.initializeApp(FIREBASE_CONFIG);
      this.auth = firebase.auth();
      
      console.log('✅ Firebase initialized');
      return this;
    } catch (err) {
      console.error('✖️ Firebase init failed:', err);
      throw err;
    }
  }

  /**
   * Setup reCAPTCHA verifier for phone auth
   * @param {string} containerId - ID of element to render reCAPTCHA
   */
  async setupRecaptcha(containerId) {
    try {
      if (!this.auth) {
        throw new Error('Firebase auth not initialized. Call init() first.');
      }

      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error(`Container with ID "${containerId}" not found`);
      }

      // Wait a moment to ensure auth is fully ready
      await new Promise(resolve => setTimeout(resolve, 100));

      this.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
        size: 'invisible',
        callback: (token) => {
          console.log('✅ reCAPTCHA verified');
        },
        'expired-callback': () => {
          console.warn('⚠️ reCAPTCHA expired');
          if (this.recaptchaVerifier) {
            this.recaptchaVerifier.clear();
            this.recaptchaVerifier = null;
          }
        }
      });

      console.log('✅ reCAPTCHA setup complete');
      return this;
    } catch (err) {
      console.error('✖️ reCAPTCHA setup failed:', err);
      throw err;
    }
  }

  /**
   * Send OTP to phone number (E.164 format: +16175551234)
   * @param {string} phoneNumber - Phone in E.164 format
   * @returns {Promise<Object>} Confirmation result for verification
   */
  async sendOTP(phoneNumber) {
    try {
      if (!this.recaptchaVerifier) {
        throw new Error('reCAPTCHA not initialized. Call setupRecaptcha() first.');
      }

      // signInWithPhoneNumber returns a ConfirmationResult
      this.confirmationResult = await this.auth.signInWithPhoneNumber(
        phoneNumber, 
        this.recaptchaVerifier
      );
      
      console.log('✅ OTP sent to', phoneNumber);
      
      return this.confirmationResult;
    } catch (err) {
      console.error('✖️ Failed to send OTP:', err);
      // Clear reCAPTCHA on error so it can be tried again
      if (this.recaptchaVerifier) {
        this.recaptchaVerifier.clear();
        this.recaptchaVerifier = null;
      }
      throw err;
    }
  }

  /**
   * Verify OTP code entered by user
   * @param {string} code - 6-digit code from SMS
   * @returns {Promise<Object>} Firebase user credential with uid
   */
  async verifyOTP(code) {
    try {
      if (!this.confirmationResult) {
        throw new Error('No confirmation result. Send OTP first.');
      }

      const userCredential = await this.confirmationResult.confirm(code);
      
      console.log('✅ OTP verified successfully');
      
      return userCredential;
    } catch (err) {
      console.error('✖️ Failed to verify OTP:', err);
      throw err;
    }
  }

  /**
   * Get current Firebase user
   * @returns {Object|null} Firebase user object or null
   */
  getCurrentUser() {
    return this.auth?.currentUser || null;
  }

  /**
   * Sign out from Firebase
   */
  async signOut() {
    try {
      await this.auth.signOut();
      this.confirmationResult = null;
      console.log('✅ Signed out from Firebase');
    } catch (err) {
      console.error('✖️ Sign out failed:', err);
      throw err;
    }
  }

  /**
   * On auth state changed listener
   * @param {Function} callback - Called with user object or null
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChanged(callback) {
    return this.auth.onAuthStateChanged(callback);
  }
}

export const firebaseAuth = new FirebaseAuthService();
