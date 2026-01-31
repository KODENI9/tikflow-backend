import { Request, Response } from "express";
import { db } from "../config/firebase";
import { Transaction } from "../models/Transaction";

// 1. Récupérer les transactions en attente
export const getPendingTransactions = async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("transactions")
      .where("status", "==", "pending")
      .orderBy("created_at", "desc")
      .get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.status(200).json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 2. LA VALIDATION INTELLIGENTE (Réconciliation SMS + Wallet)
export const verifyAndCredit = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    const result = await db.runTransaction(async (t) => {
      const userTransRef = db
        .collection("transactions")
        .doc(transactionId as string);
      const userTransDoc = await t.get(userTransRef);
      const userTrans = userTransDoc.data() as Transaction;

      if (!userTransDoc.exists || userTrans.status !== "pending") {
        throw new Error("Demande invalide ou déjà traitée.");
      }

      // Chercher le SMS correspondant
      const smsQuery = await db
        .collection("received_payments")
        .where("ref_id", "==", userTrans.ref_id)
        .where("status", "==", "unused")
        .limit(1)
        .get();

      if (smsQuery.empty)
        throw new Error("Aucun paiement SMS trouvé avec ce Ref ID.");

      const smsDoc = smsQuery.docs[0];
      const smsData = smsDoc.data();

      if (smsData.amount < userTrans.amount_cfa) {
        throw new Error(`Montant SMS (${smsData.amount}) insuffisant.`);
      }

      // Actions Atomiques
      const walletRef = db.collection("wallets").doc(userTrans.user_id);
      const walletDoc = await t.get(walletRef);
      const currentBalance = walletDoc.exists ? walletDoc.data()?.balance : 0;

      t.set(
        walletRef,
        {
          balance: currentBalance + userTrans.amount_cfa,
          updated_at: new Date(),
        },
        { merge: true },
      );
      t.update(smsDoc.ref, { status: "used" });
      t.update(userTransRef, { status: "completed", updated_at: new Date() });
      // envoie d'une notification à l'utilisateur :
      const notification = {
        user_id: userTrans.user_id,
        title: "Compte Crédité ! 🎉",
        message: `Votre recharge de ${userTrans.amount_cfa} CFA a été validée. Votre solde est à jour.`,
        type: "recharge_success",
        read: false,
        created_at: new Date(),
      };
        t.set(db.collection('notifications').doc(), notification);
      return "Paiement vérifié et Wallet crédité !";
    });

    // 4. Réponse au client
    res.status(200).json({ success: true, message: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 3. Mise à jour manuelle (Pour rejets ou livraison TikTok)
export const updateTransactionStatus = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    const { status, admin_note } = req.body;

    const transRef = db.collection("transactions").doc(transactionId as string);
    const transDoc = await transRef.get();
    const transData = transDoc.data() as Transaction;

    if (status === "completed" && transData.type === "recharge") {
      return res
        .status(400)
        .json({
          message: "Utilisez la validation intelligente pour les recharges.",
        });
    }

    await transRef.update({ status, admin_note, updated_at: new Date() });
    res.status(200).json({ success: true, message: "Statut mis à jour." });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 3. Ajouter un nouveau pack de coins
export const createPackage = async (req: Request, res: Response) => {
  try {
    const { name, coins, price_cfa } = req.body;
    const newPackage = {
      name,
      coins: Number(coins),
      price_cfa: Number(price_cfa),
      active: true,
      created_at: new Date(),
    };
    const docRef = await db.collection("packages").add(newPackage);
    res.status(201).json({ success: true, id: docRef.id });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 4. Récupérer les packs (Côté Client)
export const getPackages = async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("packages")
      .where("active", "==", true)
      .get();
    const packages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.status(200).json({ success: true, data: packages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAdminStats = async (req: Request, res: Response) => {
  try {
    // 1. Total des transactions complétées (Ventes réelles)
    const salesSnapshot = await db
      .collection("transactions")
      .where("status", "==", "completed")
      .get();

    let totalRevenue = 0;
    let totalCoinsDelivered = 0;

    salesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.type === "recharge") totalRevenue += data.amount_cfa;
      if (data.type === "achat_coins") totalCoinsDelivered += data.amount_coins;
    });

    // 2. Nombre de demandes en attente
    const pendingSnapshot = await db
      .collection("transactions")
      .where("status", "==", "pending")
      .count()
      .get();

    // 3. Nombre total d'utilisateurs
    const usersSnapshot = await db.collection("users").count().get();

    res.status(200).json({
      success: true,
      data: {
        total_revenue_cfa: totalRevenue,
        total_coins_sold: totalCoinsDelivered,
        pending_requests: pendingSnapshot.data().count,
        total_users: usersSnapshot.data().count,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Récupérer la liste des utilisateurs avec leurs wallets
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    const usersList = [];

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const walletDoc = await db.collection("wallets").doc(doc.id).get();

      usersList.push({
        id: doc.id,
        ...userData,
        balance: walletDoc.exists ? walletDoc.data()?.balance : 0,
      });
    }

    res.status(200).json({ success: true, data: usersList });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReceivedPayments = async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("received_payments")
      .orderBy("received_at", "desc")
      .limit(50)
      .get();

    const payments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.status(200).json({ success: true, data: payments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
