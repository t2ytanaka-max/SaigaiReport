/**
 * 通知設定とデバイス識別を管理するユーティリティ
 */

const STORAGE_KEY_DEVICE_ID = 'saigai_device_id';
const STORAGE_KEY_NOTIF_SETTINGS = 'saigai_notification_settings';

// デバイス固有のIDを取得（なければ生成）
export const getMyDeviceId = () => {
    let id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
    }
    return id;
};

// 通知設定の取得
export const getNotificationSettings = () => {
    const saved = localStorage.getItem(STORAGE_KEY_NOTIF_SETTINGS);
    if (saved) {
        return JSON.parse(saved);
    }
    // デフォルト設定
    return {
        enabled: true,
        soundType: 'default', // 'default', 'alert', 'smart'
        volume: 0.8
    };
};

// 通知設定の保存
export const saveNotificationSettings = (settings) => {
    localStorage.setItem(STORAGE_KEY_NOTIF_SETTINGS, JSON.stringify(settings));
};
