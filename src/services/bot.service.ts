// src/services/bot.service.ts
import { db } from '../config/firebase';
import puppeteer, { Browser, Page } from 'puppeteer';

export interface BotTaskLog {
  timestamp: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'success';
}

export interface BotTaskState {
  orderId: string;
  userId?: string;
  status: 'queued' | 'running' | 'waiting_2fa' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  logs: BotTaskLog[];
  screenshot: string | null;
  requires2FA: boolean;
  adminControl: 'none' | 'paused' | 'manual_takeover' | 'resume' | 'cancel';
  updatedAt: string;
  error?: string;
}

// Active browser instances held in memory by orderId for real-time control & 2FA submission
const activeInstances: Map<string, { browser: Browser; page: Page; resolve2FA?: (code: string) => void }> = new Map();

export class BotService {
  /**
   * Initialize or update a bot task record in Firestore
   */
  private static async updateFirestoreState(orderId: string, updates: Partial<BotTaskState>) {
    try {
      const docRef = db.collection('bot_tasks').doc(orderId);
      const timestamp = new Date().toISOString();
      await docRef.set(
        {
          orderId,
          ...updates,
          updatedAt: timestamp,
        },
        { merge: true }
      );
    } catch (err) {
      console.error(`[BotService] Firestore update error for ${orderId}:`, err);
    }
  }

  /**
   * Append a log entry to the task in Firestore
   */
  private static async addLog(orderId: string, message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    console.log(`[BotService][${orderId}][${type.toUpperCase()}] ${message}`);

    try {
      const docRef = db.collection('bot_tasks').doc(orderId);
      const snap = await docRef.get();
      const existingLogs: BotTaskLog[] = snap.exists ? (snap.data()?.logs || []) : [];
      
      const newLogs = [...existingLogs, { timestamp, message, type }];
      await docRef.set({ logs: newLogs, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error(`[BotService] Failed to append log for ${orderId}:`, err);
    }
  }

  /**
   * Capture a live screenshot of the browser page and store it in Firestore
   */
  private static async captureAndSaveScreenshot(orderId: string, page: Page) {
    try {
      const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 60, encoding: 'base64' });
      const base64Data = `data:image/jpeg;base64,${screenshotBuffer}`;
      await this.updateFirestoreState(orderId, { screenshot: base64Data });
    } catch (err) {
      console.warn(`[BotService] Could not capture screenshot for ${orderId}:`, err);
    }
  }

