import Dexie from 'dexie';

export const db = new Dexie('DisasterReportDB');

db.version(1).stores({
    drafts: '++id, updated_at',
    outbox: '++id, created_at, status',
    history: 'id, created_at, corp, category'
});

// Version 2: Switch 'outbox' to use string UUIDs (not auto-increment)
db.version(2).stores({
    drafts: '++id, updated_at',
    outbox: 'id, created_at, status', // Removed ++
    history: 'id, created_at, corp, category'
}).upgrade(tx => {
    // Clear outbox to avoid ID type conflicts during migration
    return tx.table('outbox').clear();
});

export const saveDraft = async (data) => {
    await db.drafts.put({ id: 1, data, updated_at: new Date() });
};

export const getDraft = async () => {
    return await db.drafts.get(1);
};

export const clearDraft = async () => {
    await db.drafts.delete(1);
};

export const addToOutbox = async (reportData) => {
    // Generate UUID if not present (Client-side ID generation)
    // Fallback to random string if crypto is not available (e.g. non-secure context)
    const id = reportData.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    // Ensure the data blob contains the ID too
    const dataWithId = { ...reportData, id };

    await db.outbox.put({
        id: id,
        data: dataWithId,
        created_at: new Date(),
        status: 'pending'
    });
    return id;
};

export const getOutbox = async () => {
    return await db.outbox.toArray();
};

export const deleteFromOutbox = async (id) => {
    await db.outbox.delete(id);
};

export const updateStatus = async (id, status) => {
    await db.outbox.update(id, { status });
};
