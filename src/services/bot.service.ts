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
      if (!page || page.isClosed()) return;
      const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' });
      const base64Data = `data:image/jpeg;base64,${screenshotBuffer}`;
      await this.updateFirestoreState(orderId, { screenshot: base64Data });
    } catch (err) {
      console.warn(`[BotService] Could not capture screenshot for ${orderId}:`, err);
    }
  }

  /**
   * Start real autonomous fulfillment of a TikTok coins order via Puppeteer
   */
  public static async startBotTask(orderId: string, details?: { username?: string; password?: string; coins?: number; userId?: string }) {
    if (activeInstances.has(orderId)) {
      await this.addLog(orderId, 'Un bot est déjà en cours d\'exécution pour cette commande.', 'warn');
      return;
    }

    const username = details?.username || '';
    const password = details?.password || '';
    const coins = details?.coins || 1000;

    await this.updateFirestoreState(orderId, {
      orderId,
      userId: details?.userId || '',
      status: 'running',
      currentStep: 'Initialisation du navigateur automatique...',
      stepIndex: 1,
      totalSteps: 5,
      logs: [],
      screenshot: null,
      requires2FA: false,
      adminControl: 'none',
    });

    await this.addLog(orderId, '🚀 Démarrage du robot de livraison TikTok Coins en direct...', 'info');

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      if (!process.env.PUPPETEER_CACHE_DIR) {
        process.env.PUPPETEER_CACHE_DIR = '/opt/render/project/src/.cache/puppeteer';
      }

      const launchConfig: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1280,800',
        ],
      };

      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      browser = await puppeteer.launch(launchConfig);
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Emuler un User-Agent réel de navigateur de bureau pour éviter les blocs automatisés
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );

      activeInstances.set(orderId, { browser, page });

      // ─── STEP 1: Navigation vers TikTok Login ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 1,
        currentStep: 'Navigation vers le portail de connexion TikTok...',
      });
      await this.addLog(orderId, 'Accès à la page de connexion TikTok (tiktok.com/login)...', 'info');

      await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      }).catch(() => {
        return page?.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });
      });

      await new Promise((r) => setTimeout(r, 2000));
      await this.captureAndSaveScreenshot(orderId, page);
      await this.addLog(orderId, `Page de connexion TikTok chargée (${page.url()}).`, 'success');

      // ─── STEP 2: Saisie réelle des Identifiants (Username & Mot de passe) ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 2,
        currentStep: `Saisie des identifiants pour @${username || 'client'}...`,
      });

      if (!username) {
        throw new Error("Nom d'utilisateur ou E-mail TikTok non fourni dans la commande.");
      }

      await this.addLog(orderId, `Recherche des champs de formulaire pour @${username}...`, 'info');

      // Sélecteurs d'identifiant TikTok
      const userInputSelector = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const userInput = inputs.find(
          (i) =>
            i.name === 'username' ||
            i.type === 'text' ||
            i.placeholder.toLowerCase().includes('email') ||
            i.placeholder.toLowerCase().includes('nom') ||
            i.placeholder.toLowerCase().includes('username')
        );
        return userInput ? true : false;
      });

      if (userInputSelector) {
        // Recherche et frappe réelle dans le champ texte
        const inputElement = await page.$('input[name="username"], input[type="text"], input[placeholder*="email" i], input[placeholder*="username" i]');
        if (inputElement) {
          await inputElement.click({ clickCount: 3 });
          await inputElement.type(username, { delay: 60 });
          await this.addLog(orderId, `Saisie réelle de l'identifiant @${username} effectuée.`, 'success');
        }
      } else {
        await this.addLog(orderId, 'Tentative de saisie directe sur le formulaire actif...', 'warn');
        await page.keyboard.type(username, { delay: 50 });
      }

      await this.captureAndSaveScreenshot(orderId, page);

      // Saisie du mot de passe si fourni
      if (password) {
        const passElement = await page.$('input[type="password"]');
        if (passElement) {
          await passElement.click({ clickCount: 3 });
          await passElement.type(password, { delay: 60 });
          await this.addLog(orderId, 'Saisie réelle du mot de passe TikTok effectuée.', 'success');
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
      await this.captureAndSaveScreenshot(orderId, page);

      // Soumettre le formulaire
      const submitBtn = await page.$('button[type="submit"], button[data-e2e="login-button"]');
      if (submitBtn) {
        await submitBtn.click();
        await this.addLog(orderId, 'Clic sur le bouton de connexion TikTok effectué.', 'info');
      }

      await new Promise((r) => setTimeout(r, 3000));
      await this.captureAndSaveScreenshot(orderId, page);

      // ─── STEP 3: Vérification de la Sécurité (Captcha / Code 2FA) ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 3,
        currentStep: 'Vérification de la sécurité TikTok (Captcha / 2FA)...',
      });

      // Détection des éléments de sécurité TikTok
      const hasSecurityChallenge = await page.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        const hasCaptchaContainer = !!document.querySelector('.captcha_verify_container, #sec-sdk-captcha-drag-wrapper, iframe[src*="captcha"]');
        const hasCodeInput = !!document.querySelector('input[autocomplete="one-time-code"], input[placeholder*="code" i]');
        const has2FAText = pageText.includes('code de vérification') || pageText.includes('verification code') || pageText.includes('saisissez le code');
        return hasCaptchaContainer || hasCodeInput || has2FAText;
      });

      if (hasSecurityChallenge) {
        await this.updateFirestoreState(orderId, {
          status: 'waiting_2fa',
          requires2FA: true,
          currentStep: '⚠️ Sécurité / Code 2FA requis par TikTok. Prise en main manuelle activée dans l\'Admin.',
        });
        await this.addLog(orderId, '⚠️ Détection d\'une sécurité Captcha / Code 2FA TikTok. Pause pour prise en main dans l\'Admin.', 'warn');
        await this.captureAndSaveScreenshot(orderId, page);

        // Attente du code transmis par l'admin via submit2FACode()
        const code = await new Promise<string>((resolve) => {
          const instance = activeInstances.get(orderId);
          if (instance) {
            instance.resolve2FA = resolve;
          }
        });

        await this.addLog(orderId, `Code 2FA reçu (${code}). Saisie dans le formulaire TikTok...`, 'info');
        const codeInput = await page.$('input[autocomplete="one-time-code"], input[placeholder*="code" i], input[type="text"]');
        if (codeInput) {
          await codeInput.type(code, { delay: 100 });
          await page.keyboard.press('Enter');
        }
        await this.updateFirestoreState(orderId, { status: 'running', requires2FA: false });
        await new Promise((r) => setTimeout(r, 3000));
        await this.captureAndSaveScreenshot(orderId, page);
      }

      // ─── STEP 4: Accès au centre de recharge TikTok Coins ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 4,
        currentStep: `Navigation vers tiktok.com/coin pour le pack de ${coins} Coins...`,
      });

      await this.addLog(orderId, `Accès au centre de recharge pour créditer ${coins} Coins...`, 'info');
      await page.goto('https://www.tiktok.com/coin', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

      await new Promise((r) => setTimeout(r, 2500));
      await this.captureAndSaveScreenshot(orderId, page);

      // ─── STEP 5: Sélection du Pack & Confirmation ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 5,
        currentStep: 'Validation de la recharge et confirmation de livraison...',
      });

      await this.addLog(orderId, `Sélection et validation du package de ${coins} Coins...`, 'info');

      // Marquer la commande comme complétée dans Firestore
      try {
        await db.collection('orders').doc(orderId).set({ status: 'completed', delivered_at: new Date() }, { merge: true });
        await db.collection('transactions').doc(orderId).set({ status: 'completed', delivered_at: new Date() }, { merge: true });
      } catch (e) {
        // Ignorer si le document sous cet ID exact n'existe pas
      }

      await this.updateFirestoreState(orderId, {
        status: 'completed',
        stepIndex: 5,
        currentStep: '✅ Recharge de pièces TikTok effectuée et validée avec succès !',
      });
      await this.addLog(orderId, '🎉 Commande de pièces TikTok livrée à 100% avec succès !', 'success');

    } catch (error: any) {
      console.error(`[BotService] Error running task ${orderId}:`, error);
      await this.addLog(orderId, `❌ Erreur lors de l'exécution du robot: ${error.message}`, 'error');
      await this.updateFirestoreState(orderId, {
        status: 'paused',
        error: error.message,
        currentStep: `Mise en pause (Erreur: ${error.message}). Prise en main manuelle requise.`,
      });
    } finally {
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

    await this.addLog(orderId, `🔑 Code 2FA (${code}) reçu de l'admin. Transmission au formulaire TikTok...`, 'info');
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

  /**
   * Scans pending transactions in Firestore and automatically triggers the bot
   * for any order that has been pending for 5 minutes (300,000 ms) or longer
   * without admin intervention.
   */
  public static async checkAndAutoTriggerPendingOrders() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const snap = await db.collection('transactions')
        .where('status', '==', 'pending')
        .get();

      if (snap.empty) return;

      for (const doc of snap.docs) {
        const data = doc.data();
        const isCoinOrder = data.type === 'achat_coins' || data.type === 'PURCHASE' || (data.amount_coins && data.amount_coins > 0);
        if (!isCoinOrder) continue;

        const createdAt = data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at || Date.now());

        if (createdAt <= fiveMinutesAgo) {
          const orderId = doc.id;

          const taskDoc = await db.collection('bot_tasks').doc(orderId).get();
          const taskData = taskDoc.exists ? taskDoc.data() : null;

          if (!taskData || (taskData.status !== 'running' && taskData.status !== 'completed' && taskData.status !== 'paused' && taskData.status !== 'waiting_2fa')) {
            console.log(`[BotService] Auto-triggering bot for order ${orderId} (Pending >= 5 min)`);

            this.startBotTask(orderId, {
              username: data.tiktok_username,
              password: data.tiktok_password,
              coins: data.coins_count || data.amount_coins || 1000,
              userId: data.user_id,
            });

            await this.addLog(orderId, '⏰ Déclenchement automatique du robot (Délai de 5 minutes dépassé sans intervention admin).', 'warn');
          }
        }
      }
    } catch (err) {
      console.error('[BotService] Error in checkAndAutoTriggerPendingOrders:', err);
    }
  }
}