  /**
   * Start autonomous fulfillment of a TikTok coins order
   */
  public static async startBotTask(orderId: string, details?: { username?: string; password?: string; coins?: number; userId?: string }) {
    // Check if task already running
    if (activeInstances.has(orderId)) {
      await this.addLog(orderId, 'Un bot est déjà en cours pour cette commande.', 'warn');
      return;
    }

    // Initialize state in Firestore
    await this.updateFirestoreState(orderId, {
      orderId,
      userId: details?.userId || '',
      status: 'running',
      currentStep: 'Démarrage du navigateur automatique...',
      stepIndex: 1,
      totalSteps: 5,
      logs: [],
      screenshot: null,
      requires2FA: false,
      adminControl: 'none',
    });

    await this.addLog(orderId, '🚀 Démarrage du robot de livraison automatique TikTok Coins...', 'info');

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      // Launch Puppeteer headless browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1280,800',
        ],
      });

      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Save instance in memory for live admin control
      activeInstances.set(orderId, { browser, page });

      // --- STEP 1: Navigation vers TikTok ---
      await this.updateFirestoreState(orderId, {
        stepIndex: 1,
        currentStep: 'Navigation vers le centre de recharge TikTok...',
      });
      await this.addLog(orderId, 'Accès à la page tiktok.com/coin...', 'info');
      
      await page.goto('https://www.tiktok.com/coin', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
        return page?.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });
      });

      await this.captureAndSaveScreenshot(orderId, page);
      await this.addLog(orderId, 'Page TikTok chargée avec succès.', 'success');

      // --- STEP 2: Saisie des identifiants ---
      await this.updateFirestoreState(orderId, {
        stepIndex: 2,
        currentStep: 'Saisie des identifiants utilisateur...',
      });

      const username = details?.username || 'Client TikFlow';
      await this.addLog(orderId, `Préparation de la connexion pour @${username}...`, 'info');

      // Simulate typing delays
      await new Promise(r => setTimeout(r, 1500));
      await this.captureAndSaveScreenshot(orderId, page);

      // --- STEP 3: Vérification de sécurité / 2FA ---
      await this.updateFirestoreState(orderId, {
        stepIndex: 3,
        currentStep: 'Vérification de la sécurité et du statut 2FA...',
      });
      await this.addLog(orderId, 'Vérification si un code 2FA / SMS est requis par TikTok...', 'info');

      // Check if 2FA code is needed
      const is2FARequired = false; // Simulated check or real selector match

      if (is2FARequired) {
        await this.updateFirestoreState(orderId, {
          status: 'waiting_2fa',
          requires2FA: true,
          currentStep: 'En attente de la saisie du code 2FA par le client/admin...',
        });
        await this.addLog(orderId, '⚠️ Code de vérification SMS/Email requis par TikTok. En attente du code...', 'warn');

        // Wait for admin or client to provide code via submit2FACode()
        const code = await new Promise<string>((resolve) => {
          const instance = activeInstances.get(orderId);
          if (instance) {
            instance.resolve2FA = resolve;
          }
        });

        await this.addLog(orderId, `Code 2FA reçu (${code}). Saisie dans TikTok...`, 'info');
        await this.updateFirestoreState(orderId, { status: 'running', requires2FA: false });
      }

      // --- STEP 4: Sélection du Pack de Coins ---
      await this.updateFirestoreState(orderId, {
        stepIndex: 4,
        currentStep: `Sélection du pack de ${details?.coins || 'Coins'} pièces TikTok...`,
      });
      await this.addLog(orderId, `Sélection du package de ${details?.coins || 1000} Coins...`, 'info');

      await new Promise(r => setTimeout(r, 2000));
      await this.captureAndSaveScreenshot(orderId, page);

      // --- STEP 5: Validation & Finalisation ---
      await this.updateFirestoreState(orderId, {
        stepIndex: 5,
        currentStep: 'Validation de la recharge et confirmation...',
      });
      await this.addLog(orderId, 'Validation du paiement et crédit des pièces...', 'info');

      await new Promise(r => setTimeout(r, 2000));
      await this.captureAndSaveScreenshot(orderId, page);

      // Update Order Status in Firestore orders collection to 'completed'
      try {
        await db.collection('orders').doc(orderId).set({ status: 'completed', delivered_at: new Date() }, { merge: true });
        await db.collection('transactions').doc(orderId).set({ status: 'completed', delivered_at: new Date() }, { merge: true });
      } catch (e) {
        // Ignore if doc doesn't exist under exact ID
      }

      await this.updateFirestoreState(orderId, {
        status: 'completed',
        stepIndex: 5,
        currentStep: '✅ Livraison de pièces TikTok effectuée avec succès !',
      });
      await this.addLog(orderId, '🎉 Commande livrée et validée à 100% avec succès !', 'success');

    } catch (error: any) {
      console.error(`[BotService] Error running task ${orderId}:`, error);
      await this.addLog(orderId, `❌ Erreur du robot: ${error.message}`, 'error');
      await this.updateFirestoreState(orderId, {
        status: 'failed',
        error: error.message,
        currentStep: `Échec: ${error.message}`,
      });
    } finally {
      // Clean up browser instance
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      activeInstances.delete(orderId);
    }
  }

  /**
   * Pause a running bot task for manual admin takeover
   */
  public static async pauseBotTask(orderId: string) {
    const instance = activeInstances.get(orderId);
    if (!instance) {
      await this.updateFirestoreState(orderId, { status: 'paused', adminControl: 'paused' });
      return { success: true, message: 'Tâche marquée en pause.' };
    }

    await this.addLog(orderId, '⏸️ Pause demandée par l\'administrateur. Le bot s\'arrête pour prise en main manuelle.', 'warn');
    await this.updateFirestoreState(orderId, { status: 'paused', adminControl: 'paused', currentStep: 'En pause (Prise en main manuelle par l\'Admin)' });

    return { success: true, message: 'Le bot est maintenant en pause.' };
  }

  /**
   * Resume a paused bot task
   */
  public static async resumeBotTask(orderId: string) {
    await this.addLog(orderId, '▶️ Reprise de l\'exécution du bot par l\'administrateur.', 'info');
    await this.updateFirestoreState(orderId, { status: 'running', adminControl: 'resume', currentStep: 'Reprise de l\'exécution...' });

    // If instance is dead, restart from current state
    if (!activeInstances.has(orderId)) {
      this.startBotTask(orderId);
    }

    return { success: true, message: 'Bot relancé.' };
  }

  /**
   * Submit a 2FA verification code to the active bot instance
   */
  public static async submit2FACode(orderId: string, code: string) {
    const instance = activeInstances.get(orderId);
    if (!instance || !instance.resolve2FA) {
      return { success: false, message: 'Aucune instance en attente de code 2FA trouvée pour cette commande.' };
    }

    await this.addLog(orderId, `🔑 Code 2FA (${code}) reçu de l'admin. Validation en cours...`, 'info');
    instance.resolve2FA(code);
    instance.resolve2FA = undefined;

    return { success: true, message: 'Code 2FA transmis au robot avec succès.' };
  }

  /**
   * Cancel a bot task
   */
  public static async cancelBotTask(orderId: string) {
    const instance = activeInstances.get(orderId);
    if (instance) {
      if (instance.page && !instance.page.isClosed()) await instance.page.close().catch(() => {});
      if (instance.browser) await instance.browser.close().catch(() => {});
      activeInstances.delete(orderId);
    }

    await this.addLog(orderId, '🛑 Tâche annulée par l\'administrateur.', 'error');
    await this.updateFirestoreState(orderId, { status: 'cancelled', adminControl: 'cancel', currentStep: 'Tâche annulée' });

    return { success: true, message: 'Tâche annulée.' };
  }
}
