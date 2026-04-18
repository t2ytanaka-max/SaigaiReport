import { precacheAndRoute } from 'workbox-precaching';

// Vite PWA プラグインがビルド時にキャッシュ対象のファイルリストを注入します
precacheAndRoute(self.__WB_MANIFEST);

// Firebase FCM ライブラリのインポート（バックグラウンド処理用）
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Firebaseの初期化（config.jsと同じ設定）
firebase.initializeApp({
  apiKey: "AIzaSyDfDCyM8Ij-61hiGQnZlhfag_d6zJbHNyc",
  authDomain: "live-saigai-report.firebaseapp.com",
  projectId: "live-saigai-report",
  storageBucket: "live-saigai-report.firebasestorage.app",
  messagingSenderId: "418959728754",
  appId: "1:418959728754:web:9bb7f856ef95bd52cf22eb"
});

const messaging = firebase.messaging();

// アプリが閉じている時（バックグラウンド）の通知受信ハンドラ
messaging.onBackgroundMessage((payload) => {
  console.log('[src/sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Live大村市消防団（緊急）';
  const notificationOptions = {
    body: payload.notification?.body || '新しい通知があります',
    icon: '/pwa-192x192.png',
    data: payload.data, // クリック時の遷移先情報など
    tag: 'saigai-report-notification', // 同じタグで上書き（複数通知の乱立防止）
    renotify: true, // 上書き時も音を鳴らす
    vibrate: [200, 100, 200, 100, 500] // Androidの強力なバイブレーションパターン
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
