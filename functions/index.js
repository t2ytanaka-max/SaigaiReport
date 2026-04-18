const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

// 1. 災害報告（reports）が作成されたときの自動送信トリガー
exports.sendReportNotification = onDocumentCreated("reports/{reportId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const title = `🚨災害情報: ${data.corp}より報告`;
    const body = data.category + (data.memo ? `\n${data.memo}` : '');

    return sendMulticastNotification(title, body, {
        type: 'report',
        reportId: event.params.reportId
    });
});

// 2. ライブ配信（live_streams）が開始されたときの自動送信トリガー
exports.sendLiveNotification = onDocumentCreated("live_streams/{liveId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    if (data.status !== "LIVE") return null;

    const title = `🔴LIVE配信開始: ${data.corp}`;
    const body = '現場からの生中継が開始されました';

    return sendMulticastNotification(title, body, {
        type: 'live',
        liveId: event.params.liveId
    });
});

// 全端末（FCMトークン）へ一斉送信する共通プログラム
async function sendMulticastNotification(title, body, dataPayload) {
    const db = admin.firestore();
    
    // 全デバイスのトークンを取得
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
        console.log('No tokens found. Skipping notification.');
        return null;
    }

    const tokens = [];
    tokensSnapshot.forEach(doc => {
        const t = doc.data().token;
        if (t) tokens.push(t);
    });

    if (tokens.length === 0) return null;

    // 送信メッセージの設定（通知内容＋PWA特有の設定）
    const message = {
        tokens: tokens,
        notification: {
            title: title,
            body: body
        },
        data: dataPayload,
        // Web Push向けの設定（Android等での表示とバイブレーション）
        webpush: {
            notification: {
                icon: "/pwa-192x192.png",
                vibrate: [200, 100, 200, 100, 500], // 強力なバイブレーションパターン
                renotify: true,
                tag: "saigai-report-notification"
            },
            fcmOptions: {
                link: "/" // 通知をタップしたときにアプリを開く
            }
        }
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`${response.successCount} 通の送信に成功しました。`);
        
        // 使えなくなった古いトークン（アプリ削除等）のお掃除
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                }
            });
            console.log('無効なトークンを削除します:', failedTokens.length, '件');
            
            const deletePromises = [];
            failedTokens.forEach((failedToken) => {
                const q = db.collection('fcm_tokens').where('token', '==', failedToken).get()
                    .then(querySnapshot => {
                        querySnapshot.forEach(doc => {
                            deletePromises.push(doc.ref.delete());
                        });
                    });
            });
            await Promise.all(deletePromises);
        }
    } catch (error) {
        console.error('送信エラーが発生しました:', error);
    }
    return null;
}
