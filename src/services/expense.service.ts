import { firestore } from '../config/firebase';
import { v4 as uuidv4 } from 'uuid';

export interface ExpenseRecord {
    id: string;
    title: string;
    amount: number;
    type: 'EXPENSE' | 'REVENUE';
    category: string;
    date: string; // ISO date string
    createdAt: string;
    createdBy: string; // admin user ID
}

export class ExpenseService {
    private static collection = firestore.collection('admin_expenses');

    public static async addRecord(data: Omit<ExpenseRecord, 'id' | 'createdAt'>): Promise<string> {
        const id = uuidv4();
        const record: ExpenseRecord = {
            ...data,
            id,
            createdAt: new Date().toISOString()
        };

        await this.collection.doc(id).set(record);
        return id;
    }

    public static async getAllRecords(): Promise<ExpenseRecord[]> {
        const snapshot = await this.collection.orderBy('date', 'desc').get();
        const records: ExpenseRecord[] = [];
        snapshot.forEach(doc => {
            records.push(doc.data() as ExpenseRecord);
        });
        return records;
    }

    public static async deleteRecord(id: string): Promise<void> {
        await this.collection.doc(id).delete();
    }
}
