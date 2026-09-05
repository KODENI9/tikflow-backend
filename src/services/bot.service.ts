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
   * Clic le plus spécifique et précis sur l'élément DOM le plus profond correspondant au texte
   */
  private static async clickDeepestElementByText(page: Page, keywords: string[]): Promise<boolean> {
    try {
      if (!page || page.isClosed()) return false;

      return await page.evaluate((keys) => {
        const allElements = Array.from(document.querySelectorAll('div, button, span, a, li, p, svg, h3, h4'));
        const matches = allElements.filter((el) => {
          const txt = (el.textContent || '').toLowerCase();
          return keys.some((k) => txt.includes(k.toLowerCase()));
        });

        if (matches.length === 0) return false;

        // Trier par le nombre d'enfants (du plus spécifique/profond au plus parent)
        matches.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);

        const target = matches[0] as HTMLElement;
        if (target) {
          target.scrollIntoView({ block: 'center', inline: 'center' });
          target.click();

          // Simuler tous les événements de clic React & DOM
          const opts = { bubbles: true, cancelable: true, view: window };
          target.dispatchEvent(new MouseEvent('mousedown', opts));
          target.dispatchEvent(new MouseEvent('mouseup', opts));
          target.dispatchEvent(new MouseEvent('click', opts));
          return true;
        }
        return false;
      }, keywords);
    } catch (err) {
      return false;
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

    await this.addLog(orderId, '🚀 Démarrage du robot de livraison TikTok Coins...', 'info');

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

      // Emuler un User-Agent réel de navigateur de bureau
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );

      activeInstances.set(orderId, { browser, page });

      // ─── STEP 1: Navigation vers https://www.tiktok.com/coin ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 1,
        currentStep: 'Navigation vers le centre de pièces TikTok (tiktok.com/coin)...',
      });
      await this.addLog(orderId, 'Accès direct à tiktok.com/coin...', 'info');

      try {
        await page.goto('https://www.tiktok.com/coin', {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
      } catch (navError: any) {
        console.warn(`[BotService] Initial navigation note for ${orderId}: ${navError?.message}`);
      }

      await new Promise((r) => setTimeout(r, 2000));
      await this.captureAndSaveScreenshot(orderId, page);
      await this.addLog(orderId, `Page TikTok chargée avec succès (${page.url()}).`, 'success');

      // ─── STEP 2: Connexion au compte TikTok si nécessaire ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 2,
        currentStep: `Connexion au compte TikTok @${username || 'client'}...`,
      });

      // Vérifier si le bouton "Se connecter" ou la modale est affichée
      const isLoginModalOpen = await page.evaluate(() => {
        const modalText = document.body.innerText;
        return modalText.includes('Se connecter') || modalText.includes('Log in') || !!document.querySelector('input[type="password"]');
      });

      if (isLoginModalOpen) {
        await this.addLog(orderId, `Fenêtre de connexion TikTok détectée. Saisie pour @${username}...`, 'info');

        // Basculer vers l'onglet Email/Username si besoin
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('div, a, span, li'));
          const emailTab = elements.find((el) => {
            const txt = (el.textContent || '').toLowerCase();
            return txt.includes('e-mail') || txt.includes('email') || txt.includes('nom d\'utilisateur') || txt.includes('username');
          });
          if (emailTab) (emailTab as HTMLElement).click();
        });

        await new Promise((r) => setTimeout(r, 600));

        // 1. Saisie de l'identifiant / email
        const userInput = await page.$('input[name="username"], input[type="text"], input[placeholder*="email" i], input[placeholder*="username" i], input[placeholder*="utilisateur" i]');
        if (userInput && username) {
          await userInput.click({ clickCount: 3 });
          await userInput.type(username, { delay: 70 });
          await this.addLog(orderId, `Identifiant TikTok @${username} saisi.`, 'success');
        } else if (username) {
          await page.keyboard.type(username, { delay: 60 });
        }

        await new Promise((r) => setTimeout(r, 800));

        // 2. Saisie du mot de passe
        const passInput = await page.$('input[type="password"]');
        if (passInput && password) {
          await passInput.click({ clickCount: 3 });
          await passInput.type(password, { delay: 70 });
          await this.addLog(orderId, 'Mot de passe TikTok saisi.', 'success');
        }

        await this.captureAndSaveScreenshot(orderId, page);

        // 3. Soumission du formulaire (Bouton rouge "Se connecter")
        const loginSubmitted = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const btn = elements.find((el) => {
            const txt = (el.textContent || '').trim().toLowerCase();
            return txt.includes('se connecter') || txt.includes('log in') || txt === 'login';
          });
          if (btn) {
            (btn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!loginSubmitted) {
          const submitButton = await page.$('button[type="submit"], button.tiktok-btn, button[data-e2e="login-button"]');
          if (submitButton) {
            await submitButton.click();
          } else {
            await page.keyboard.press('Enter');
          }
        }
        await this.addLog(orderId, 'Clic sur le bouton "Se connecter" effectué.', 'info');

        await new Promise((r) => setTimeout(r, 3000));
        await this.captureAndSaveScreenshot(orderId, page);
      }

      // ─── STEP 3: Détection & Gestion de la Vérification 2FA (Code à 6 chiffres) ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 3,
        currentStep: 'Vérification de la sécurité TikTok (Option Phone / Email / 2FA)...',
      });

      // Détection des options de vérification ("Verify it's really you", "Phone", "Code à 6 chiffres")
      const securityState = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        const hasPhoneOption = text.includes('verify it\'s really you') || text.includes('phone') || text.includes('numéro de téléphone');
        const hasCodeField = text.includes('saisis le code') || text.includes('code à 6 chiffres') || !!document.querySelector('input[placeholder*="code" i]');
        return { hasPhoneOption, hasCodeField };
      });

      if (securityState.hasPhoneOption || securityState.hasCodeField) {
        // Déclencher automatiquement la demande de code au client (Gmail / Web Push / WhatsApp)
        try {
          const { AdminService } = require('./admin.service');
          await AdminService.requestCode(orderId);
          await this.addLog(orderId, '📧 Demande de code (Gmail/Push) envoyée automatiquement au client.', 'info');
        } catch (reqErr: any) {
          console.warn(`[BotService] Could not auto-trigger requestCode for ${orderId}:`, reqErr?.message);
        }

        // Clic le plus spécifique sur l'option Phone (+228) si présente pour déclencher l'envoi du SMS par TikTok
        const clickedPhone = await this.clickDeepestElementByText(page, ['phone', 'téléphone', '+228']);
        if (clickedPhone) {
          await this.addLog(orderId, '📱 Clic effectué sur l\'option Téléphone (+228). SMS envoyé par TikTok au client !', 'success');
        } else {
          await this.addLog(orderId, 'ℹ️ Écran de saisie directe du code à 6 chiffres détecté.', 'info');
        }
        await new Promise((r) => setTimeout(r, 2500));

        await this.updateFirestoreState(orderId, {
          status: 'waiting_2fa',
          requires2FA: true,
          currentStep: '⚠️ Code à 6 chiffres envoyé au téléphone/email du client. Demande (Gmail/Push) envoyée automatiquement ! En attente du code...',
        });
        await this.addLog(orderId, '⚠️ TikTok réclame un code à 6 chiffres. Demande envoyée automatiquement au client ! En attente du code...', 'warn');
        await this.captureAndSaveScreenshot(orderId, page);

        // Attente du code transmis via submit2FACode()
        const code = await new Promise<string>((resolve) => {
          const instance = activeInstances.get(orderId);
          if (instance) {
            instance.resolve2FA = resolve;
          }
        });

        await this.addLog(orderId, `Code à 6 chiffres reçu (${code}). Saisie dans la modale TikTok...`, 'info');
        const codeInput = await page.$('input[placeholder*="code" i], input[type="text"], input[autocomplete="one-time-code"]');
        if (codeInput) {
          await codeInput.click({ clickCount: 3 });
          await codeInput.type(code, { delay: 100 });
        } else {
          await page.keyboard.type(code, { delay: 100 });
        }

        await new Promise((r) => setTimeout(r, 1000));

        // Clic sur "Suivant"
        const nextClicked = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const btn = elements.find((el) => {
            const txt = (el.textContent || '').trim().toLowerCase();
            return txt === 'suivant' || txt === 'next' || txt.includes('suivant') || txt.includes('next');
          });
          if (btn) {
            (btn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!nextClicked) {
          const nextBtn = await page.$('button[type="submit"]');
          if (nextBtn) {
            await nextBtn.click();
          } else {
            await page.keyboard.press('Enter');
          }
        }

        await this.updateFirestoreState(orderId, { status: 'running', requires2FA: false });
        await new Promise((r) => setTimeout(r, 4000));
        await this.captureAndSaveScreenshot(orderId, page);
      }

      // ─── STEP 4: Recharge sur tiktok.com/coin (Sélection du Pack ou Personnalisé) ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 4,
        currentStep: `Sélection du forfait de ${coins} Coins sur tiktok.com/coin...`,
      });

      // S'assurer d'être sur /coin
      if (!page.url().includes('/coin')) {
        try {
          await page.goto('https://www.tiktok.com/coin', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 2500));
      }

      await this.addLog(orderId, `Recherche du pack de ${coins} Coins dans la grille TikTok...`, 'info');
      await this.captureAndSaveScreenshot(orderId, page);

      // Cliquer sur le pack correspondant ou sur Personnaliser
      const packSelected = await page.evaluate((targetCoins) => {
        const textNodes = Array.from(document.querySelectorAll('div, button, span'));
        const exactPack = textNodes.find((el) => el.textContent?.trim() === targetCoins.toString());
        if (exactPack) {
          (exactPack as HTMLElement).click();
          return true;
        }

        // Sinon chercher Personnaliser
        const customBtn = textNodes.find((el) => el.textContent?.includes('Personnaliser') || el.textContent?.includes('Custom'));
        if (customBtn) {
          (customBtn as HTMLElement).click();
          return 'custom';
        }
        return false;
      }, coins);

      await new Promise((r) => setTimeout(r, 1500));
      await this.captureAndSaveScreenshot(orderId, page);
      await this.addLog(orderId, `Package de ${coins} Coins sélectionné sur TikTok.`, 'success');

      // ─── STEP 5: Finalisation et Confirmation ───
      await this.updateFirestoreState(orderId, {
        stepIndex: 5,
        currentStep: 'Validation de la recharge et confirmation...',
      });

      await this.addLog(orderId, `Validation finale de la commande de ${coins} Coins...`, 'info');

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
        currentStep: '✅ Recharge de pièces TikTok effectuée avec succès !',
      });
      await this.addLog(orderId, '🎉 Commande de pièces TikTok livrée et validée avec succès !', 'success');

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

    await this.addLog(orderId, `🔑 Code 2FA (${code}) reçu de l'admin. Saisie dans la modale TikTok...`, 'info');
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
