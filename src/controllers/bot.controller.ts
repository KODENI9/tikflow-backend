// src/controllers/bot.controller.ts
import { Request, Response } from 'express';
import { BotService } from '../services/bot.service';
import { db } from '../config/firebase';

export class BotController {
  // Lancer ou relancer manuellement un robot pour une commande
  public static async start(req: Request, res: Response) {
    try {
      const { orderId, username, password, coins, userId } = req.body;
      if (!orderId) {
        return res.status(400).json({ success: false, error: 'Identifiant de commande (orderId) requis.' });
      }

      // Launch async bot worker
      BotService.startBotTask(orderId, { username, password, coins, userId });

      return res.status(200).json({
        success: true,
        message: 'Robot de livraison démarré en arrière-plan.',
        orderId,
      });
    } catch (error: any) {
      console.error('[BotController.start] Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Mettre en pause le bot
  public static async pause(req: Request, res: Response) {
    try {
      const orderId = req.params.orderId as string;
      const result = await BotService.pauseBotTask(orderId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Reprendre l'exécution
  public static async resume(req: Request, res: Response) {
    try {
      const orderId = req.params.orderId as string;
      const result = await BotService.resumeBotTask(orderId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Transmettre le code 2FA au bot
  public static async submit2FA(req: Request, res: Response) {
    try {
      const orderId = req.params.orderId as string;
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'Code 2FA requis.' });
      }

      const result = await BotService.submit2FACode(orderId, code);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Annuler le bot
  public static async cancel(req: Request, res: Response) {
    try {
      const orderId = req.params.orderId as string;
      const result = await BotService.cancelBotTask(orderId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Obtenir l'état d'un robot
  public static async getTask(req: Request, res: Response) {
    try {
      const orderId = req.params.orderId as string;
      const docSnap = await db.collection('bot_tasks').doc(orderId).get();
      if (!docSnap.exists) {
        return res.status(404).json({ success: false, error: 'Aucune tâche bot trouvée pour cette commande.' });
      }

      return res.status(200).json({ success: true, task: docSnap.data() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Obtenir toutes les tâches bots actives
  public static async getAllTasks(req: Request, res: Response) {
    try {
      const snapshot = await db.collection('bot_tasks').limit(20).get();
      const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ success: true, tasks });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
